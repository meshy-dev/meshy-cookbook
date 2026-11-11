# Evidence: Text to 3D preview prompts

Live runs from 2026-10-07 on `POST https://api.meshy.ai/openapi/v2/text-to-3d` with `ai_model: "latest"` (Meshy 7.1) unless noted. Each comparison is one sample per arm unless a count is given, so the results show what a wording controls, not how often it succeeds.

## Formula versus bare prompt (helmet)

| Arm | Prompt | Result |
|---|---|---|
| Bare | "a knight's helmet" | Ornate fantasy helmet with carved scrollwork and a pointed crest, none of it requested; 1,255,344 faces |
| Formula | "A medieval knight's helmet, tall rounded dome with a narrow horizontal eye slit and a pointed hinged visor, riveted cheek guards, raised ridge along the top from front to back, small breathing holes on the visor, realistic proportions, single standalone object" | Dome, eye slit, pointed visor, ridge, rivets and breathing slots followed; dented surface and the hinge not produced; 368,016 faces |

20 credits each.

## What detailed previews dropped, misread or added

| Prompt asked for | Preview produced | Kind |
|---|---|---|
| Dented battle-worn surface (helmet) | Smooth surface | Dropped |
| Pointed hinged visor (helmet) | Pointed visor, no hinge | Dropped |
| Thick braided beard reaching the belt (dwarf) | Short beard plus a thick braid around the neck that reads as a rope collar | Misread |
| Same beard wording, second run | Long beard, no braid | Dropped |
| Knee-length apron split between the legs (dwarf) | Bib over separate trousers, nothing below the belt | Misread |
| Same apron wording, second run | Knee-length belted coat | Misread |
| Oversized head; rolled sleeves (dwarf) | Head in normal proportion; long flared sleeves | Dropped |
| Nothing | Belt pouches | Added |
| Nothing | Fur cuffs on the boots | Added |

The largest and most common shapes were followed; small surface detail and specific accessories were not. Dwarf prompt: "A stocky dwarf blacksmith, short broad body with an oversized head and large hands, thick braided beard reaching the belt, knee-length apron split between the legs over a belted tunic, rolled sleeves, heavy boots, stylized proportions, single standalone character". The first run used `pose_mode: "a-pose"`; the second wrote the A-pose in the prompt with no `pose_mode`.

## Pose: 18 character previews, no standard A-pose

A standard A-pose means arms straight, angled about 45 degrees down, clear of the body.

| Preview setup | Previews | Arms clear of the body | Standard A-pose | Pose seen |
|---|---|---|---|---|
| `pose_mode: "a-pose"`, `latest` | 6 | 6 | 0 | Arms spread, elbows bent, palms up |
| `pose_mode` and A-pose words in the prompt, `latest` | 5 | 5 | 0 | Arms spread, elbows bent, palms up |
| A-pose words only, `latest` | 6 | 3 | 0 | 3 arms spread with palms up; 2 hands on hips; 1 arms hanging at the sides |
| `pose_mode: "a-pose"`, `meshy-6` | 1 | 1 | 0 | Arms spread lower, palms up |
| Comparison: Text to Image with `pose_mode`, then Image to 3D | 3 | 3 | 3 | Standard A-pose |

`pose_mode` is applied (the same pose came back in 11 of 11 runs with it), but on Text to 3D it gives an arms-out, palms-up pose. The A-pose words used: "standing in an A-pose with arms straight and angled down about 45 degrees away from the body, hands open and clear of the body, legs slightly apart".

One arms-out preview was remeshed, retextured and rigged: 24 joints, clean weights, no forearm or hand vertex weighted to the torso. But the bind pose has the elbows bent 75° against 19 to 29° on image-route rigs, and in Meshy's walking animation the hands do not face naturally. So the Text to 3D pose rigs but is not usable for animated characters. Pose words alone are not usable either: hands on hips and arms at the sides fuse the arms to the torso in the mesh.

## T-pose (2026-11-11)

