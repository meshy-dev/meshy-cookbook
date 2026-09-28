# Published sample previews

These files come from the live Python run of September 27, 2026 (image-to-3d task `01a0e485-ef93-709a-8fcc-c7a37bd47426`, retexture task `01a0e486-0838-7027-92dc-82c3f00c470e`). They were inspected locally the same day.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/restyled-prop-thumbnail.png`, copied unmodified: the retexture task's thumbnail | `269d96365e5c9ac55bf9c39df705e8af7151fd75fa72550fa13cdab962d07241` |
| `gray-oak.png` | `python/output/low-poly-prop-thumbnail.png`, copied unmodified: the image-to-3d task's thumbnail, before retexturing | `3c240dd62440f0f9aaac9b578326d772cacf522081276a8dea2af235a7b983ee` |
| `base-color.jpg` | `python/output/base-color.png`, the 2048 × 2048 base color map, scaled to 768 × 768 and saved as JPEG at quality 85 | `c1ae04ef044021d9d02751d020eb07b0a019066d1eb1da1eaed5c3f298e685af` |
| `metallic.jpg` | `python/output/metallic.png`, same treatment | `389a9b27667a5296aa8380df8c4c8e66582584736e997c59cc4c464950cf262a` |
| `roughness.jpg` | `python/output/roughness.png`, same treatment | `bf5091509e4015ffe7ca413db40ec3cbfdc5e8329d1170aa6f910ae2326a1c1a` |
| `normal.jpg` | `python/output/normal.png`, same treatment | `d6c67c3173f722f9c8ded7200f65f95b9572fe3f249b0ee4f22db64d747578da` |

The four texture previews are downscaled copies of the PNG maps Meshy returned under `texture_urls`. `restyled-prop.glb` carries JPEG copies of the same maps, with metallic and roughness combined into one image. No pixels were edited beyond scaling and JPEG compression.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB and texture files are not part of the repository or a public download. Generation can produce different results.
