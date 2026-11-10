---
name: meshy-texture-prompt
description: Write, review or fix a Meshy texture prompt, the `texture_prompt` on a Text to 3D refine or an Image to 3D task and the `text_style_prompt` on Retexture, in the API, the web app's AI Texturing and the Meshy MCP. Use this skill whenever the user wants to texture, retexture, recolor or restyle an existing model, describes a look ("make it obsidian with gold trim", "weathered bronze", "hand-painted game style"), asks why a part came out the wrong color or grey, why a named part was ignored, or why the metal does not look like metal, or when another skill is about to send a refine or retexture request and needs the prompt written. It covers the style-then-part-by-part formula, specific hues, damage words that shift colors, ambiguous part names, enable_pbr and the 800-character limit. Not for shape or mesh prompts (meshy-text-to-3d-prompt), image prompts for Image to 3D (meshy-image-prompt) or Meshy Edit, which changes geometry (meshy-edit-prompt); it writes the prompt and parameters, it does not call the API.
license: MIT
metadata:
  author: meshy-dev
  version: "0.2.0"
---

# Meshy texture prompts

The mesh does not change during texturing, so the prompt describes surfaces only: one material, color and pattern per visible part, the wear level, and the finish. The same wording goes in `texture_prompt` (Text to 3D refine, Image to 3D) and `text_style_prompt` (Retexture); both are capped at 800 characters. If the user also supplies a style image, the image wins: Retexture prefers `image_style_url` over the text, and Image to 3D prefers `texture_prompt` over `texture_image_url`, so send one or the other.

The rules come from live runs on 2026-10-07 (refines on `latest`, Retexture on a remeshed dwarf, 9 texture tasks in all). [references/evidence.md](references/evidence.md) has the prompts and what came out.

## Which texture model

Meshy paints with one of four texture models, chosen with `texture_model` on Image to 3D (since 2026-11-03) and with `ai_model` on a Text to 3D refine or a Retexture. This skill writes for Meshy 7 (`meshy-7`), the default for Meshy 7.1 and for the Smart Topology models `meshy-t2.5` and `meshy-t2`: it takes the text prompt, makes PBR maps and 2K, 4K or 8K textures. Meshy 6 and Meshy 6 Lite take a prompt and PBR too. Meshy N1 (`meshy-n1`) takes no prompt at all: it paints a 2K base color from the input image or reference images, and `texture_prompt`, `enable_pbr: true`, `4k` and `8k` with it return `400`. When the user wants Meshy N1 (stylized or low-poly game assets, an unlit or toon look, the smallest file), there is no texture prompt to write; say so, and send them to `meshy-image-prompt` for the image that drives the look. The texture model does not change the price: a Smart Topology Image to 3D task is 15 credits textured with any of them at 2K, a refine or Retexture 10. On 2026-11-08 the same 5,000-face Smart Topology prop came with base color, metallic, roughness and normal maps in a 5.9 MB GLB from Meshy 7 with PBR, and with a base color map alone in a 2.7 MB GLB from Meshy N1.

## Workflow

