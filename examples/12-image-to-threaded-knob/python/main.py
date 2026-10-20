"""Build a cabinet knob from one image, size it in millimetres, cut a screw thread into its stem, and check it for printing."""

import argparse
import base64
import json
import math
import os
import re
import struct
import sys
import tempfile
from pathlib import Path

import numpy as np
from manifold3d import CrossSection, Error, Manifold, Mesh

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # so `shared` imports
from shared.python.meshy import Meshy, MeshyAPIError

DIRECTORY = Path(__file__).resolve().parent
SAMPLE_IMAGE = DIRECTORY.parent / "input/sunburst-knob.png"
SAMPLE_SCREW = "8-32"
OUTPUT = DIRECTORY / "output"

CAP_DIAMETER_MM = 38.0  # the knob's widest point, across the cap
SCREWS = {"8-32": (4.166, 25.4 / 32), "M4": (4.0, 0.7)}  # outside diameter and pitch (rise per turn), in mm
CLEARANCE_MM = 0.15  # added to the hole's radius so the screw turns in printed plastic
HOLE_DEPTH_MM = 12.0
COUNTERBORE_MM = (5.2, 1.0)  # diameter and depth of the wider step at the opening
STL_RECORD = np.dtype([("normal", "<f4", 3), ("corners", "<f4", (3, 3)), ("attribute", "<u2")])


def save_state(path: Path, state: dict) -> None:
    """Atomically checkpoint only the inputs and the task ID, never signed URLs or keys."""
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
    keys = {"version", "image", "screw", "model_task_id", "creating"}
    if not isinstance(state, dict) or set(state) != keys or type(state["version"]) is not int or state["version"] != 1:
        raise ValueError("Invalid run.json schema; expected a version 1 checkpoint")
    if not isinstance(state["image"], str) or not state["image"]:
        raise ValueError("Invalid image in run.json")
    if state["screw"] not in SCREWS:
        raise ValueError("Invalid screw in run.json")
    value = state["model_task_id"]
    if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value)):
        raise ValueError("Invalid model_task_id in run.json")
    if state["creating"] not in (None, "model"):
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


