# Prompts for cookbook 16

The prompts from the [recipe](../README.md), in the order you paste them. Each one that spends credits states the cost and asks the agent to wait for your approval before anything is charged.

## Install the Meshy CLI and the skills (Step 1, spends no credits)

```text
Help me install Meshy CLI and the meshy-3d-agent skills: https://raw.githubusercontent.com/meshy-dev/meshy-3d-agent/main/INSTALL.md. Then run meshy balance and tell me my credit balance. Do not generate anything yet.
```

## Make the concept image (Step 3, 9 credits)

```text
Use the Meshy CLI to make a character concept image for my Unreal project. Run meshy text-to-image create with --ai-model gpt-image-2-5-flare --pose-mode a-pose --aspect-ratio 3:4 and this prompt, word for word: "A sturdy scrapyard mechanic, short cropped hair, welding goggles pushed up on the forehead, sleeveless orange work vest over a grey shirt, fingerless gloves, tool belt with small pouches, cargo trousers tucked into heavy boots, full body, front view, centered with space around it, stylized game-art proportions, soft even studio lighting, plain white background, single character, no props, no text". It costs 9 credits: tell me that and wait for my OK. Then submit it with --async and wait on the same task ID until it finishes. If a wait is cut off, wait again on the same task ID and never create the task twice. Save the image into MeshyAssets/mechanic/concept/ with -o, show it to me, and tell me its task ID. Do not make the 3D model yet.
```

## Make the model and rig it (Step 4, 20 credits)

```text
Now make the 3D model from that image task and rig it. First run meshy image-to-3d create --input-task-id <the image task ID> --model-type smart-topology --ai-model meshy-t2.5 --target-polycount 30000 --texture-model meshy-7 --enable-pbr true --texture-resolution 2k --pose-mode a-pose. When it finishes, run meshy rigging create --input-task-id <the model task ID> --height-meters 1.8 -o MeshyAssets/mechanic/ --all-assets. Together they cost 20 credits, 15 for the model and 5 for the rig: tell me that and wait for my OK. Submit each one with --async and wait on the same task ID until it finishes. If a wait is cut off, wait again on the same task ID and never create a task twice. Then list the files in MeshyAssets/mechanic/.
```

## Place the character in the level (Step 6, Unreal MCP, spends no credits)

Needs Unreal MCP, set up as cookbook 15's Step 2 describes. Save the level yourself afterwards with **File > Save Current Level**.

```text
Use Unreal MCP to place my character in the open level. Add /Game/Meshy/Mechanic/rigged_character about two meters in front of the PlayerStart, facing the PlayerStart, with its feet on the floor, and set it to play /Game/Meshy/Mechanic/walking_fbx on a loop. Check where its feet are and which way its face points, and fix the placement if they are off. Do not import, delete or change any assets, do not click any editor buttons, and do not save: I'll save the level myself.
```

## Make your own character's image (9 credits)

```text
Use the Meshy CLI to make a character concept image for my Unreal project. Run meshy text-to-image create with --ai-model gpt-image-2-5-flare --pose-mode a-pose --aspect-ratio 3:4 and this prompt, word for word: "<your description>, full body, front view, centered with space around it, soft even studio lighting, plain white background, single character, no props, no text". It costs 9 credits: tell me that and wait for my OK. Then make it the same way as before, save it into MeshyAssets/<name>/concept/, show it to me, and tell me its task ID. Do not make the 3D model yet.
```

Then paste the Step 4 prompt with `<name>` in place of `mechanic`.
