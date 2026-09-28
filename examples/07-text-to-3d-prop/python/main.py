"""Turn a description into a textured GLB: a text-to-3d preview mesh, then a refine pass for textures."""

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
SAMPLE_PROMPT = (
    "A retro toy rocket ship: a rounded silver body with a red nose cone, three red tail fins, "
    "a round porthole window on the side, standing upright on its fins. Stylized hand-painted game prop."
)
OUTPUT = DIRECTORY / "output"


def save_state(path: Path, state: dict) -> None:
    """Atomically checkpoint only the description and task IDs, never signed URLs or keys."""
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
    keys = {"version", "prompt", "preview_task_id", "refine_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["prompt"], str) or not state["prompt"].strip():
        raise ValueError("Invalid prompt in run.json")
    for key in ("preview_task_id", "refine_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["refine_task_id"] and not state["preview_task_id"]:
        raise ValueError("run.json has a refine task without a preview task")
    if state["creating"] not in (None, "preview", "refine"):
        raise ValueError("Invalid creating marker in run.json")
    if prompt is not None and prompt != state["prompt"]:
        raise ValueError("Prompt differs from run.json; resume with its original prompt")
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
    if prompt is not None and len(prompt) > 800:
        raise ValueError("Description must be 800 characters or fewer")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, prompt)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "prompt": prompt or SAMPLE_PROMPT, "preview_task_id": None, "refine_task_id": None, "creating": None}
    client = client if client is not None else Meshy()  # reads MESHY_API_KEY from .env

    preview_id = state["preview_task_id"]
    if preview_id is None:
        state["creating"] = "preview"
        save_state(checkpoint, state)  # if POST is interrupted, do not blindly repeat it
        preview_id = client.create(
            "text-to-3d",
            {
                "mode": "preview",
                "prompt": state["prompt"],
                "should_remesh": False,
                "target_formats": ["glb"],
            },
        )
        state.update(preview_task_id=preview_id, creating=None)
        save_state(checkpoint, state)
    preview = None
    refine_id = state["refine_task_id"]
    if refine_id is None:
        preview = client.wait("text-to-3d", preview_id, label="preview")
        client.download(preview["thumbnail_url"], output / "preview-thumbnail.png")
        state["creating"] = "refine"
        save_state(checkpoint, state)
        refine_id = client.create(
            "text-to-3d",
            {
                "mode": "refine",
                "preview_task_id": preview_id,
                "enable_pbr": True,
                "target_formats": ["glb"],
            },
        )
        state.update(refine_task_id=refine_id, creating=None)
        save_state(checkpoint, state)
    task = client.wait("text-to-3d", refine_id, label="refine")
    client.download(task["model_urls"]["glb"], output / "textured-prop.glb")
    client.download(task["thumbnail_url"], output / "textured-prop-thumbnail.png")
    credits = (
        f"{preview['consumed_credits'] + task['consumed_credits']} credits total"
        if preview is not None
        else f"{task['consumed_credits']} refine credits; preview stage excluded"
    )
    print(f"Done: {output / 'textured-prop.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("prompt", nargs="?", help="Description of one object, in quotes")
    args = parser.parse_args()
    run(args.prompt, args.resume)
