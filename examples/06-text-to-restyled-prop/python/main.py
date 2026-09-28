"""Restyle the gray low-poly oak with a text prompt into a textured GLB with PBR maps."""

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
    "An oak tree in autumn: rough dark brown bark with deep vertical grooves on the trunk, "
    "dense orange and gold leaves on the canopy. Stylized hand-painted game prop."
)
SAMPLE_IMAGE = DIRECTORY.parent / "input/low-poly-oak.png"
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


def load_state(path: Path, prompt: str | None, image: str | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "prompt", "image", "model_task_id", "retexture_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["prompt"], str) or not state["prompt"].strip():
        raise ValueError("Invalid prompt in run.json")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    for key in ("model_task_id", "retexture_task_id"):
        value = state[key]
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {key} in run.json")
    if state["retexture_task_id"] and not state["model_task_id"]:
        raise ValueError("run.json has a retexture task without a model task")
    if state["creating"] not in (None, "model", "retexture"):
        raise ValueError("Invalid creating marker in run.json")
    if prompt is not None and prompt != state["prompt"]:
        raise ValueError("Prompt differs from run.json; resume with its original prompt")
    if image is not None and image != state["image"]:
        raise ValueError("Image differs from run.json; resume with its original image")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(prompt: str | None = None, image: str | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    if prompt is not None and not prompt.strip():
        raise ValueError("Style prompt cannot be empty")
    if prompt is not None and len(prompt) > 800:
        raise ValueError("Style prompt must be 800 characters or fewer")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, prompt, image)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "prompt": prompt or SAMPLE_PROMPT, "image": image or str(SAMPLE_IMAGE), "model_task_id": None, "retexture_task_id": None, "creating": None}
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
                "model_type": "smart-topology",
                "target_polycount": 1000,
                "should_texture": False,
                "target_formats": ["glb"],
            },
        )
        state.update(model_task_id=model_id, creating=None)
        save_state(checkpoint, state)
    model = None
    retexture_id = state["retexture_task_id"]
    if retexture_id is None:
        model = client.wait("image-to-3d", model_id, label="model")
        client.download(model["thumbnail_url"], output / "low-poly-prop-thumbnail.png")
        state["creating"] = "retexture"
        save_state(checkpoint, state)
        retexture_id = client.create(
            "retexture",
            {
                "input_task_id": model_id,
                "text_style_prompt": state["prompt"],
                "enable_original_uv": False,
                "enable_pbr": True,
                "target_formats": ["glb"],
            },
        )
        state.update(retexture_task_id=retexture_id, creating=None)
        save_state(checkpoint, state)
    task = client.wait("retexture", retexture_id, label="retexture")
    client.download(task["model_urls"]["glb"], output / "restyled-prop.glb")
    client.download(task["thumbnail_url"], output / "restyled-prop-thumbnail.png")
    textures = task["texture_urls"][0]
    client.download(textures["base_color"], output / "base-color.png")
    client.download(textures["metallic"], output / "metallic.png")
    client.download(textures["roughness"], output / "roughness.png")
    client.download(textures["normal"], output / "normal.png")
    credits = (
        f"{model['consumed_credits'] + task['consumed_credits']} credits total"
        if model is not None
        else f"{task['consumed_credits']} retexture credits; model stage excluded"
    )
    print(f"Done: {output / 'restyled-prop.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("prompt", nargs="?", help="Style prompt for the retexture stage, in quotes")
    parser.add_argument("image", nargs="?", help="PNG or JPEG of one prop for the model stage")
    args = parser.parse_args()
    run(args.prompt, args.image, args.resume)
