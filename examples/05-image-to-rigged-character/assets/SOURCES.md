# Published sample previews

These files come from the live Python run of September 25, 2026 (image-to-3d task `01a0db21-663f-7498-85f9-e4b1816f35a8`, rigging task `01a0db23-bbd2-7439-b39a-c981f4ac5aa8`). They were inspected locally on September 26, 2026.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/character-thumbnail.png`, copied unmodified: the image-to-3d thumbnail, before rigging | `ff775689a0b515cb303276a751b0c0108d1a81e121ed37deaf80a158885595c0` |
| `skeleton.svg` | `python/output/rigged-character.glb` | `aa423e393ab4294e08becc638008fa4e199332cf3929a1c8f23898fce5f8b598` |
| `walk-cycle.svg` | `python/output/walking.glb` | `7df7a7a9cea50c838246a99537d9a09ede73eb5497ba28e8e90f6afa7f14c152` |

`skeleton.svg` is a front orthographic projection. It draws every twelfth mesh vertex as a dot and the 24 joints of `skins[0]` at their rest-pose world positions, connected to their parent joints. `walk-cycle.svg` is a side orthographic projection of the same bones at six evenly spaced times of the 1.07-second walking animation. The joint positions come from the file's own node transforms and animation samplers, with linear interpolation. Both are geometry diagrams, not API thumbnails or renders.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and FBX files are not part of the repository or a public download. Generation can produce different results.
