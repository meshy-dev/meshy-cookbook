# Prompts for cookbook 15

The prompts from the [recipe](../README.md), in the order you paste them. Each one that makes an asset asks the agent to tell you every cost and wait for your approval before anything is charged, and to show you the concept image before it pays for the 3D model.

## Install the Meshy CLI and the skills (Step 1, spends no credits)

```text
Help me install Meshy CLI and the meshy-3d-agent skills: https://raw.githubusercontent.com/meshy-dev/meshy-3d-agent/main/INSTALL.md. Then run meshy balance and tell me my credit balance. Do not generate anything yet.
```

## Check the Unreal MCP connection (Step 2, changes nothing)

```text
List the Unreal MCP toolsets you can see. Tell me which tool, if any, can import a GLB file as an asset, and which one can place an actor in the level. Do not change anything in the project.
```

## Make the charging dock and place it in Unreal (Step 4, about 39 credits)

```text
Use the Meshy CLI to make an asset for my Unreal project in two stages. First make a concept image with text-to-image, using gpt-image-2, from this prompt word for word: "A chunky robot charging dock, the respawn checkpoint of a stylized platformer game, full object, three-quarter front view, centered with space around it, a round orange charging pad to stand on with yellow and black hazard stripes around its edge, a short rounded orange tower at the back with a battery meter of five thick green bars on its front, a scuffed steel base with four big bolts, stylized game art style, soft even studio lighting, plain white background, single object, no props, no text". Tell me the cost and wait for my OK. When the image is ready, show it to me and wait for my OK. Then turn that image into a textured 3D model with image-to-3d from the image task's ID, using meshy-7.1 geometry and meshy-7 PBR textures at 4K. Tell me that cost and wait for my OK. Submit each task with --async and wait on it until it finishes. If a wait is cut off, wait again on the same task ID and never create a task twice. Save the GLB as MeshyAssets/charging-dock.glb in this project folder. Then import it with Unreal MCP into /Game/Meshy/ChargingDock and place it in the open level about three meters in front of the PlayerStart, with its whole base on flat floor. If none of your Unreal MCP tools can import a file, tell me, wait while I drag the GLB into that Content Browser folder, and then place it.
```

## Make your own asset (about 39 credits)

```text
Use the Meshy CLI to make an asset for my Unreal project in two stages, the same way as before. First make a concept image with text-to-image, using gpt-image-2, from this prompt word for word: "<your image prompt>". Tell me the cost and wait for my OK, then show me the image and wait for my OK. Then turn that image into a textured 3D model with image-to-3d from the image task's ID, using meshy-7.1 geometry and meshy-7 PBR textures at 4K. Tell me that cost and wait for my OK. Submit each task with --async, wait on the same task ID until it finishes, and save the GLB as MeshyAssets/<name>.glb. Wait while I drag it into the Content Browser folder /Game/Meshy/<Name>, then place it in the level where I tell you, with its whole base on flat floor.
```
