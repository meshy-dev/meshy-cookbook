# Published sample previews

The two images in this table are the thumbnails Meshy rendered for the refine task of a live `meshy make` run with the Meshy CLI 0.8.3 on macOS on November 8, 2026, saved by `-o` into a folder as `thumbnail.png` and copied unmodified. They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | The run with the README's description (text-to-3d preview task `01a1bc9d-be9d-7640-8179-155ee04b43c4`, refine task `01a1bc9e-3f92-7722-84c2-6fd85d844381`) | `87da61bbc698495e157d52f535350c96066261b7edf83cfa01473ad156c02c1c` |
| `first-try.png` | The earlier run with the first-try description, which asked for "a rounded orange housing with a large round battery gauge on the front" in place of the tower and battery meter (preview task `01a1bc9b-2468-707b-81c5-31d35f8e4a47`, refine task `01a1bc9b-adc0-7739-a119-e61fc344592f`) | `b476bd1b57ad699172fd17beba56a4ea93bb86e554e27a3b8f730c2c30b31cd6` |

`in-unreal.jpg` comes from a later run the same day, of the README's Step 1, 2 and 4 prompts in Claude Code against Unreal Engine 5.8.2 on macOS, in a new project from the Third Person template (text-to-3d preview task `01a1be51-7b2a-732d-8b12-f8aa329ad071`, refine task `01a1be51-f7e4-7192-924a-1ed8c25a7ded`). The GLB was imported with Interchange's default options from the editor's Python API, in place of the drag-and-drop in Step 6, and the agent placed it with Unreal MCP. The picture is a `HighResShot 1600x900` screenshot taken in Play In Editor; the character and camera were moved into position by script for the shot. It was converted to JPEG and scaled to 1,200 × 675 px. SHA-256 of the 1,600 × 900 source PNG: `7bcf791277717fc3c257f429b3464b67a73d7181aae0cc4367f2d4b761dd3fd3`.

The first-try description in full: "A chunky robot charging dock that works as the respawn checkpoint in a stylized platformer: a rounded orange housing with a large round battery gauge on the front, a scuffed steel base plate with four bolts, two thick black cables looping out of the back, and yellow and black hazard stripes along the bottom edge".

These are previews of observed outputs. The GLB files are not part of the repository or a public download, and generation can produce different results.
