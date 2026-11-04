# Published sample previews

These files come from the live Python run of October 19, 2026 (image-to-3d task `01a155ff-7c14-722b-affa-d4e3810eee04`, rigging task `01a15600-f9d6-7795-b336-468014506c03`). They were inspected locally on October 19, 2026.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/character-thumbnail.png`, copied unmodified: the image-to-3d thumbnail, before rigging | `73bda9ec60d5a80a61a31d68fc346d4625abeb0b2b589cc5cc9b56429ab4b973` |
| `skeleton.svg` | `python/output/rigged-character.glb` | `f0054bea8bb93b39dd6d4aed7b49f3f3933c68c9f86ecc8a82819ed0a1e32f22` |
| `walk-cycle.svg` | `python/output/walking.glb` | `51e08a1deddcf8dc22606ac962af552803c2382c4f2209ac73774c646e7b6eea` |

`skeleton.svg` is a front orthographic projection. It draws every twelfth mesh vertex as a dot and the 24 joints of `skins[0]` at their rest-pose world positions, connected to their parent joints. `walk-cycle.svg` is a side orthographic projection of the same bones at six evenly spaced times of the 1.07-second walking animation. The joint positions come from the file's own node transforms and animation samplers, with linear interpolation. Both are geometry diagrams, not API thumbnails or renders.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and FBX files are not part of the repository or a public download. Generation can produce different results.