def read_stl(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Binary STL to shared vertices and triangles. STL stores the three corners of every triangle separately."""
    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0] if len(data) >= 84 else -1
    if len(data) != 84 + 50 * count:
        raise ValueError(f"{path.name} is not a binary STL")
    corners = np.frombuffer(data, dtype=STL_RECORD, count=count, offset=84)["corners"].reshape(-1, 3)
    vertices, triangles = np.unique(corners, axis=0, return_inverse=True)
    return vertices, triangles.reshape(-1, 3).astype(np.uint32)


def edge_counts(triangles: np.ndarray) -> np.ndarray:
    """How many triangles share each edge of each triangle. A closed surface has exactly two everywhere."""
    edges = np.sort(triangles[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1)
    _, inverse, counts = np.unique(edges, axis=0, return_inverse=True, return_counts=True)
    return counts[inverse.reshape(-1)].reshape(-1, 3)


def close_gaps(vertices: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    """Remove the triangles on broken edges, then close each gap with a fan of triangles around its centre."""
    broken = (edge_counts(triangles) != 2).any(axis=1)
    if not broken.any():
        return vertices, triangles, 0
    kept = triangles[~broken]
    open_edges = kept[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)[edge_counts(kept).reshape(-1) == 1]
    following = {}
    for a, b in open_edges.tolist():
        following.setdefault(b, []).append(a)  # walk each gap backwards so the new triangles face outward
    new_vertices, new_triangles = [vertices], [kept]
    while following:
        loop = [next(iter(following))]
        while True:
            if loop[-1] not in following:
                raise ValueError("model.stl has a gap that cannot be closed automatically; regenerate the model")
            step = following[loop[-1]].pop()
            if not following[loop[-1]]:
                del following[loop[-1]]
            if step == loop[0]:
                break
            loop.append(step)
        centre = sum(len(v) for v in new_vertices)
        new_vertices.append(vertices[loop].astype(np.float64).mean(axis=0, keepdims=True))
        new_triangles.append(np.array([(a, b, centre) for a, b in zip(loop, loop[1:] + loop[:1])], dtype=np.uint32))
    return np.concatenate(new_vertices).astype(np.float32), np.concatenate(new_triangles), int(broken.sum())


def thread_cutter(screw: str) -> Manifold:
    """The empty space the screw needs: its own 60-degree thread, widened by the clearance, plus the counterbore."""
    diameter, pitch = SCREWS[screw]
    outer = diameter / 2 + CLEARANCE_MM
    inner = outer - 5 / 8 * math.sqrt(3) / 2 * pitch  # a standard thread is 5/8 of a sharp 60-degree V deep
    points = []
    for i in range(96):  # one pitch of the thread profile, wrapped once around the axis
        t = i / 96
        if t < 5 / 16:  # flank up to the outer radius
            radius = inner + (outer - inner) * t / (5 / 16)
        elif t < 7 / 16:  # flat at the outer radius for 1/8 of a pitch
            radius = outer
        elif t < 12 / 16:  # flank back down
            radius = outer - (outer - inner) * (t - 7 / 16) / (5 / 16)
        else:  # flat at the inner radius for 1/4 of a pitch
            radius = inner
        points.append((radius * math.cos(2 * math.pi * t), radius * math.sin(2 * math.pi * t)))
    length = HOLE_DEPTH_MM + 1  # start 1 mm below the base so the hole opens cleanly
    turns = length / pitch
    thread = Manifold.extrude(CrossSection([points]), length, round(turns * 32), 360 * turns)  # one turn per pitch
    counterbore = Manifold.cylinder(COUNTERBORE_MM[1] + 1, COUNTERBORE_MM[0] / 2, COUNTERBORE_MM[0] / 2, 64)
    return (thread + counterbore).translate((0, 0, -1))


def write_stl(path: Path, solid: Manifold) -> None:
    mesh = solid.to_mesh()
    corners = np.asarray(mesh.vert_properties, dtype="<f4")[:, :3][np.asarray(mesh.tri_verts)]
    normals = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    records = np.zeros(len(corners), dtype=STL_RECORD)
    records["normal"] = normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    records["corners"] = corners
    header = b"Meshy cookbook knob, millimetres".ljust(80, b" ")
    path.write_bytes(header + struct.pack("<I", len(records)) + records.tobytes())


def glb_data_uri(solid: Manifold) -> str:
    """The solid as a GLB data URL with positions and triangles only, turned Y-up as glTF expects."""
    mesh = solid.to_mesh()
    xyz = np.asarray(mesh.vert_properties, dtype="<f4")[:, :3]
    positions = np.stack([xyz[:, 0], xyz[:, 2], -xyz[:, 1]], axis=1).astype("<f4")
    indices = np.asarray(mesh.tri_verts, dtype="<u4")
    binary = positions.tobytes() + indices.tobytes()
    gltf = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": positions.nbytes, "target": 34962},
            {"buffer": 0, "byteOffset": positions.nbytes, "byteLength": indices.nbytes, "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5125, "count": indices.size, "type": "SCALAR"},
        ],
    }
    text = json.dumps(gltf).encode()
    text += b" " * (-len(text) % 4)
    glb = (
        struct.pack("<3I", 0x46546C67, 2, 28 + len(text) + len(binary))  # "glTF", version 2, total length
        + struct.pack("<2I", len(text), 0x4E4F534A) + text  # JSON chunk
        + struct.pack("<2I", len(binary), 0x004E4942) + binary  # BIN chunk
    )
    return "data:model/gltf-binary;base64," + base64.b64encode(glb).decode()


def run(screw: str | None = None, image: str | None = None, resume: bool = False, output: Path = OUTPUT, client: Meshy | None = None) -> None:
    if screw is not None and screw.upper() not in SCREWS:
        raise ValueError("Screw must be 8-32 or M4")
    screw = screw.upper() if screw is not None else None
    checkpoint = output / "run.json"
    if resume:
        state = load_state(checkpoint, image)  # validate before opening a client
        state["screw"] = screw or state["screw"]  # the thread is cut on your computer, so a resume may change it
    else:
        if checkpoint.exists():
            raise ValueError("output/run.json already exists. Use --resume, or archive/remove output to start a new paid run.")
        state = {"version": 1, "image": image or str(SAMPLE_IMAGE), "screw": screw or SAMPLE_SCREW, "model_task_id": None, "creating": None}
    image_url = Meshy.data_uri(Path(state["image"])) if state["model_task_id"] is None else None
    client = client if client is not None else Meshy()  # reads MESHY_API_KEY from .env

    model_id = state["model_task_id"]
    created = model_id is None
    if model_id is None:
        state["creating"] = "model"
        save_state(checkpoint, state)  # if POST is interrupted, do not blindly repeat it
        try:
            model_id = client.create(
                "image-to-3d",
                {
                    "image_url": image_url,
                    "ai_model": "meshy-7.1",
                    "should_texture": False,
                    "target_formats": ["stl"],
                },
            )
        except MeshyAPIError as error:
            if error.refused:  # Meshy refused the request, so no task exists and resume may try again
                state["creating"] = None
                save_state(checkpoint, state)
            raise
        state.update(model_task_id=model_id, creating=None)
    save_state(checkpoint, state)
    model = client.wait("image-to-3d", model_id, label="model")
    client.download(model["model_urls"]["stl"], output / "model.stl")
    client.download(model["thumbnail_url"], output / "model-thumbnail.png")

    # Size the knob and cut the thread. This runs on your computer and costs nothing.
    vertices, triangles, replaced = close_gaps(*read_stl(output / "model.stl"))
    solid = Manifold(Mesh(vert_properties=vertices, tri_verts=triangles))
    if solid.status() != Error.NoError:
        raise ValueError(f"model.stl is not watertight ({solid.status().name}); regenerate the model")
    solid = max(solid.decompose(), key=lambda piece: piece.volume())  # drop any loose fragments
    x0, y0, z0, x1, y1, z1 = solid.bounding_box()
    scale = CAP_DIAMETER_MM / max(x1 - x0, y1 - y0)  # the file has no units, so the cap sets the size
    knob = solid.translate((-(x0 + x1) / 2, -(y0 + y1) / 2, -z0)).scale((scale, scale, scale))
    finished = knob - thread_cutter(state["screw"])
    knob_file = output / f"knob-{state['screw']}.stl"
    write_stl(knob_file, finished)
    height = round((z1 - z0) * scale, 2)
    if replaced:
        print(f"Closed the gaps left by {replaced} broken triangles", flush=True)
    print(f"Knob: {CAP_DIAMETER_MM:.2f} mm across, {height:.2f} mm tall, {state['screw']} thread {HOLE_DEPTH_MM:g} mm deep", flush=True)

    # The printability check is free, so a resumed run repeats it instead of checkpointing it.
    reports = {}
    for name, part in (("without_hole", knob), ("finished", finished)):
        check_id = client.create(
            "print/analyze",
            {
                "model_url": glb_data_uri(part),
                "printer_type": "fdm",
                "intended_print_height_mm": height,
            },
        )
        report = client.wait("print/analyze", check_id, label="check")["printability"]
        reports[name] = report
        ratio = report["thin_walls"]["thin_area_ratio"]  # null when Meshy couldn't measure the walls
        thin = "unmeasured" if ratio is None else f"{ratio:.1%}"
        print(
            f"Printability {name.replace('_', ' ')}: {report['status']}, watertight {'yes' if report['metrics']['is_watertight'] else 'no'}, "
            f"{report['metrics']['non_manifold_edges']} non-manifold edges, thin walls {thin}",
            flush=True,
        )
    (output / f"printability-{state['screw']}.json").write_text(json.dumps(reports, indent=2) + "\n")
    credits = f"{model['consumed_credits']} credits total" if created else "model stage excluded; the thread and the checks are free"
    print(f"Done: {knob_file}  ({credits})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Continue output/run.json without repeating the model task")
    parser.add_argument("screw", nargs="?", help="Screw thread to cut: 8-32 (US) or M4 (metric)")
    parser.add_argument("image", nargs="?", help="PNG, JPEG or WebP of one knob for the model stage")
    args = parser.parse_args()
    run(args.screw, args.image, args.resume)
