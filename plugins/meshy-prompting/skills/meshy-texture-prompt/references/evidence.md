# Evidence: texture prompts

Live runs from 2026-10-07. Refines went to `POST /openapi/v2/text-to-3d` with `{"mode":"refine","preview_task_id":"<id>","texture_prompt":"<prompt>","enable_pbr":true}`; retextures went to `POST /openapi/v1/retexture` with `text_style_prompt` on a remeshed dwarf mesh. Results were judged from the 512-pixel thumbnails, so fine detail such as scratches could not be checked. One sample per arm unless a count is given.

## Formula versus bare prompt (helmet refine, 10 credits each)

| Arm | Prompt | Result |
|---|---|---|
| Bare | "iron helmet" | Plain grey steel, light rust, rivets the same color as the shell |
| Formula | "Realistic medieval style. Dome and visor: dark hammered iron with fine scratches. Rivets: brass. Top ridge: polished steel. Cheek guards: dark iron with an engraved vine pattern along the edges. Moderate wear, light rust in the dents and around the rivets. Satin finish on the metal." | Brass rivets, dark iron, rust patches, engraved vine pattern |

The skill's example replaces "Top ridge" with "The raised strip running over the top", which has not been tested.

## What the detailed refines followed and missed

| Prompt asked for | Refine produced |
|---|---|
| Rivets: brass | Brass rivets |
| Top ridge: polished steel | Dark, same as the shell |
| Cheek guards: engraved vine pattern along the edges | Engraving beside the eye slit |
| Dome and visor: dark hammered iron | Dark blue-black metal; hammered texture not visible at thumbnail size |
| Face and hands: warm tan skin, rosy cheeks and nose | As asked |
| Beard and hair: grey with lighter streaks | As asked |
| Tunic: faded red wool with a visible weave | As asked |
| Apron, belt and boots: dark brown leather with scuffs and small burn marks on the apron | Belt and boots brown leather; apron charcoal grey |
| Stylized hand-painted style | Smooth 3D-render look |

Dwarf prompt: "Stylized hand-painted style. Face and hands: warm tan skin with rosy cheeks and nose. Beard and hair: grey with lighter streaks. Tunic: faded red wool with a visible weave. Apron, belt and boots: dark brown leather with scuffs and small burn marks on the apron. Moderate wear on the apron and boots. Matte skin and cloth, slight sheen on the leather."

## The apron: color words and damage words (Retexture on the remeshed dwarf, 10 credits each)

Only the apron slot changed between runs; the rest of the prompt was the dwarf prompt above with "Stylized game-art style" and the apron given its own slot.

| Apron slot | Apron color |
|---|---|
| Dark brown leather with scuffs and small burn marks | Charcoal grey |
| Dark brown leather with scuffs | Dark grey-brown |
| Brown leather | Muted grey-brown |
| Saddle-brown leather (3 runs) | Warm brown in all 3 |
| Saddle-brown leather with small burn marks | Warm brown, slightly redder |

Generic color words drifted toward grey, and "small burn marks" pushed "dark brown" to charcoal. A specific hue held in 4 of 4 runs, including the run with burn marks. The apron came out charcoal whether grouped with the belt and boots or given its own slot, so the grouping was not the cause.

## Sources

- [Text to 3D API](https://docs.meshy.ai/api/text-to-3d): refine `texture_prompt` max 800 characters; `enable_pbr` default false; `texture_image_url` loses to `texture_prompt` when both are set.
- [Image to 3D API](https://docs.meshy.ai/api/image-to-3d): `texture_prompt` max 800 characters; `texture_prompt` wins over `texture_image_url`.
- [Image to 3D API](https://docs.meshy.ai/api/image-to-3d) and [Models](https://docs.meshy.ai/api/models): `texture_model` (`meshy-7`, `meshy-n1`, `meshy-6-lite`) picks the texture model in the same task with any `ai_model` at no change in price; `meshy-7` is the default for `meshy-7.1`, `meshy-t2.5` and `meshy-t2`; `meshy-n1` paints a 2K base color from images only and returns `400` for `texture_prompt`, `enable_pbr: true`, `4k` and `8k`.
- [Retexture API](https://docs.meshy.ai/api/retexture): `text_style_prompt` max 800 characters; `image_style_url` wins over `text_style_prompt`; `multiview_image_urls` needs `ai_model: "meshy-7"`; `enable_pbr` default false; 8K costs 15 credits.
- [Prompting Best Practices](https://docs.meshy.ai/webapp/guides/prompting): "stone and wood and metal and glass" listed as too many materials.
- [AI Texturing guide](https://docs.meshy.ai/webapp/guides/3d-model/ai-texturing): troubleshooting advice to add material, era, wear and color descriptors.
- [UV Unwrap API](https://docs.meshy.ai/api/uv-unwrap): GLB input up to 40,000 faces, 5 credits.
