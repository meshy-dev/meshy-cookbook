"""Turn concept art and a one-line prop description into a matching low-poly prop, textured with Meshy N1."""

import argparse
import json
import os
import re
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # so `shared` imports
from shared.python.meshy import Meshy, MeshyAPIError

DIRECTORY = Path(__file__).resolve().parent
SAMPLE_DESCRIPTION = (
    "A wooden signpost with two chunky orange arrow signs pointing left and right, a thick light brown wooden post "
    "with a rounded top, a few tufts of green grass around its foot, and a square cream stone base"
)
SAMPLE_REFERENCE = DIRECTORY.parent / "input/seaside-cottage.png"
OUTPUT = DIRECTORY / "output"
STAGES = ("concept", "mesh", "texture")


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


@contextmanager
def creating(path: Path, state: dict, stage: str):
    """Mark `stage` as being created, and clear the mark if the API refuses the POST, which creates no task."""
    state["creating"] = stage
    save_state(path, state)  # if POST is interrupted, do not blindly repeat it
    try:
        yield
    except MeshyAPIError as error:
        if error.refused:
            state["creating"] = None
            save_state(path, state)
        raise


def load_state(path: Path, description: str | None, reference: str | None) -> dict:
    state = json.loads(path.read_text())
    keys = {"version", "description", "reference", "concept_task_id", "mesh_task_id", "texture_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["description"], str) or not state["description"].strip():
        raise ValueError("Invalid description in run.json")
    if not isinstance(state["reference"], str) or not state["reference"]:
        raise ValueError("Invalid reference in run.json")
    ids = [state[f"{stage}_task_id"] for stage in STAGES]
    for stage, value in zip(STAGES, ids):
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
            raise ValueError(f"Invalid {stage}_task_id in run.json")
    if any(later and not earlier for earlier, later in zip(ids, ids[1:])):
        raise ValueError("run.json has a later stage without the stage before it")
    if state["creating"] not in (None, *STAGES):
        raise ValueError("Invalid creating marker in run.json")
    if description is not None and description != state["description"]:
        raise ValueError("Description differs from run.json; resume with its original description")
    if reference is not None and reference != state["reference"]:
        raise ValueError("Reference image differs from run.json; resume with its original image")
    if state["creating"] is not None:
        raise ValueError(
            f"Creation outcome for {state['creating']} is unknown. Check Meshy task history, "
            "recover its task ID in run.json, and set creating to null before resuming. "
            "No new task was created by this resume attempt."
        )
    return state


def run(
    description: str | None = None,
    reference: str | None = None,
    resume: bool = False,
    output: Path = OUTPUT,
    client: Meshy | None = None,
) -> None:
    if description is not None and not description.strip():
        raise ValueError("Description cannot be empty")
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, description, reference)  # validate before opening a client
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {
            "version": 1,
            "description": description or SAMPLE_DESCRIPTION,
            "reference": reference or str(SAMPLE_REFERENCE),
            "concept_task_id": None,
            "mesh_task_id": None,
            "texture_task_id": None,
            "creating": None,
        }
    reference_url = Meshy.data_uri(Path(state["reference"])) if state["concept_task_id"] is None else None
    client = client if client is not None else Meshy()  # reads MESHY_API_KEY from .env

    concept_id = state["concept_task_id"]
    if concept_id is None:
        with creating(checkpoint, state, "concept"):
            concept_id = client.create(
                "image-to-image",
                {
                    "ai_model": "gpt-image-2-5-sunburst",
                    "prompt": (
                        f"{state['description']}, full object, three-quarter front view, centered with space around it, "
                        "painted in the same art style, palette and brushwork as the reference image, "
                        "painted highlights and soft shadows, soft even studio lighting, plain white background, "
                        "single object, no props, no text"
                    ),
                    "reference_image_urls": [reference_url],
                    "aspect_ratio": "1:1",
                },
            )
        state.update(concept_task_id=concept_id, creating=None)
        save_state(checkpoint, state)
    concept = None
    mesh_id = state["mesh_task_id"]
    if mesh_id is None:
        concept = client.wait("image-to-image", concept_id, label="concept")
        client.download(concept["image_urls"][0], output / "prop-concept.png")
        with creating(checkpoint, state, "mesh"):
            mesh_id = client.create(
                "image-to-3d",
                {
                    "input_task_id": concept_id,
                    "model_type": "smart-topology",
                    "ai_model": "meshy-t2.5",
                    "target_polycount": 5000,
                    "should_texture": False,
                    "target_formats": ["glb"],
                },
            )
        state.update(mesh_task_id=mesh_id, creating=None)
        save_state(checkpoint, state)
    mesh = None
    texture_id = state["texture_task_id"]
    if texture_id is None:
        mesh = client.wait("image-to-3d", mesh_id, label="mesh")
        # Retexture takes no image task ID, and the concept's signed link expires, so send the saved file.
        concept_url = Meshy.data_uri(output / "prop-concept.png")
        with creating(checkpoint, state, "texture"):
            texture_id = client.create(
                "retexture",
                {
                    "input_task_id": mesh_id,
                    "ai_model": "meshy-n1",
                    "image_style_url": concept_url,
                    "enable_pbr": False,
                    "target_formats": ["glb"],
                },
            )
        state.update(texture_task_id=texture_id, creating=None)
        save_state(checkpoint, state)
    texture = client.wait("retexture", texture_id, label="texture")
    client.download(texture["model_urls"]["glb"], output / "prop.glb")
    client.download(texture["thumbnail_url"], output / "prop-thumbnail.png")
    if concept is not None:
        credits = f"{concept['consumed_credits'] + mesh['consumed_credits'] + texture['consumed_credits']} credits total"
    elif mesh is not None:
        credits = f"{mesh['consumed_credits'] + texture['consumed_credits']} credits for mesh and texture; concept stage excluded"
    else:
        credits = f"{texture['consumed_credits']} texture credits; concept and mesh stages excluded"
    print(f"Done: {output / 'prop.glb'}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating recorded tasks")
    parser.add_argument("description", nargs="?", help="One-line description of the prop, in quotes")
    parser.add_argument("reference", nargs="?", help="PNG, JPEG or WebP of the concept art whose style the prop follows")
    args = parser.parse_args()
    run(args.description, args.reference, args.resume)
