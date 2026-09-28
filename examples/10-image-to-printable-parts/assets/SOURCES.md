# Published sample previews

These files come from the live Python run of September 27, 2026 (image-to-3d task `01a0e5ce-f047-77d5-be7f-e708d129d6ca`, print-analyze task `01a0e5cf-957c-7142-9264-b8eefe2a1ada`, print-split task `01a0e5cf-aa39-7278-8391-1863ce4f7d2b`). They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `model.png` | `python/output/model-thumbnail.png`, copied unmodified: the image-to-3d task's thumbnail of the untextured mesh | `76ae39b2122aa662c01cdedb77a7bea8f0a127b866d3b19f5307982c8010c8b3` |
| `result.png` | Geometry diagram rendered from `python/output/printable-parts.3mf` (six parts, 965,906 triangles) | `003148ecc6aed8f3fe082a0185312517ec3f541fac7d0df55c1cdd12d34af249` |

`model.png` is the API's own 512 × 512 render, copied unmodified. `result.png` is a geometry diagram, not an API thumbnail: the six parts of the actual 3MF were loaded into Blender 5.2 straight from the file's vertex and triangle lists and rendered with the Workbench engine (studio lighting, cavity shading, object outlines) from a high three-quarter orthographic view, on a light plate with a 25 mm grid, each part in the filament color the 3MF assigns to it (`Metadata/project_settings.config`), at 1024 × 1024 and downscaled to 800 × 800 for publication. The meshes were not moved, scaled or edited; the layout and colors are the file's own. The API's own thumbnail of the split (`printable-parts-thumbnail.png`, a low front view in which the parts overlap) is not published because the parts are hard to tell apart in it.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and 3MF files are not part of the repository or a public download. Generation can produce different results.
