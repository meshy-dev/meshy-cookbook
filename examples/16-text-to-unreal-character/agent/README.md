# Agent files for cookbook 16

These are the setup commands and prompts that [cookbook 16](../README.md) uses to make a rigged character with the Meshy CLI for Unreal Engine 5.8. The recipe has no code: your coding agent runs the Meshy commands, you import the files in the editor, and the agent can place the character in your level through Unreal MCP.

| File | What it is |
|---|---|
| [prompts.md](prompts.md) | Every prompt in the recipe, in the order you paste them |

Unreal MCP is optional: one prompt uses it to place the character in your level. To set it up, follow [cookbook 15's agent files](../../15-text-to-unreal-asset/agent/README.md), which hold the editor steps and the MCP client configurations for Claude Code, Cursor and Codex.

## Install the Meshy CLI and the skills

Needs Node.js 22.12 or newer and a paid Meshy plan (Pro or above). Paste this into your agent:

```text
Help me install Meshy CLI and the meshy-3d-agent skills: https://raw.githubusercontent.com/meshy-dev/meshy-3d-agent/main/INSTALL.md. Then run meshy balance and tell me my credit balance. Do not generate anything yet.
```

Or run the same steps yourself:

    npm install -g meshy-cli@0.8
    meshy auth login
    npx -y skills add meshy-dev/meshy-3d-agent --skill meshy-3d-generation --skill meshy-3d-printing -g -y
    meshy balance

Outside an agent, add `-a claude-code`, or your agent's name, to the `npx -y skills add` line so the skills install for that agent. `meshy auth login` opens your browser to sign in. On a machine without a browser, use `meshy auth login --device` and open the link it prints. No API key is involved.

## The three Meshy commands

The prompts have the agent run these, from your Unreal project folder. Each `create` prints the task ID that the next command takes.

    meshy text-to-image create --ai-model gpt-image-2-5-flare --pose-mode a-pose --aspect-ratio 3:4 --prompt "<description>" -o MeshyAssets/mechanic/concept/
    meshy image-to-3d create --input-task-id <image task ID> --model-type smart-topology --ai-model meshy-t2.5 --target-polycount 30000 --texture-model meshy-7 --enable-pbr true --texture-resolution 2k --pose-mode a-pose
    meshy rigging create --input-task-id <model task ID> --height-meters 1.8 -o MeshyAssets/mechanic/ --all-assets

They cost 9, 15 and 5 credits. None of them has a dry run.
