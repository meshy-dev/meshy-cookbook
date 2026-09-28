"""Turn a text prompt into an Ultra 4K hero prop GLB with 4K textures."""

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
SAMPLE = (
    "Marrow's sea chest, a closed pirate treasure chest: weathered oak planks, "
    "black iron straps and rivets, a heavy brass padlock, barnacles along the base. "
    "Stylized hand-painted game prop, three-quarter view."
)
OUTPUT = DIRECTORY / "output"


def save_state(path: Path, state: dict) -> None:
    """Atomically checkpoint only the prompt and task IDs, never signed URLs or keys."""
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


def load_state(path: Path, prompt: str | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "prompt", "concept_task_id", "model_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["prompt"], str) or not state["prompt"].strip():
        raise ValueError("Invalid prompt in run.json")
    for key in ("concept_task_id", "model_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["model_task_id"] and not state["concept_task_id"]:
        raise ValueError("run.json has a model task without a concept task")
    if state["creating"] not in (None, "concept", "model"):
        raise ValueError("Invalid creating marker in run.json")
    if prompt is not None and prompt != state["prompt"]:
        raise ValueError("Description differs from run.json; resume with its original description")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(prompt: str | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    if prompt is not None and not prompt.strip():
        raise ValueError("Description cannot be empty")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, prompt)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "prompt": prompt or SAMPLE, "concept_task_id": None, "model_task_id": None, "creating": None}
    client = client if client is not None else Meshy()  # reads MESHY_API_KEY from .env

    concept_id = state["concept_task_id"]
    if concept_id is None:
        state["creating"] = "concept"
        save_state(checkpoint, state)  # if POST is interrupted, do not blindly repeat it
        concept_id = client.create(
            "text-to-image",
            {
                "ai_model": "gpt-image-2-5-sunburst",
                "prompt": state["prompt"],
                "remove_background": True,
            },
        )
        state.update(concept_task_id=concept_id, creating=None)
        save_state(checkpoint, state)
    concept = None
    task_id = state["model_task_id"]
    if task_id is None:
        concept = client.wait("text-to-image", concept_id)
        client.download(concept["image_urls"][0], output / "hero-prop-concept.png")
        state["creating"] = "model"
        save_state(checkpoint, state)
        task_id = client.create(
            "image-to-3d",
            {
                "input_task_id": concept_id,
                "geometry_resolution": "4k",
                "should_texture": True,
                "enable_pbr": True,
                "texture_resolution": "4k",
                "target_formats": ["glb"],
            },
        )
        state.update(model_task_id=task_id, creating=None)
        save_state(checkpoint, state)
    task = client.wait("image-to-3d", task_id)
    client.download(task["model_urls"]["glb"], output / "hero-prop.glb")
    client.download(task["thumbnail_url"], output / "hero-prop-thumbnail.png")
    credits = (
        f"{concept['consumed_credits'] + task['consumed_credits']} credits total"
        if concept is not None
        else f"{task['consumed_credits']} model credits; concept stage excluded"
    )
    print(f"Done: {output / 'hero-prop.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("description", nargs="*")
    args = parser.parse_args()
    run(" ".join(args.description) if args.description else None, args.resume)