The dwarf prompt above with `pose_mode: "t-pose"`, three previews on `latest` with `should_remesh: true` and `target_polycount: 30000` (20 credits each) and three on `model_type: "smart-topology"`, `ai_model: "meshy-t2.5"`, `target_polycount: 30000` (5 credits each).

| Preview setup | Previews | T-pose | Pose seen |
|---|---|---|---|
| `pose_mode: "t-pose"`, `latest` | 3 | 3 | Arms out and roughly level (one a little lower), palms down |
| `pose_mode: "t-pose"`, `meshy-t2.5` | 3 | 3 | Arms level, palms down |

Unlike `"a-pose"`, `"t-pose"` gives the pose it names on Text to 3D. The first preview of each was refined with `enable_pbr: true` and a texture prompt (10 credits) and rigged (5): 24 joints, no forearm or hand vertex weighted to the torso, walking and running clips that play. Bind pose: upper arms 24 to 34° below horizontal, elbows bent 22 to 31°. The `meshy-t2.5` model had small floating fragments at the wrists. The image skill's `references/rig-ready-characters.md` compares these rigs with the image-route rigs.

## Face counts of raw previews

| Preview | Faces (triangles) |
|---|---|
| Dwarf, A-pose in the prompt | 2,329,628 |
| Dwarf, `pose_mode: "a-pose"` | 1,325,402 |
| Helmet, two-word prompt | 1,255,344 |
| Helmet, detailed prompt | 368,016 |

All four exceed the 380,000-triangle limit the Rigging API sets. Counts were read from the GLB files; the task object does not report them.

## Remesh at generation

A preview with the dwarf prompt, `pose_mode: "a-pose"`, `should_remesh: true`, `target_polycount: 30000` came out at 31,105 faces. The refine kept 31,105 and rigging accepted the refine task directly: 24 joints, no forearm or hand vertex weighted to the torso. 35 credits (20 + 10 + 5) against 40 with a separate Remesh call. At 31,000 faces the mesh is smoother and the beard braids are softer, but the overall form holds.

## Props (2026-10-20)

