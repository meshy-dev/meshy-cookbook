# Published sample previews

These files come from the live Python run of September 27, 2026 (image-to-3d task `01a0e559-1c29-706a-92df-5d95ec4dbe20`, rigging task `01a0e55b-14fc-7321-bbc0-7354c77a09ea`, animation task `01a0e55b-d345-72b0-89f8-ed1f1eae101c`). They were inspected locally on September 27, 2026.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/character-thumbnail.png`, copied unmodified: the image-to-3d thumbnail, before rigging | `ee76864f053050bab9c680cb53c7b0f5216fb604f7b802aab0827aac74fb46f9` |
| `clips.svg` | `python/output/animated-character.glb` | `f3480fdf304d7f541179f05d10088e2debaefa5054b826f6009e3eb4da8cded4` |
| `idle.gif`, `jump.gif`, `attack.gif` | `python/output/animated-character.glb`, rendered in Blender | `f3480fdf304d7f541179f05d10088e2debaefa5054b826f6009e3eb4da8cded4` |

`clips.svg` is a side orthographic projection of the 24 joints of `skins[0]`, connected to their parent joints, at four evenly spaced moments of each of the file's three animation clips (`Idle`, 4.0 s; `Regular_Jump`, 1.9 s; `Attack`, 2.8 s), one row per clip. The joint positions come from the file's own node transforms and animation samplers, with linear interpolation. It is a geometry diagram, not an API thumbnail or a render.

`idle.gif`, `jump.gif` and `attack.gif` are renders of the same GLB in Blender 5.2.1 (EEVEE, standard view transform, a sun and a fill light, a light gray world) through a fixed orthographic three-quarter camera framed on each clip's full extent. Every second frame of the clip was rendered at 300 × 380 pixels, scaled to 240 × 304, and assembled into a looping GIF at 12 frames per second with a 64-color palette and no dithering. They are renders of one observed output, not API thumbnails, and the lighting and camera are the render's, not Meshy's.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and FBX files are not part of the repository or a public download. Generation can produce different results.
