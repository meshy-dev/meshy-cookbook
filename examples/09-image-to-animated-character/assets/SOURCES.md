# Published sample previews

These files come from the live Python run of October 19, 2026 (image-to-3d task `01a155ff-7c16-755d-8db9-1ac42dffe1e9`, rigging task `01a15600-f9d7-760d-8bff-2ca050d35f7e`, animation task `01a15601-40cd-757a-af9a-991b8ffdbcbe`). They were inspected locally on October 19, 2026.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/character-thumbnail.png`, copied unmodified: the image-to-3d thumbnail, before rigging | `d34b6d6d8805e6f870c29bbd19d4d3f16f5c0549981f8a5a6a85f140dbb38b64` |
| `clips.svg` | `python/output/animated-character.glb` | `4f3823e860d099dca814b5d54b52b8eef0a127eebd84a064536eb7d72e3f5142` |
| `idle.gif`, `jump.gif`, `attack.gif` | `python/output/animated-character.glb`, rendered in Blender | `4f3823e860d099dca814b5d54b52b8eef0a127eebd84a064536eb7d72e3f5142` |

`clips.svg` is a side orthographic projection of the 24 joints of `skins[0]`, connected to their parent joints, at four evenly spaced moments of each of the file's three animation clips (`Idle`, 4.0 s; `Regular_Jump`, 1.8 s; `Attack`, 2.8 s), one row per clip. The joint positions come from the file's own node transforms and animation samplers, with linear interpolation. It is a geometry diagram, not an API thumbnail or a render.

`idle.gif`, `jump.gif` and `attack.gif` are renders of the same GLB in Blender 5.2.1 (EEVEE, standard view transform, a sun and a fill light, a light gray world) through a fixed orthographic three-quarter camera framed on each clip's full extent. Every second frame of the clip was rendered at 300 × 380 pixels, scaled to 240 × 304, and assembled into a looping GIF at 12 frames per second with a 64-color palette and no dithering. They are renders of one observed output, not API thumbnails, and the lighting and camera are the render's, not Meshy's.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and FBX files are not part of the repository or a public download. Generation can produce different results.
