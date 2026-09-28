"""Build a dense textured prop from an image, then simplify it to a quad mesh at a face budget, as GLB and FBX."""

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
SAMPLE_POLYCOUNT = 20000
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


def load_state(path: Path, image: str | None, polycount: int | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "image", "polycount", "model_task_id", "remesh_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    if type(state["polycount"]) is not int or not 100 <= state["polycount"] <= 300000:
        raise ValueError("Invalid polycount in run.json")
    for key in ("model_task_id", "remesh_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["remesh_task_id"] and not state["model_task_id"]:
        raise ValueError("run.json has a remesh task without a model task")
    if state["creating"] not in (None, "model", "remesh"):
        raise ValueError("Invalid creating marker in run.json")
    if image is not None and image != state["image"]:
        raise ValueError("Image differs from run.json; resume with its original image")
    if polycount is not None and polycount != state["polycount"]:
        raise ValueError("Face count differs from run.json; resume with its original face count")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(image: str | None = None, polycount: int | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    if polycount is not None and (type(polycount) is not int or not 100 <= polycount <= 300000):
        raise ValueError("Face count must be an integer from 100 to 300000")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, image, polycount)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "image": image or str(SAMPLE_IMAGE), "polycount": polycount or SAMPLE_POLYCOUNT, "model_task_id": None, "remesh_task_id": None, "creating": None}
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
                "enable_pbr": True,
                "target_formats": ["glb"],
            },
        )
        state.update(model_task_id=model_id, creating=None)
        save_state(checkpoint, state)
    model = None
    remesh_id = state["remesh_task_id"]
    if remesh_id is None:
        model = client.wait("image-to-3d", model_id, label="model")
        client.download(model["model_urls"]["glb"], output / "dense-prop.glb")
        client.download(model["thumbnail_url"], output / "dense-prop-thumbnail.png")
        state["creating"] = "remesh"
        save_state(checkpoint, state)
        remesh_id = client.create(
            "remesh",
            {
                "input_task_id": model_id,
                "topology": "quad",
                "target_polycount": state["polycount"],
                "target_formats": ["glb", "fbx"],
            },
        )
        state.update(remesh_task_id=remesh_id, creating=None)
        save_state(checkpoint, state)
    task = client.wait("remesh", remesh_id, label="remesh")
    client.download(task["model_urls"]["glb"], output / "simplified-prop.glb")
    client.download(task["model_urls"]["fbx"], output / "simplified-prop.fbx")
    client.download(task["thumbnail_url"], output / "simplified-prop-thumbnail.png")
    credits = (
        f"{model['consumed_credits'] + task['consumed_credits']} credits total"
        if model is not None
        else f"{task['consumed_credits']} remesh credits; model stage excluded"
    )
    print(f"Done: {output / 'simplified-prop.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("image", nargs="?", help="PNG or JPEG of one prop for the model stage")
    parser.add_argument("polycount", nargs="?", type=int, help="Face budget for the simplified mesh, 100 to 300000")
    args = parser.parse_args()
    run(args.image, args.polycount, args.resume)
