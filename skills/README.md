# Meshy agent skills

Use these skills with Claude Code, Cursor or Codex to write Meshy prompts or create and work with 3D assets in Unreal Engine.

## Choose a skill

| Skill | What you can do |
|---|---|
| [`meshy-text-to-3d-prompt`](meshy-text-to-3d-prompt/SKILL.md) | Write a description of an object's shape for Text to 3D. |
| [`meshy-image-prompt`](meshy-image-prompt/SKILL.md) | Write prompts for prop or character reference images that will become 3D models. |
| [`meshy-texture-prompt`](meshy-texture-prompt/SKILL.md) | Describe materials, colors and wear for texturing or restyling a model. |
| [`meshy-edit-prompt`](meshy-edit-prompt/SKILL.md) | Write an instruction to change a selected part of a model in Meshy Edit. |
| [`meshy-unreal`](meshy-unreal/SKILL.md) | Create, adapt, import and place assets in Unreal Engine 5.9 Preview, with guidance for 5.8. |

## Install

From a clone of the cookbook, copy the skills you want into your project's agent skills directory:

| Agent | Project directory |
|---|---|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/skills/` |
| Codex | `.agents/skills/` |

For example, from the cookbook root, install the Unreal skill for Codex:

```bash
mkdir -p /path/to/your-project/.agents/skills
cp -R skills/meshy-unreal /path/to/your-project/.agents/skills/
```

Copy the whole skill directory, including its references, assets and scripts. No plugin installation is needed to install these skills.

The four prompt-writing skills produce prompts and settings without calling Meshy or spending credits. Python 3 is needed only for their optional prompt checker. Generating assets requires a Meshy account and credits; local Unreal imports and edits do not.

For Unreal, follow the [quickstart](meshy-unreal/references/quickstart.md) to connect your agent to the editor and set up the tools needed for your task.

## Things to ask

- **Text to 3D:** “Write a Meshy prompt for a low-poly treasure chest.”
- **Reference images:** “Write an image prompt for a knight I can turn into a riggable 3D character.”
- **Textures:** “Write a texture prompt for this helmet with weathered brass and dark leather.”
- **Meshy Edit:** “I selected the left shoulder. Write an edit prompt to add a raven there.”
- **Unreal Engine:** “Import this GLB beside the selected actor, then make it smaller.”

[Meshy documentation](https://docs.meshy.ai/) · [Unreal compatibility](meshy-unreal/references/validation.md) · [Contributing](../CONTRIBUTING.md#agent-skills)
