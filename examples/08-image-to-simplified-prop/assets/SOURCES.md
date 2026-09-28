# Published sample previews

These files come from the live Python run of September 27, 2026 (image-to-3d task `01a0e4a2-945b-719c-948b-3a3055f66406`, remesh task `01a0e4a4-53c3-7292-acd8-565ad02eab84`) and from four extra remeshes of the same image-to-3d task made the same day for the face-budget comparison. They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `dense.png` | `python/output/dense-prop-thumbnail.png`, copied unmodified: the image-to-3d task's thumbnail | `e9e3a6606880b468f7c62467c9b106644b23e498811d438e56063c27bde9085c` |
| `result.png` | `python/output/simplified-prop-thumbnail.png`, copied unmodified: the remesh task's thumbnail | `f2666569ed0b1daba3055449d760f164cb4a0912d99085eb220721c91ea4312a` |
| `wireframe.png` | Geometry diagram rendered from `python/output/simplified-prop.fbx` (19,602 faces: 19,579 quads and 23 triangles) | `622d4c7272e3c667d18fa85d162cad5a843bc1a8bb145a0b2b35135f7a2db827` |
| `faces-2000.png` | Geometry diagram rendered from the FBX of remesh task `01a0e4a7-9bda-7269-b0d0-8e71f02da657` (quad, target 2,000; 2,262 faces) | `7c05248eb36c39fff0015fb302bb9671d66991bde426793ab38b3e104779ba32` |
| `faces-5000.png` | Geometry diagram rendered from the FBX of remesh task `01a0e4a7-9c5f-77fa-9009-c63dd99deeea` (quad, target 5,000; 6,198 faces) | `09426c870fb59643689184bfdc3df69dce36ad45fd57578ec1be7bf45c561c96` |
| `faces-20000.png` | Geometry diagram rendered from `python/output/simplified-prop.fbx`, the pictured run (quad, target 20,000; 19,602 faces) | `622d4c7272e3c667d18fa85d162cad5a843bc1a8bb145a0b2b35135f7a2db827` |
| `faces-100000.png` | Geometry diagram rendered from the FBX of remesh task `01a0e4a7-9cda-7405-96ec-17418413aacf` (quad, target 100,000; 98,299 faces) | `aefa07374b6f2f9a4e938aeaf989102936c76116dee6d47c17632a278910f10e` |

The wireframe diagrams are orthographic renders made in Blender 5.2 (Workbench engine, flat lighting) of the actual FBX files, imported so the quads stay quads: a light solid copy of the mesh hides the back edges and a dark copy with a Wireframe modifier draws every edge. `wireframe.png` is a close-up of the front of the chest around the padlock; the four `faces-*.png` files show the whole chest from the same front three-quarter direction. The meshes were not regenerated, simplified or edited. They are geometry diagrams, not API thumbnails.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and FBX files are not part of the repository or a public download. Generation can produce different results.
