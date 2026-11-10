---
name: meshy-text-to-3d-prompt
description: Write, review or fix the `prompt` for a Meshy Text to 3D preview task, the untextured mesh that the API (`POST /openapi/v2/text-to-3d`), the web app and the Meshy MCP all start from. Use this skill whenever the user wants a prompt for a 3D model from text, asks what to type into Meshy, pastes a Meshy prompt and asks why the mesh ignored details, came out ornate, has the arms fused to the body or has too many faces, or when another skill or tool (meshy-3d-generation, the Meshy MCP) is about to call Text to 3D and needs the prompt and parameters written well. It covers shape-only wording, which details move to parameters (pose_mode, target_polycount, should_remesh, smart-topology), and when to send a character down the image route instead. Not for texture or retexture prompts (meshy-texture-prompt), Text to Image prompts that feed Image to 3D (meshy-image-prompt), or Meshy Edit (meshy-edit-prompt); it writes the prompt and parameters, it does not call the API.
license: MIT
metadata:
  author: meshy-dev
  version: "0.2.0"
---

# Meshy Text to 3D preview prompts

The Text to 3D preview makes an untextured mesh, so its prompt describes shape and nothing else. Colors, materials and surface damage go into the refine step's `texture_prompt`; pose and face count go into parameters. The field is `prompt`, maximum 800 characters, and Meshy's prompting guide says the earliest words carry the most weight, so the subject comes first.

The rules below were tested live against `ai_model: "latest"` (Meshy 7.1): characters and a helmet on 2026-10-07, six more props on 2026-10-20, one or a few samples per comparison. [references/evidence.md](references/evidence.md) has the runs and what each one showed.

## Workflow

