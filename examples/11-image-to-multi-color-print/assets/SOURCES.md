# Published sample previews

These files come from the live Python run of September 27, 2026 (image-to-3d task `01a0e603-5ef1-7553-9de2-29dbf0f304f7`, print-multi-color task `01a0e605-e8a5-709d-a080-58b58d466270`) and from one more conversion of the same image-to-3d task in the cartoon style, made the same day for the style comparison (print-multi-color task `01a0e606-eac3-731c-87ac-85bca597ae2c`). They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `model.png` | `python/output/textured-model-thumbnail.png`, copied unmodified: the image-to-3d task's thumbnail of the textured chest | `7101853709e5e3a99dccd6ecffded1b64294fb9f85cbc1ae09a404c5b6eff86c` |
| `result.png` | Geometry diagram rendered from `python/output/multi-color-print.3mf` (realistic style, 1,253,204 triangles, four filaments) | `a438c89201ae2c0b943f5962159ab8df9df30b4056b05d766d0a029bd1ef2691` |
| `cartoon.png` | Geometry diagram rendered from the 3MF of the cartoon conversion (same model, 1,253,204 triangles, four filaments) | `e6c6dc7415925e8047a40f3592be9aff40302a1e09a317fb0a75783da9b41b79` |

`model.png` is the API's own 512 × 512 render, copied unmodified. `result.png` and `cartoon.png` are geometry diagrams, not API thumbnails: a print task returns no preview image. Each was made by reading the 3MF's mesh and its per-triangle `paint_color` attributes (Bambu Studio's painting format), subdividing the triangles that carry more than one color exactly as Bambu Studio does, giving every resulting triangle the filament color the file's project settings assign to it, and rendering the mesh in Blender 5.2 with the Workbench engine (studio lighting, cavity shading) from a front three-quarter orthographic view on a transparent background, at 1024 × 1024 and downscaled to 800 × 800 for publication. The mesh was not moved, scaled or edited; the colors and their placement are the file's own. Both pictures use the same view so the two styles can be compared.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and 3MF files are not part of the repository or a public download. Generation can produce different results.
