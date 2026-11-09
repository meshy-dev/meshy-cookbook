# Prompts for cookbook 15

The prompts from the [recipe](../README.md), in the order you paste them. Each one that makes an asset asks the agent to show the cost from `meshy make --dry-run` and wait for your approval before anything is charged.

## Install the Meshy CLI and the skills (Step 1, spends no credits)

```text
Help me install Meshy CLI and the meshy-3d-agent skills: https://raw.githubusercontent.com/meshy-dev/meshy-3d-agent/main/INSTALL.md. Then run meshy balance and tell me my credit balance. Do not generate anything yet.
```

## Check the Unreal MCP connection (Step 2, changes nothing)

```text
List the Unreal MCP toolsets you can see. Tell me which tool, if any, can import a GLB file as an asset, and which one can place an actor in the level. Do not change anything in the project.
```

## Make the charging dock and place it in Unreal (Step 4, about 30 credits)

```text
Use the Meshy CLI to make an asset for my Unreal project from this description, word for word: "A chunky robot charging dock that works as the respawn checkpoint in a stylized platformer: a round orange charging pad to stand on, a short rounded orange tower at the back with a battery meter of five thick green bars on its front, a scuffed steel base with four big bolts, two thick black cables looping off the back, and yellow and black hazard stripes around the edge of the pad". Show me the cost from meshy make --dry-run first and wait for my OK. Then submit it with --async and wait on the task until it finishes. If a wait is cut off, wait again on the same task ID and never create the task twice. Save the GLB as MeshyAssets/charging-dock.glb in this project folder. Then import it with Unreal MCP into /Game/Meshy/ChargingDock and place it in the open level about three meters in front of the PlayerStart, standing on the floor. If none of your Unreal MCP tools can import a file, tell me, wait while I drag the GLB into that Content Browser folder, and then place it.
```

## Make your own asset (about 30 credits)

```text
Use the Meshy CLI to make an asset for my Unreal project from this description, word for word: "<your description>". Show me the cost from meshy make --dry-run first and wait for my OK. Then make it the same way as before: submit it with --async, wait on the same task ID until it finishes, and save it as MeshyAssets/<name>.glb. Wait while I drag it into the Content Browser folder /Game/Meshy/<Name>, then place it in the level where I tell you, standing on the floor.
```
