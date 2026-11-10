# Meshy agent skills

Prompt-writing skills and an Unreal Engine workflow skill. The four prompting skills write good prompts for [Meshy](https://www.meshy.ai): one skill per place you type a prompt, each built from live A/B tests rather than guesswork. Ask your coding agent (Claude Code, Cursor, Codex) for a Meshy prompt and the matching skill writes it, with the settings to use and what to expect.

The four prompting skills only write prompts and settings; they never call Meshy, so you need no API key or credits to use them. Paste the result into the Meshy web app, or let the [meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent) skills or the Meshy MCP server run it through the API.

## Unreal Engine

[`meshy-unreal`](meshy-unreal/SKILL.md) creates, adapts, imports and places assets in Unreal Engine
5.9 Preview, with a 5.8 compatibility path. Start from text, an image, an existing Meshy task or
a local model. It also supports local size/material changes and optional humanoid rigging and
animation. Local edits and imports need no Meshy login; paid generation uses the Meshy CLI
with an eligible account and the user's authorization.

Try “Import this GLB beside the selected actor” or “Make this prop smaller and blue.” Copy the
whole skill directory, including `assets/`, `scripts/` and `references/`, then follow its
[quickstart](meshy-unreal/references/quickstart.md). See [validation evidence](meshy-unreal/references/validation.md)
for tested engine coverage and remaining gaps. This is an Unreal workflow, not a UEFN skill.

## Prompt-writing skills

| Skill | Where the prompt goes | Describes | Leaves out |
|---|---|---|---|
| [`meshy-text-to-3d-prompt`](meshy-text-to-3d-prompt/) | Text to 3D prompt (web app); `prompt` on the preview task (API), 800 characters | Shape: silhouette, parts, proportions, large relief | Colors, materials, damage, pose, face count |
| [`meshy-image-prompt`](meshy-image-prompt/) | Text to Image or Image to Image prompt, when the picture will go into Image to 3D | The whole object as it should be converted: view, materials, lighting, background; A-pose characters for rigging | Props, text, scenes, a pose that conflicts with `pose_mode` |
| [`meshy-texture-prompt`](meshy-texture-prompt/) | AI Texturing prompt (web app); `texture_prompt` on refine and Image to 3D, `text_style_prompt` on Retexture (API), 800 characters | Surfaces: material, color, pattern and wear per part, finish | Shape changes, lighting, shadows |
| [`meshy-edit-prompt`](meshy-edit-prompt/) | Meshy Edit prompt box (web app only, after drawing a lasso) | The selected part by name and side, its new shape, what is left after a removal | "it", "keep everything else unchanged", colors and materials |

Two rules apply everywhere: put the subject first (Meshy's prompting guide says the earliest words carry the most weight), and set anything a setting controls with the setting (`pose_mode`, `target_polycount`, `remove_background`, `enable_pbr`).

## Things to ask

- "Write me a Meshy Text to 3D prompt for a low-poly treasure chest for a mobile game."
- "I want a knight I can rig and animate in Unity. What should I generate, in what order, with what settings?"
- "My dwarf's leather apron came out grey after texturing. Here's the prompt I used; fix it."
- "In Meshy Edit I lassoed the left shoulder and typed 'raven on shoulder', but the raven went on the other side. What should I type?"

## Before using the prompt-writing skills

- **Python 3** runs the optional prompt checker in each skill. Nothing else is required to use the skills.
- **A Meshy account** to run the prompts. Edit is available in the web app only.
- **Plans:** `nano-banana-pro` needs a Pro plan or above. The skills default to `gpt-image-2-5-flare`, which works on every plan at the same 9 credits and followed the image formula most closely in testing.
- **Credits:** each skill states what its tasks cost. A rig-ready character, for example, is three tasks and 29 credits: an A-pose image (9), a textured Smart Topology model (15) and the rig (5).

## What each prompt-writing skill contains

- `SKILL.md`: the workflow, the formula with a slot table, tested example prompts, the rules with the run behind each one, an output format and a table of symptoms and fixes.
- `references/evidence.md`: the test runs behind each rule: the prompts, the settings, how many runs, and what came out.
- `assets/meta-prompt-code.txt` and `assets/meta-prompt-plain.txt` (three of the four skills): system prompts that turn a rough idea into a formula prompt with a language model, for people building their own prompt helpers. The code version returns one line of JSON under 800 characters; the plain version returns labeled lines. Both were tested on Claude Sonnet 5.5 and Claude Haiku 4.5.
- `scripts/check_prompt.py`: a prompt checker that needs only Python 3, `python3 scripts/check_prompt.py --kind preview|image|texture|edit "<prompt>"`. It flags the mistakes the tests found most often.

## Install

From a clone of the cookbook, copy the skill directories you want into your project's agent skills directory:

| Agent | Project directory |
|---|---|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/skills/` |
| Codex | `.agents/skills/` |

For example, from the cookbook root, install the Text to 3D prompt skill for Claude Code:

```bash
mkdir -p /path/to/your-project/.claude/skills
cp -R skills/meshy-text-to-3d-prompt /path/to/your-project/.claude/skills/
```

Copy the whole skill directory, including its references, assets and scripts. Every skill is self-contained; no plugin installation is needed.

[Meshy documentation](https://docs.meshy.ai/) · [Contributing](../CONTRIBUTING.md#agent-skills)
