# Published sample previews

Every image here comes from one run of the README's Step 4 prompt in Claude Code with the Meshy CLI 0.8.5 on macOS on November 9, 2026, in a new Unreal Engine 5.8.2 project from the Third Person template. They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `concept.png` | The concept image from text-to-image task `01a1c230-7292-709b-9012-160c5ff2bae9` (`gpt-image-2`), downloaded by the agent as a 1,024 × 1,024 PNG and scaled to 512 × 512 | `a1c7d9e611c166241f7bc300c2b6a8143d341e36de95f8f6575d509d78786571` |
| `result.png` | Meshy's thumbnail of image-to-3d task `01a1c232-0100-7440-b5b6-d9a33a38ec97`, downloaded by the agent with `meshy download --asset thumbnail.primary` and copied unmodified | `fdf46556ffa852f7452a54bb722db32df7a6848b467e210d9e36223c10215ce2` |
| `in-unreal.jpg` | A `HighResShot 1600x900` screenshot in Play In Editor, facing the front of the dock where the agent placed it, 2.3 m from the PlayerStart. For the shot, the character and camera were moved into position by script and the template's camera boom was shortened from 400 to 210 cm. Converted to JPEG and scaled to 1,200 × 675 px | `45c87e44395af8695138a2d00edf7e05ebac3ca0dc03e845fa1842c2e16e2d3f` |
| `static-mesh-editor.jpg` | The imported static mesh open in the Static Mesh Editor, captured with Unreal MCP's `SlateInspectorToolset` window screenshot, cropped to the editor's viewport, converted to JPEG and scaled to 1,200 × 744 px. The background is the editor's own preview scene, not the level | `e30c0063c1a7c756c772f531e8f8029add4a9efdd1b8ef34dfb505b59a747988` |

In that run the GLB was imported with Interchange's default options from the editor's Python API, in place of the drag-and-drop in Step 6, and the agent placed it with Unreal MCP.

These are previews of observed outputs. The GLB file is not part of the repository or a public download, and generation can produce different results.
