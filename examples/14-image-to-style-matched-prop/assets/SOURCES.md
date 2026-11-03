# Published sample previews

These files come from the live Python run of November 3, 2026 (image-to-image task `01a1a1a9-e12a-750b-b638-ca782dac9198`, image-to-3d task `01a1a1aa-5cc4-7733-93be-d9732726afec`, retexture task `01a1a1aa-8742-744a-913b-d8fcbb9d6afb`). They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `concept.png` | `python/output/prop-concept.png`, copied unmodified: the image-to-image task's image | `62094c0064a6bb7564a4d2d491b3d3a622234303146d0b453a2b55c0257aadbd` |
| `result.png` | `python/output/prop-thumbnail.png`, copied unmodified: the retexture task's thumbnail | `bb1d1a54dd46ccb45a9cb24e58568df80865b7003d1edf685cc9df2dc3f3ba7b` |
| `wireframe.png` | Geometry diagram rendered from the image-to-3d task's untextured GLB (4,905 triangles), downloaded with a free GET after the run | `1b4c8b69930beb95dcab5a6aa1eca8267fb5721353a2232126c1f6c4fe742d69` |

The prop set and the comparison come from four more tasks made on November 3, 2026, after the verification runs. The well, the buoy and the rowboat are three more runs of the Python recipe with the default cottage and other descriptions. `from-cottage.png` comes from one retexture of the pictured run's image-to-3d task with the recipe's texture payload, except that `image_style_url` was the cottage picture instead of the signpost concept.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `well.png` | `prop-thumbnail.png` of the run with the description "A round stone well with cream stone blocks, a small orange tiled roof on two thick light brown wooden posts, a chunky wooden crank between the posts, and a blue wooden bucket sitting on the rim", copied unmodified (retexture task `01a1a200-eeca-7484-96b7-a28258371671`) | `6a0387385fc0ff174b6bd7a767fe78e75c03b88cc8b345ce758d2b6bb33126b3` |
| `buoy.png` | `prop-thumbnail.png` of the run with the description "A round sea buoy with bold red and white stripes around its body, a short cream post on top with a small orange cap, and a dark blue weighted base", copied unmodified (retexture task `01a1a200-def1-7769-834a-f71cd95fa5b2`) | `f806f7899e53a81cbb2b4a9470ad996120eb42d7c12151d1ca0bec409ecaf654` |
| `rowboat.png` | `prop-thumbnail.png` of the run with the description "A small wooden rowboat with light brown planks, a wide orange stripe along both sides, a cream bench across the middle, and two chunky light brown oars resting inside", copied unmodified (retexture task `01a1a200-d2f3-755c-8d10-191e1cd2c66b`) | `3b1ccf7b65fa5c3df6310a8e56fda89615e0fd149c5a6d496dc4d7a4e8caa682` |
| `from-cottage.png` | The thumbnail of retexture task `01a1a200-117e-74ec-bcd4-88ec854cc293`: the signpost mesh above (image-to-3d task `01a1a1aa-5cc4-7733-93be-d9732726afec`), `meshy-n1`, the cottage picture `input/seaside-cottage.png` as `image_style_url`, copied unmodified | `5b23289a7fcf7f88fef9b530ef2d49909a4e4d7938c9b1a5812087288e4c6881` |

`wireframe.png` is an orthographic render made in Blender 5.2 (Workbench engine, studio lighting) of the actual gray mesh from the second stage, viewed from the front right and slightly above, like the concept: a light gray solid copy of the mesh hides the back edges and a dark copy with a Wireframe modifier draws every triangle edge. The mesh was not regenerated, simplified or edited. It is a geometry diagram, not an API thumbnail. The textured `prop.glb` has the same 4,905 triangles.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB files are not part of the repository or a public download. Generation can produce different results.
