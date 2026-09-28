"""Turn a low-poly concept image into a low-poly GLB in seconds."""

import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # so `shared` imports
from shared.python.meshy import Meshy

DIRECTORY = Path(__file__).resolve().parent
SAMPLE = DIRECTORY.parent / "input/low-poly-oak.png"
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else SAMPLE
if len(sys.argv) > 3:
    raise ValueError("Usage: python main.py [image.png] [face_count]")
if len(sys.argv) > 2 and not re.fullmatch(r"[0-9]+", sys.argv[2]):
    raise ValueError("Face count must be an integer from 100 to 15000")
POLYCOUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
if not 100 <= POLYCOUNT <= 15000:
    raise ValueError("Face count must be an integer from 100 to 15000")
OUTPUT = DIRECTORY / "output"

image_url = Meshy.data_uri(INPUT)  # validate the input before opening a client
client = Meshy()  # reads MESHY_API_KEY from .env
task_id = client.create(
    "image-to-3d",
    {
        "image_url": image_url,
        "model_type": "smart-topology",
        "target_polycount": POLYCOUNT,
        "should_texture": False,
        "target_formats": ["glb"],
    },
)
task = client.wait("image-to-3d", task_id)
client.download(task["model_urls"]["glb"], OUTPUT / "low-poly-prop.glb")
client.download(task["thumbnail_url"], OUTPUT / "low-poly-prop-thumbnail.png")
print(f"Done: {OUTPUT / 'low-poly-prop.glb'}  ({task['consumed_credits']} credits)")
