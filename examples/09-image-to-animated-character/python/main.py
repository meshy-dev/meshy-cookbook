"""Turn character concept art into a rigged character with idle, jump and attack clips in one file."""

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # so `shared` imports
from shared.python.meshy import Meshy

DIRECTORY = Path(__file__).resolve().parent
SAMPLE = DIRECTORY.parent / "input/concept-art.png"
ACTIONS = [0, 466, 4]  # Idle, Regular Jump and Attack in the animation library
OUTPUT = DIRECTORY / "output"
STAGES = ("model", "rig", "animation")


def valid_actions(actions) -> bool:
    """One to ten different action ids from the animation library, as non-negative integers."""
    return (
        isinstance(actions, list)
        and 1 <= len(actions) <= 10
        and all(type(action) is int and action >= 0 for action in actions)
        and len(set(actions)) == len(actions)
    )


def save_state(path: Path, state: dict) -> None:
    """Atomically checkpoint only the inputs and task IDs, never signed URLs or keys."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as f:
            temporary = Path(f.name)
            json.dump(state, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def load_state(path: Path, image: str | None, actions: list[int] | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "image", "actions", "model_task_id", "rig_task_id", "animation_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    if not valid_actions(state["actions"]):
        raise ValueError("Invalid actions in run.json")
    ids = [state[f"{stage}_task_id"] for stage in STAGES]
    for stage, value in zip(STAGES, ids):
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {stage}_task_id in run.json")
    if any(later and not earlier for earlier, later in zip(ids, ids[1:])):
        raise ValueError("run.json has a later stage without the stage before it")
    if state["creating"] not in (None, *STAGES):
        raise ValueError("Invalid creating marker in run.json")
    if image is not None and image != state["image"]:
        raise ValueError("Image differs from run.json; resume with its original image")
    if actions is not None and actions != state["actions"]:
        raise ValueError("Actions differ from run.json; resume with its original actions")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(
    actions: list[int] | None = None,
    image: str | None = None,
    resume: bool = False,
    output: Path = OUTPUT,
    client: Meshy | None = None,
) -> None:
    if actions is not None and not valid_actions(actions):
        raise ValueError("Actions must be one to ten different action ids from the animation library")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, image, actions)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {
            "version": 1,
            "image": image or str(SAMPLE),
            "actions": actions or ACTIONS,
            "model_task_id": None,
            "rig_task_id": None,
            "animation_task_id": None,
            "creating": None,
        }
    image_url = Meshy.data_uri(Path(state["image"])) if state["model_task_id"] is None else None
    client = client if client is not None else Meshy()  # reads MESHY_API_KEY from .env

    model_id = state["model_task_id"]
    if model_id is None:
        state["creating"] = "model"
        save_state(checkpoint, state)  # if POST is interrupted, do not blindly repeat it
        model_id = client.create(
            "image-to-3d",
            {
                "image_url": image_url,
                "pose_mode": "a-pose",
                "should_remesh": True,
                "target_polycount": 30000,
                "should_texture": True,
                "enable_pbr": True,
                "target_formats": ["glb"],
            },
        )
        state.update(model_task_id=model_id, creating=None)
        save_state(checkpoint, state)
    model = None
    rig_id = state["rig_task_id"]
    if rig_id is None:
        model = client.wait("image-to-3d", model_id, label="model")
        client.download(model["thumbnail_url"], output / "character-thumbnail.png")
        state["creating"] = "rig"
        save_state(checkpoint, state)
        rig_id = client.create(
            "rigging",
            {
                "input_task_id": model_id,
                "height_meters": 1.8,
            },
        )
        state.update(rig_task_id=rig_id, creating=None)
        save_state(checkpoint, state)
    rig = None
    animation_id = state["animation_task_id"]
    if animation_id is None:
        rig = client.wait("rigging", rig_id, label="rig")
        state["creating"] = "animation"
        save_state(checkpoint, state)
        animation_id = client.create(
            "animations",
            {
                "rig_task_id": rig_id,
                "action_ids": state["actions"],
            },
        )
        state.update(animation_task_id=animation_id, creating=None)
        save_state(checkpoint, state)
    animation = client.wait("animations", animation_id, label="animation")
    result = animation["result"]
    client.download(result["animation_glb_url"], output / "animated-character.glb")
    client.download(result["animation_fbx_url"], output / "animated-character.fbx")
    if model is not None:
        credits = f"{model['consumed_credits'] + rig['consumed_credits'] + animation['consumed_credits']} credits total"
    elif rig is not None:
        credits = f"{rig['consumed_credits'] + animation['consumed_credits']} credits for rig and animation; model stage excluded"
    else:
        credits = f"{animation['consumed_credits']} animation credits; model and rig stages excluded"
    print(f"Done: {output / 'animated-character.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("arguments", nargs="*", help="Action ids from the animation library, then optionally a PNG or JPEG of one standing humanoid character")
    args = parser.parse_args()
    arguments = list(args.arguments)
    image = arguments.pop() if arguments and not arguments[-1].isdigit() else None
    if not all(argument.isdigit() for argument in arguments):
        raise ValueError("Usage: python main.py [--resume] [action_id ...] [image.png]")
    run([int(argument) for argument in arguments] or None, image, args.resume)
