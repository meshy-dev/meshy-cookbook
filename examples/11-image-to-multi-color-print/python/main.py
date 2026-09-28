"""Build a textured prop from one image, then convert it into a multi-color 3MF for a multi-filament printer."""

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
SAMPLE_IMAGE = DIRECTORY.parent / "input/sea-chest.png"
SAMPLE_STYLE = "realistic"
STYLES = ("realistic", "cartoon")
OUTPUT = DIRECTORY / "output"


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


def load_state(path: Path, image: str | None, style: str | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "image", "style", "model_task_id", "print_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    if state["style"] not in STYLES:
        raise ValueError("Invalid style in run.json")
    for key in ("model_task_id", "print_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["print_task_id"] and not state["model_task_id"]:
        raise ValueError("run.json has a print task without a model task")
    if state["creating"] not in (None, "model", "print"):
        raise ValueError("Invalid creating marker in run.json")
    if image is not None and image != state["image"]:
        raise ValueError("Image differs from run.json; resume with its original image")
    if style is not None and style != state["style"]:
        raise ValueError("Style differs from run.json; resume with its original style")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(image: str | None = None, style: str | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    if style is not None and style not in STYLES:
        raise ValueError("Style must be realistic or cartoon")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, image, style)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "image": image or str(SAMPLE_IMAGE), "style": style or SAMPLE_STYLE, "model_task_id": None, "print_task_id": None, "creating": None}
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
                "should_texture": True,
                "enable_pbr": False,
                "target_formats": ["glb"],
            },
        )
        state.update(model_task_id=model_id, creating=None)
        save_state(checkpoint, state)
    model = None
    print_id = state["print_task_id"]
    if print_id is None:
        model = client.wait("image-to-3d", model_id, label="model")
        client.download(model["model_urls"]["glb"], output / "textured-model.glb")
        client.download(model["thumbnail_url"], output / "textured-model-thumbnail.png")
        state["creating"] = "print"
        save_state(checkpoint, state)
        print_id = client.create(
            "print/multi-color",
            {
                "input_task_id": model_id,
                "max_colors": 4,
                "style": state["style"],
            },
        )
        state.update(print_task_id=print_id, creating=None)
        save_state(checkpoint, state)
    task = client.wait("print/multi-color", print_id, label="print")
    client.download(task["model_urls"]["3mf"], output / "multi-color-print.3mf")
    credits = (
        f"{model['consumed_credits'] + task['consumed_credits']} credits total"
        if model is not None
        else f"{task['consumed_credits']} print credits; model stage excluded"
    )
    print(f"Done: {output / 'multi-color-print.3mf'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("image", nargs="?", help="PNG or JPEG of one prop for the model stage")
    parser.add_argument("style", nargs="?", help="Color style of the print file: realistic or cartoon")
    args = parser.parse_args()
    run(args.image, args.style, args.resume)