Six props, one formula preview each on `latest` (Meshy 7.1), plus a two-to-four-word bare prompt for three of them. Every mesh was rendered untextured from the front, a raised three-quarter angle, both sides and the back. The same six ideas also went through the image route (see the image skill's evidence file). One sample per arm, 20 credits per preview.

### Formula versus bare

| Prop | Bare prompt and result | Formula result |
|---|---|---|
| Lantern | "an oil lantern": a round hurricane lantern with a globe and side guards, 883,656 faces | The requested square Victorian type, with a domed cap and a top loop, 483,604 faces. The flared base became a goblet-like pedestal, and the fuel tank was missing |
| Chair | "a wooden chair": a tub armchair with a solid curved back, 158,318 faces | Spindle back under a curved top rail, square seat, stretchers, 199,926 faces. The five spindles came out as four wide slats |
| Cottage | "a small house": a plain gabled house with a tiled roof, 1,120,710 faces | A stylized cottage with a curved roof, arched door and shuttered windows, 2,174,244 faces. The round chimney came out square, and a ring of bushes and rocks was added around the base |

Formula prompts:

- Lantern: "A Victorian hanging oil lantern, tall square body on a flared base, domed cap with small chimney vents, four tall window panels framed by slim corner posts, round loop handle on top, squat fuel tank at the bottom, realistic proportions, single standalone object"
- Chair: "A farmhouse dining chair, upright rectangular back with five vertical spindles under a curved top rail, square seat with rounded edges, four straight legs splayed slightly outward, stretcher bars joining the legs, realistic proportions, single standalone object"
- Cottage: "A small fantasy cottage, one story with a steep pitched roof and deep overhanging eaves, round chimney on one side, arched front door, two small square windows with shutters, flower box under one window, low raised foundation, stylized proportions, single standalone object"

### Formula only

| Prop | Prompt | Result | Faces |
|---|---|---|---|
| Sword | "A medieval longsword, long straight double-edged blade tapering to a point, shallow groove down the center of the blade, wide straight crossguard, long wrapped grip, round disc pommel, realistic proportions, single standalone object" | All five parts followed; standing point down | 47,142 |
| Plant | "A potted monstera plant, round tapered pot with a thick rim, about eight large split heart-shaped leaves on long stems, leaves spreading outward and upward from the center, realistic proportions, single standalone object" | Pot and split leaves followed; the leaves are thin sheets in six separate parts | 855,424 |
| Van | "A cartoon delivery van, short boxy body with an oversized rounded cab, large round headlights, four chunky wheels with deep treads, tall cargo box at the back, roof rack, wide front bumper, stylized proportions, single standalone object" | A realistic 1960s-style panel van. Headlights, wheels, roof rack and bumper followed; no cartoon look, no oversized cab, no separate cargo box | 1,713,544 |

### Follow-up variants

| Variant | Change | Result | Faces |
|---|---|---|---|
| Cottage v2 | Dropped "flower box under one window" and "low raised foundation" | No bushes or rocks; the walls end on a flat base. The chimney was square again | 1,189,696 |
| Lantern v2 | Parts stacked bottom to top ("short wide cylindrical fuel tank as the base, square body above it…"), "window openings" instead of "window panels", "large round loop handle arching over the top" | No pedestal, but the base was a flat square plinth, not a cylinder. The windows were cut through, showing a burner inside. The handle was a small hook on the cap | 502,930 |
| Van v2 | Style moved forward: "A cartoon delivery van with toy-like stylized proportions, …" | The same realistic panel van | 1,462,832 |
| Van v3 | "A cartoon toy delivery van with exaggerated chunky proportions, huge rounded cab taking up half the body, short stubby cargo box at the back, oversized wheels, …" | Still a realistic panel van, with bigger wheels. It added a driver figure, roof spotlights and a bull bar, none of them requested | 1,657,436 |

Findings:

- The formula gave the requested kind of object in 3 of 3 bare comparisons. Each bare prompt let the model choose the design.
- The object type and its main parts were followed on every prop. The previews missed these words: a style word that sets the whole look ("cartoon" gave a realistic van in 3 of 3, even when moved up front with "toy-like" and "exaggerated chunky proportions"), proportion words ("oversized rounded cab", "squat fuel tank", "tall cargo box"), part counts (five spindles became four slats), the shapes of small parts ("round chimney" was square in 2 of 2), and the size of a thin part ("large round loop handle arching over the top" became a small hook).
- "Window panels" gave solid panels; "window openings" cut through them.
- Ground-level details on a building ("low raised foundation", "flower box") came with an added ring of terrain. Without those details, the walls ended on a flat base.
- Raw face counts ran from 47,142 (sword) to 2,174,244 (cottage, a 52 MB GLB). Eight of the ten formula previews and two of the three bare previews were over 300,000.


## Task object gaps

The preview task object returns `consumed_credits`, `created_at`, `finished_at`, `id`, `mode`, `model_type`, `model_urls`, `name`, `progress`, `prompt`, `seed`, `started_at`, `status`, `task_error`, `texture_image_url`, `texture_prompt`, `texture_urls`, `thumbnail_url`, `type`. It does not return `ai_model`, `pose_mode`, `should_remesh` or a face count, so log request bodies on the client if you need to verify which model or pose ran.

## Sources

- [Text to 3D API](https://docs.meshy.ai/api/text-to-3d): `prompt` and `texture_prompt` max 800 characters; `target_polycount` 100 to 300,000 with `should_remesh` (default 30,000), 100 to 30,000 on `meshy-t2.5` (default 15,000) and 100 to 15,000 on `meshy-t2` (default 4,000); `model_type: "smart-topology"` defaults to `meshy-t2.5` and makes triangles only; `pose_mode` values `a-pose` and `t-pose`; `lowpoly` retires 2026-11-30.
- [Prompting Best Practices](https://docs.meshy.ai/webapp/guides/prompting): "key information placed first carries the highest weight"; "stone and wood and metal and glass" listed as a bad prompt.
- [Rigging API](https://docs.meshy.ai/api/rigging): at most 380,000 triangles (a quad counts as two), remesh to 300,000 or less first; textured humanoid models only.
- [Pricing](https://docs.meshy.ai/api/pricing).
