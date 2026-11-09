# Published sample previews

The two images in this table are the thumbnails Meshy rendered for the refine task of a live `meshy make` run with the Meshy CLI 0.8.3 on macOS on November 8, 2026, saved by `-o` into a folder as `thumbnail.png` and copied unmodified. They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | The run with the README's description (text-to-3d preview task `01a1bc9d-be9d-7640-8179-155ee04b43c4`, refine task `01a1bc9e-3f92-7722-84c2-6fd85d844381`) | `87da61bbc698495e157d52f535350c96066261b7edf83cfa01473ad156c02c1c` |
| `first-try.png` | The earlier run with the first-try description, which asked for "a rounded orange housing with a large round battery gauge on the front" in place of the tower and battery meter (preview task `01a1bc9b-2468-707b-81c5-31d35f8e4a47`, refine task `01a1bc9b-adc0-7739-a119-e61fc344592f`) | `b476bd1b57ad699172fd17beba56a4ea93bb86e554e27a3b8f730c2c30b31cd6` |

`in-unreal.jpg` comes from a later run the same day, of the README's Step 1, 2 and 4 prompts in Claude Code against Unreal Engine 5.8.2 on macOS, in a new project from the Third Person template (text-to-3d preview task `01a1be51-7b2a-732d-8b12-f8aa329ad071`, refine task `01a1be51-f7e4-7192-924a-1ed8c25a7ded`). The GLB was imported with Interchange's default options from the editor's Python API, in place of the drag-and-drop in Step 6, and the agent placed it with Unreal MCP. Placed three meters in front of the PlayerStart, the dock's front hung over the edge of the template's raised platform, so the agent was asked to move it out until it stood fully on the floor; it moved it to the main floor, about ten meters out, where the picture was taken. The picture is a `HighResShot 1600x900` screenshot taken in Play In Editor, facing the front of the dock. For the shot, the character and camera were moved into position by script and the template's camera boom was shortened from 400 to 210 cm. It was converted to JPEG and scaled to 1,200 × 675 px. SHA-256 of the 1,600 × 900 source PNG: `b1b72176e923ea83ace45350c548828e93ca00fbbb5bf5dde72b991163139638`.

`static-mesh-editor.jpg` is the same run's static mesh open in the Static Mesh Editor, captured with Unreal MCP's `SlateInspectorToolset` window screenshot, then cropped to the top 1,427 × 700 px of its viewport, converted to JPEG and scaled to 1,200 × 588 px. The background is the editor's own preview scene, not the level. SHA-256 of the 1,966 × 1,234 window capture: `ea28b0fed61a586f90994c9d8cbf7539c18965b39b824ac33a1d8e3e52c18879`.

The first-try description in full: "A chunky robot charging dock that works as the respawn checkpoint in a stylized platformer: a rounded orange housing with a large round battery gauge on the front, a scuffed steel base plate with four bolts, two thick black cables looping out of the back, and yellow and black hazard stripes along the bottom edge".

These are previews of observed outputs. The GLB files are not part of the repository or a public download, and generation can produce different results.
