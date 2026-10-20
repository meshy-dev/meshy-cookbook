# Published sample previews

These files come from the live Python run of October 19, 2026 (image-to-3d task `01a155d6-4188-7132-bbf4-e94e28b935f6`, rigging task `01a155d7-e6ce-7532-bf0f-50105ff63958`, animation task `01a155d8-2c8c-7453-95a6-f62a47073d09`). They were inspected locally on October 19, 2026.

| Published asset | Source | SHA-256 of source |
|---|---|---|
| `result.png` | `python/output/character-thumbnail.png`, copied unmodified: the image-to-3d thumbnail, before rigging | `dabc03b47f38b85b7f405e94bb7ee44ab015519b31a7aa1e161cbdce4877023c` |
| `threejs-page.gif` | `web/public/models/character.glb`, made from `python/output/animated-character.glb` by `web/optimize.mjs`, rendered in three.js | `d91691ef98cb9f573f77dbc3c673f371cd4f35a6653f1dfd6d77e96eaaa2b930` |

`threejs-page.gif` shows the scene of `web/main.js` rendered by three.js 0.186.1 in Chrome: the same lights, ground, grid, follow camera, second copy made with `SkeletonUtils.clone`, clip cross-fades and run speed (2.2 m/s). A capture script rebuilt that scene in the page and stepped the clips by exactly 1/12 second instead of the page's real-time loop: idle for 1.0 s, the D key held for 1.8 s (run to the right), Space at 2.8 s (attack), then idle until 6.2 s. The 75 frames were rendered at 400 × 300 pixels and assembled into a looping GIF at 12 frames per second with 64 colors and no dithering. It is a render of one observed output, not an API thumbnail.

See [input provenance](../input/SOURCES.md) for the sample input.

These are previews of one observed output. The ignored runtime GLB files are not part of the repository or a public download. Generation can produce different results.
