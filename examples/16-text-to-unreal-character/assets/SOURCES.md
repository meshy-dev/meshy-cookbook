# Published sample previews

The three images in the table come from one live run of the recipe's three Meshy commands with the Meshy CLI 0.8.3 on macOS on November 8, 2026: text-to-image task `01a1bc9a-86e3-720e-a7fe-6a0bd3f73b8b`, image-to-3d task `01a1bc9b-f818-7278-8d77-57666e1cb69f` and rigging task `01a1bc9f-8ff3-70fd-a4c7-efec92746db0`. They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `concept.jpg` | The text-to-image task's `image_0.png` (1,152 × 1,536 px), converted to JPEG and scaled to 600 × 800 px. The image is generated, not a photograph or a drawing by a person | `765793f567c929fbe58cc6f4a172ae6586cc45771aaf09a58e4d8ad8d94cd3c5` |
| `model.png` | The thumbnail Meshy rendered for the image-to-3d task, saved by `-o` as `thumbnail.png` and copied unmodified (512 × 512 px, transparent background) | `52914efe05dd69422cb3a21b1c963d55dc0bfced51bb2662dc4faf942c8d940f` |
| `walking.jpg` | A Blender 5.2.1 render of `walking_glb.glb` from the rigging task, a third of the way through the walk clip, from a three-quarter view with Blender's Workbench studio lighting; 640 × 640 px, converted to JPEG | `fc434913851576b485243bc472e266b790f292e6f582a89fe69137648b0a815e` |

`in-unreal.jpg` was taken on November 9, 2026, in Unreal Engine 5.8.2 on macOS, in a project from the Third Person template. It shows the second live run's `rigged_character.fbx` (the agent run in the recipe's sample result), imported with Interchange's default options as in Step 5, placed by the README's Step 6 placement prompt in Claude Code through Unreal MCP and looping `walking_fbx`. That `walking_fbx` came from Unreal MCP's `SkeletalMeshTools.import_file` onto the character's skeleton, then renamed, because the earlier Step 6 import had not been saved. The picture is a level viewport capture from Unreal MCP's `EditorToolset.EditorAppToolset.CaptureViewport` with the editor UI hidden, taken from a set camera position in front of the character, 2,027 × 1,090 px, cropped to 1,600 × 900 px, converted to JPEG and scaled to 1,200 × 675 px. The thin orange lines at the top are the outline of an editor volume in the template level. SHA-256 of the capture: `e95f4ca63ef460134fdb71819aaa2f8fc7d297990bbc50e192c10a1dcc3a3004`.

These are previews of observed outputs. The model files are not part of the repository or a public download, and generation can produce different results.
