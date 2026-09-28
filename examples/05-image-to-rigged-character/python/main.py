"""Turn character concept art into a rigged GLB with walking and running clips."""

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
OUTPUT = DIRECTORY / "output"


def save_state(path: Path, state: dict) -> None:
    """Atomically checkpoint only the input path and task IDs, never signed URLs or keys."""
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


def load_state(path: Path, image: str | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "image", "model_task_id", "rig_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    for key in ("model_task_id", "rig_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["rig_task_id"] and not state["model_task_id"]:
        raise ValueError("run.json has a rig task without a model task")
    if state["creating"] not in (None, "model", "rig"):
        raise ValueError("Invalid creating marker in run.json")
    if image is not None and image != state["image"]:
        raise ValueError("Image differs from run.json; resume with its original image")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(image: str | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, image)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "image": image or str(SAMPLE), "model_task_id": None, "rig_task_id": None, "creating": None}
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
    rig = client.wait("rigging", rig_id, label="rig")
    result = rig["result"]
    client.download(result["rigged_character_glb_url"], output / "rigged-character.glb")
    client.download(result["rigged_character_fbx_url"], output / "rigged-character.fbx")
    client.download(result["basic_animations"]["walking_glb_url"], output / "walking.glb")
    client.download(result["basic_animations"]["running_glb_url"], output / "running.glb")
    credits = (
        f"{model['consumed_credits'] + rig['consumed_credits']} credits total"
        if model is not None
        else f"{rig['consumed_credits']} rig credits; model stage excluded"
    )
    print(f"Done: {output / 'rigged-character.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("image", nargs="?", help="PNG or JPEG of one standing humanoid character")
    args = parser.parse_args()
    run(args.image, args.resume)