1. **Find out what the model looks like.** Ask for the mesh's thumbnail or the prompt it was made with, or read the task's `thumbnail_url`. Texture prompts name parts, and a part the mesh does not have cannot be painted; a part you do not name gets whatever the model guesses.
2. **Write the prompt with the formula**: overall style, then one slot per part in the form "Part: material, color, pattern", then wear, then finish.
3. **Name hues, not color families.** "Saddle-brown leather" held in 4 of 4 runs; "brown" and "dark brown" drifted to grey-brown, and "dark brown leather with scuffs and small burn marks" came out charcoal. A damage word that implies a color (burn marks, soot, scorching) pulls a generic color toward it but not a specific hue.
4. **Check it.** Run `python3 scripts/check_prompt.py --kind texture "…"` (path relative to this skill's directory). It flags length, shape and lighting words, generic color words, more than four materials and missing part slots.
5. **Set `enable_pbr: true`** when the model has metal parts or mixes metal and non-metal, so the metallic and roughness maps separate them. It costs nothing extra. The web app turns PBR on with texturing; the API does not. With Meshy N1 it returns `400`, so switch to `meshy-7` when the user needs PBR.
6. **Deliver prompt, parameters and assumptions** in the output format at the end.

## The formula

```
[Overall style]. [Part]: [material, color, pattern]. [Part]: [...]. [Wear level]. [Finish per material].
```

Tested examples:

- Prop: `Realistic medieval style. Dome and visor: dark hammered iron with fine scratches. Rivets: brass. The raised strip running over the top: polished steel. Cheek guards: dark iron with an engraved vine pattern along the edges. Moderate wear, light rust in the dents and around the rivets. Satin finish on the metal.`
- Character: `Stylized game-art style. Face and hands: warm tan skin with rosy cheeks and nose. Beard and hair: grey with lighter streaks. Tunic: faded red wool with a visible weave. Apron: saddle-brown leather. Belt and boots: brown leather. Moderate wear on the apron and boots. Matte skin and cloth, slight sheen on the leather.`

The bare prompt "iron helmet" gave plain grey steel with light rust and rivets the same color as the shell. The formula prompt gave brass rivets, dark iron, rust patches and an engraved vine pattern.

## Rules, each with the run behind it

- **One slot per part.** "Rivets: brass" placed the material; "iron and brass" would leave the model to decide where. Small, repeated, easy-to-identify parts (rivets, belt, boots) took their materials reliably.
- **Group parts only when they share one material.** "Apron, belt and boots: dark brown leather" got the belt and boots right while the apron went charcoal; the cause turned out to be the burn-mark words rather than the grouping, but a part whose color matters deserves its own slot so a miss is easy to diagnose.
- **Name a part by what is visible on the mesh.** "Top ridge: polished steel" was ignored; the ridge stayed the color of the shell. When a name could match several regions, describe the shape and position: "the raised strip running over the top". The engraved vine pattern asked for "along the cheek-guard edges" appeared beside the eye slit instead, so placement words are followed loosely.
- **Three or four materials at most.** Meshy's prompting guide lists "stone and wood and metal and glass" as a prompt to avoid.
- **Damage belongs here, not in the mesh prompt.** Dents, scratches and rust are texture work; the preview ignores them. Add one sentence for the overall wear level and do not invent damage the user did not ask for.
- **No shape words.** "Taller", "thicker", "add a buckle" have no effect or appear as painted-on detail. Shape changes are Meshy Edit's job.
- **No lighting or shadows.** They are painted into the base color map. PBR maps are how metal reads as metal.
- **Style words are followed loosely.** "Stylized hand-painted style" came out as a smooth 3D-render look; "stylized game-art style" read as intended. Name a concrete style when it matters.
- **Models made elsewhere:** run UV Unwrap first if the UVs are poor. Seams from bad UVs show through any prompt.

## Output format

```
Prompt: <the texture prompt, under 800 characters>
Parameters: {"enable_pbr":true}   plus texture_resolution "4k" or "8k" when asked (8k costs 15 credits instead of 10), and "texture_model":"meshy-7" on Image to 3D when the user has been using another texture model
Assumptions: <values you chose that the idea did not give, such as a hue or a style>
```

For Retexture say which input carries the model (`input_task_id` for a Meshy task, `model_url` for a file) and set `ai_model` only when the user names one; with `meshy-n1` the look comes from `image_style_url` or `multiview_image_urls`, not from a prompt. A refine or Retexture at 2K or 4K costs 10 credits.

## When the result comes back wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| A part is grey or muted instead of the color asked | Generic color word, or a damage word that implies soot or char | Name the hue ("saddle-brown", "oxblood", "slate-blue"); keep damage words off that slot or name the hue beside them |
| A named part kept the base material | The name matched nothing on the mesh ("top ridge") | Describe its shape and position |
| Pattern in the wrong place | Placement words are loose | Accept, or move the pattern to a part that is easy to identify |
| Metal looks like painted plastic, or no metallic, roughness or normal map in the output | `enable_pbr` off, or the texture model is Meshy N1, which makes base color only | Retexture with `meshy-7` and `enable_pbr: true` (10 credits), or regenerate the Image to 3D task with `texture_model: "meshy-7"` and `enable_pbr: true` |
| `400` on a request that carries a texture prompt | The texture model is Meshy N1 (`texture_model` or `ai_model` `meshy-n1`), which takes no prompt | Drop the prompt and let the image drive the look, or switch to `meshy-7` |
| Result ignores the prompt generally | Too few descriptors | Add material, era, wear and color descriptors, the fix in Meshy's AI Texturing troubleshooting |
| Seams or smeared regions on an uploaded model | Poor UVs | UV Unwrap (5 credits, GLB up to 40,000 faces), then retexture |

## Resources

| File | Use it when |
|---|---|
| [references/evidence.md](references/evidence.md) | You need the runs behind a rule: the helmet and dwarf refines, the five apron retextures, what each produced |
| [assets/meta-prompt-code.txt](assets/meta-prompt-code.txt) | The user is building an app that turns a look into a texture prompt with a language model; takes a model description and an optional model image, returns one line of JSON |
| [assets/meta-prompt-plain.txt](assets/meta-prompt-plain.txt) | Same, for a person who will read and paste the result |
| `scripts/check_prompt.py` | Lint a drafted prompt: `python3 scripts/check_prompt.py --kind texture "<prompt>"` |

To run it in code, the Meshy Cookbook recipe [Restyle a model with a text prompt](https://www.meshy.ai/developers/cookbook/recipes/restyle-3d-model/) sends a `text_style_prompt` to Retexture with `enable_pbr` in Python or TypeScript; pass it a prompt from this skill.

Related skills: `meshy-text-to-3d-prompt` for the mesh the texture goes on, `meshy-image-prompt` when a reference image should drive the look instead, `meshy-edit-prompt` when the shape needs to change, `meshy-3d-generation` to run the task.
