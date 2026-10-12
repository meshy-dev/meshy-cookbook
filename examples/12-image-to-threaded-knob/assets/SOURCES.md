# Published sample previews

These files come from the live Python run of October 12, 2026 (image-to-3d task `01a1314d-3696-774f-bca4-8f602b9777c9`, print-analyze tasks `01a1314d-c941-7017-85c4-b319a0df4682` and `01a1314e-0786-7371-8082-f470a4388973`). They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `model.png` | `python/output/model-thumbnail.png`, copied unmodified: the image-to-3d task's thumbnail of the untextured mesh | `61ee6af9b19b176af42ea7fad095758793fdc7ea999009cbc382546dff55cc20` |
| `result.png` | Rendered from `python/output/knob-8-32.stl` (211,810 triangles) | `415dc6fdf7fc9518184af58e7145848a56b036824b3b18151d27f3d85d911714` |
| `thread.png` | Rendered from the same `python/output/knob-8-32.stl` | `415dc6fdf7fc9518184af58e7145848a56b036824b3b18151d27f3d85d911714` |

`model.png` is the API's own 512 × 512 render, copied unmodified. It is a side view and does not show the top of the knob.

`result.png` and `thread.png` are renders, not API thumbnails. The actual print file was imported into Blender 5.2 and stood on its base, then scaled uniformly to 40 mm tall for the picture only. It was cut in half through the stem's axis with an exact boolean, and rendered with Cycles in a polished brass material (base color 0.80, 0.56, 0.22, metallic 1.0, roughness 0.22) on a gray studio floor. The renders used the camera and lights of the developer blog's knob renders.

- `result.png` is a perspective three-quarter view from above, rendered at 1024 × 1024 and downscaled to 800 × 800. It shows the sunburst grooves on the cap and the threaded hole in the stem.
- `thread.png` is an orthographic view of the bottom 16 mm, rendered at 900 × 900 and downscaled to 800 × 800. It shows the thread and the counterbore at the opening.

The mesh was not edited. The brass material shows the design the image describes; a print comes out in whatever filament is loaded.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime STL files are not part of the repository or a public download. Generation can produce different results.