1. **Pick the route first.** If the user wants to rig or animate a character, do not write a preview prompt: send them to the image route (`meshy-image-prompt`). In 18 character previews Text to 3D never produced a standard A-pose. `pose_mode: "a-pose"` gives an arms-out, palms-up pose in 11 of 11 runs; it rigs, but the hands face the wrong way in the walk animation. Statues, printable figures and other things that will not be animated stay on Text to 3D. For props, both routes work, so choose by what the prop needs (see "Props" below). If its look depends on a style such as cartoon, on a number of parts, or on particular proportions, suggest the image route. In a six-prop test, Text to 3D got each object's type and main parts but dropped those words, while the image route kept them every time.
2. **Sort the idea into three piles.** Shape words go in the prompt. Colors, materials and damage go in a "texture ideas" note for the refine (`meshy-texture-prompt`). Pose, face budget and topology go in parameters (table below).
3. **Write the prompt with the formula**, then read it once as the model will: subject first, largest forms before small ones, at most about eight shape details.
4. **Check it.** Run `python3 scripts/check_prompt.py --kind preview "…"` (path relative to this skill's directory). It flags length, material and color words, damage words, pose words, "low-poly", ground-level details on a building, cartoon or toy style words, "window panels", and a missing closing phrase. Fix what it reports.
5. **Deliver prompt, parameters, texture ideas and assumptions** in the output format at the end. State which values you chose that the idea did not give.

## The formula

```
[Subject], [overall shape and proportions], [main parts, largest to smallest], [large surface relief], [shape style], single standalone object
```

| Slot | What goes in it | Example words |
|---|---|---|
| Subject | A specific noun | "medieval knight's helmet", not "helmet" |
| Shape and proportions | Silhouette words | tall, squat, tapered, rounded, oversized head, short broad body |
| Main parts | Large forms first, then smaller ones | dome, then visor, then cheek guards, then rivets |
| Large surface relief | Detail big enough to change the geometry | rivets, raised ridges, carved patterns, breathing holes |
| Shape style | How the forms are drawn | realistic proportions, stylized, chibi, faceted low-poly look |
| Closing phrase | Tells the model it is one object | "single standalone object" or "single standalone character" |

Tested examples:

- Prop: `A medieval knight's helmet, tall rounded dome with a narrow horizontal eye slit and a pointed hinged visor, riveted cheek guards, raised ridge along the top from front to back, small breathing holes on the visor, realistic proportions, single standalone object`
- Prop: `A medieval longsword, long straight double-edged blade tapering to a point, shallow groove down the center of the blade, wide straight crossguard, long wrapped grip, round disc pommel, realistic proportions, single standalone object` (every part followed, 47,142 faces)
- Character (for a statue or print, not for rigging): `A stocky dwarf blacksmith, short broad body with an oversized head and large hands, thick braided beard reaching the belt, knee-length apron split between the legs over a belted tunic, rolled sleeves, heavy boots, stylized proportions, single standalone character`

The bare prompt "a knight's helmet" produced an ornate fantasy helmet with scrollwork and a crest that nobody asked for. The formula prompt produced the dome, eye slit, pointed visor, ridge, rivets and breathing slots. A short prompt is an invitation for the model to design; a formula prompt is a specification.

## Leave these out of the preview prompt

- **Colors and material words.** The preview has no texture, so "dark iron", "leather apron" and "brass rivets" add nothing to the mesh and crowd out shape words. Material words name the surface, not the shape: write "treasure chest", not "wooden treasure chest"; "apron", not "leather apron". Keep them for the texture ideas.
- **Small surface damage.** "Dented battle-worn surface" produced a smooth mesh. Dents, scratches and rust are texture work.
- **Pose.** See step 1. Writing "standing in an A-pose, arms 45 degrees from the body" without `pose_mode` gave hands on hips in one run and arms against the body in 3 of 6; with `pose_mode` the words changed nothing.
- **Face count and the word "low-poly".** "Low-poly" changes the look (faceted), not the count. Set the count with parameters.
- **Scenes, groups, dense repeats and thin parts.** Describe one object. Lattices, scaffolding, piles of small items, wires, strings, feathers and plumes are the common causes of failed generations in Meshy's error documentation. Pick the main object of a scene and say so in the assumptions.
- **Lighting, background, text and logos.** They mean nothing to a mesh generator.
- **Long detail lists.** The preview dropped details from longer lists (the hinge on the visor, the oversized head, the rolled sleeves) and invented others (belt pouches, fur boot cuffs). About eight shape details is the practical ceiling; put the ones that matter most earliest.
- **Ground around a building.** "Low raised foundation" and "flower box under one window" on a cottage came with a ring of bushes and rocks around the base; without them, the walls ended on a flat base. Leave out foundations, paths, plants and ground unless the base is part of the asset.

Two wording findings worth knowing: "thick braided beard reaching the belt" became a rope-like braid around the neck in one run and a plain long beard in another, so a detail that depends on reading two words together ("braided" + "beard") is at risk; and "knee-length apron split between the legs" became a bib over trousers, which happens to be good for rigging, so for characters prefer clothing that ends above the knee or splits between the legs.

## Props

Six props were tested on 2026-10-20: a lantern, a chair, a longsword, a potted plant, a cottage and a cartoon van. Each got one formula preview, and some got follow-up variants. The runs are in [references/evidence.md](references/evidence.md).

- **What held:** the type of object and its main parts, on every prop. Against a two-to-four-word bare prompt, the formula gave the requested kind of object in 3 of 3: a square Victorian lantern instead of a round hurricane lantern, and a spindle-back chair instead of a tub armchair.
- **What the preview dropped:**
  - A style that sets the whole look. "Cartoon delivery van" gave a realistic panel van in 3 of 3, even with "toy-like" and "exaggerated chunky proportions" right after the subject.
  - Proportions and counts: "oversized rounded cab", "squat fuel tank", "five vertical spindles" (it made four wide slats), and "round chimney" (square in 2 of 2).
  - The size of a thin part: "large round loop handle arching over the top" became a small hook.

  When these matter, use the image route (`meshy-image-prompt`). The design shows up in a 9-credit image and can be fixed before any 3D is paid for.
- **Openings:** "window panels" gave solid panels; "window openings" cut through them. If a part should be a hole, call it an opening.
- **Parts that sit on top of each other:** listing them bottom to top ("fuel tank as the base, square body above it") got rid of a pedestal the first wording produced, but the tank still came out as a flat square plinth, not a cylinder. The order fixed where the parts went, not their shapes.
- **Face counts:** raw prop previews ran from 47,142 faces (sword) to 2,174,244 (cottage, a 52 MB GLB), and 8 of the 10 formula previews were over 300,000. For a game engine, a web viewer or AR, set `should_remesh: true` and a `target_polycount`, or generate on Smart Topology (next section).

## Set these with parameters, not words

| Want | Parameter | Notes |
|---|---|---|
| A-pose or T-pose | `pose_mode: "a-pose"` or `"t-pose"` | Applied consistently, but on Text to 3D the result is arms-out, palms-up, not a standard A-pose. Rig-ready characters take the image route. |
| A face budget on a standard model, or a prop for a game engine, web viewer or AR | `should_remesh: true`, `target_polycount: N` (100 to 300,000, default 30,000) | Default `should_remesh` is false on Meshy 6 and 7, which left character previews at 368,000 to 2.3 million faces (above Rigging's limit of 380,000 triangles) and prop previews at 47,000 to 2.2 million. A preview at 30,000 kept its count through refine and rigged directly. |
| Clean game-ready topology at a set count | `model_type: "smart-topology"`, `ai_model: "meshy-t2.5"` (100 to 30,000 faces, default 15,000) or `"meshy-t2"` (100 to 15,000, default 4,000), `target_polycount: N` | A different generator, not a cleanup pass: the mesh is generated at the count you set, triangles only, with softer detail and separate open parts, and `should_remesh` is ignored. `meshy-t2.5` is the default when `ai_model` is left out and has the sharper detail; `meshy-t2` is faster and keeps parts separate. 5 credits instead of 20. Use it for game assets and whenever the user gives a face budget, as Meshy's model guide does for game characters and props; keep a standard model for an asset that needs Meshy 7.1's dense detail, such as a hero render or a 3D print. A character to rig still goes through the image route, where Smart Topology with `pose_mode` rigged cleanly (2026-11-08). |
| Quad topology | `topology: "quad"` with `should_remesh: true` | Not available on Smart Topology (`meshy-t2.5`, `meshy-t2`), which makes triangles only; `quad` with them returns `400`. |
| Metal that reads as metal | `enable_pbr: true` on the refine | A refine setting, but decide it now so the texture prompt can rely on it. |

Credits: a preview is 20 on `latest` (Meshy 7.1) and `meshy-6`, 5 on `meshy-6-lite`, `meshy-t2` and `meshy-t2.5`; the refine is 10 more. The task object does not echo `ai_model`, `pose_mode` or a face count, so record the request body yourself if you need to verify a run later.

## Output format

Give the user all four parts; an application can take the JSON, a person can read the lines.

```
Prompt: <the preview prompt, under 800 characters>
Parameters: {"mode":"preview","ai_model":"latest"}   plus pose_mode / should_remesh / target_polycount / model_type when they apply
Texture ideas: <colors, materials and damage moved out of the prompt, for the refine>
Assumptions: <values you chose that the idea did not give, such as style or proportions>
Note: <only when needed: "this character should go through Text to Image with pose_mode and Image to 3D so it can be rigged", or "the cartoon look (or exact part count) is more likely to hold on the image route">
```

When the user's idea is a scene or group, say which object you kept. When the user asked for something the preview cannot do (a pose, a color, a specific face count by words), say where it went instead of silently dropping it.

## When the result comes back wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Ornate details nobody asked for | Prompt too short, model filled the gaps | Add the shape slots; name the parts you want |
| A named detail is missing | Too many details, or the detail is surface-level (dents, hinge) | Cut the list to the eight that matter, move surface detail to the texture prompt, regenerate (same 20 credits) |
| Part misread (braid around the neck, apron as a coat) | Two-word detail read as two things | Reword as one unambiguous noun phrase, or accept and fix at Edit |
| Arms against the body, hands on hips | Pose words without `pose_mode` | Rig-ready characters: image route. Otherwise set `pose_mode` and accept the arms-out pose |
| Over 380,000 triangles, rigging refuses it (`400`) | Default `should_remesh: false` | Regenerate with `should_remesh: true, target_polycount: 30000`, or Remesh to 300,000 or less (5 credits). A character you will animate belongs on the image route with Smart Topology (`meshy-image-prompt`) |
| Realistic model from a cartoon or toy prompt | The preview did not follow a style word that sets the whole look (0 of 3) | Image route: a Text to Image prompt with the style, then Image to 3D |
| Bushes, rocks or ground around a building | Ground-level details in the prompt (foundation, flower box) | Drop them and describe only the building |
| Solid panels where windows should be | "Panels" was read as solid | Call them "openings" |
| Prop GLB is tens of megabytes | Raw preview at 0.5 to 2.2 million faces | `should_remesh: true` with a `target_polycount`, or Remesh (5 credits) |

## Resources

| File | Use it when |
|---|---|
| [references/evidence.md](references/evidence.md) | You need the test runs behind a rule: prompts, counts, what came out, including the six-prop test |
| [assets/meta-prompt-code.txt](assets/meta-prompt-code.txt) | The user is building an app that turns ideas into preview prompts with a language model; returns one line of JSON |
| [assets/meta-prompt-plain.txt](assets/meta-prompt-plain.txt) | Same, for a person who will read and paste the result |
| `scripts/check_prompt.py` | Lint a drafted prompt before handing it over: `python3 scripts/check_prompt.py --kind preview "<prompt>"` |

To run it in code, the Meshy Cookbook recipe [Generate a 3D model from a description in two stages](https://www.meshy.ai/developers/cookbook/recipes/generate-3d-model-from-text/) makes the preview and the refine in Python or TypeScript. It sends its one prompt to the preview and no `texture_prompt` to the refine, so pass it a shape-only prompt from this skill and add the texture ideas as `texture_prompt` on the refine request.

Related skills: `meshy-texture-prompt` for the refine's `texture_prompt`, `meshy-image-prompt` for the image route and rig-ready characters, `meshy-edit-prompt` for changing one part of a finished model, `meshy-3d-generation` to run the task.
