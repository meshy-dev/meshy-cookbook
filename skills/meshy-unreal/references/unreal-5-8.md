# Unreal Engine 5.8

The skill is written for Unreal Engine 5.9. A project whose `.uproject` says
`"EngineAssociation": "5.8"` works the same way with the differences on this page. MeshyTools is
shared across versions. Prior v4 workflows were tested on 5.8.2; v5 verification is pending
as tracked in the [compatibility matrix](quickstart.md). Discover actual tools before use.

## Setup

- Unreal MCP is off until the user turns it on. **Edit > Plugins**: enable **Unreal MCP** and
  **All Toolsets** (both turn on **Toolset Registry**), then restart the editor when it asks.
  **Edit > Editor Preferences > General > Model Context Protocol**: tick **Auto Start Server**, or
  type `ModelContextProtocol.StartServer` in the **Cmd** box to start it once. Then
  `ModelContextProtocol.GenerateClientConfig` as on 5.9.
- There is no Python tool, so MeshyTools cannot be registered in a running editor. After writing
  its two files, ask the user to save their work and restart the editor once. Upgrading a copy
  that is already registered still needs no restart: overwrite the file and call `reload`.
- The editor does not run Claude Code, Codex or Cursor in its Assistant panel, and does not
  serve skills from `<project>/Skills/`. The agent runs in a terminal or IDE with the Meshy CLI.
- Connecting the Meshy MCP server inside the editor ([Unreal setup](unreal-setup.md) section 3)
  was tested on 5.9 only; 5.8 has the same plugin, with no Python tool to pair it with.

Check: `list_toolsets` lists about 50 toolsets, among them
`editor_toolset.toolsets.scene.SceneTools` and `EditorToolset.EditorAppToolset`.

## Tool names

| For | 5.9 | 5.8 |
|---|---|---|
| A toolset's tools and arguments | `describe_toolsets`, `describe_tools` | `describe_toolset` |
| Removing an actor | `EditorToolset.LevelToolset.RemoveFromScene` with `actor` `{refPath}` | `editor_toolset.toolsets.scene.SceneTools.remove_from_scene` with the `actor_path` |
| Viewport capture | `SceneCaptureToolset.SceneCaptureToolset.CaptureEditorViewport` | `EditorToolset.EditorAppToolset.CaptureViewport` |
| Other views (base color, wireframe), the game viewport | `SceneCaptureToolset` `Capture`, `CaptureGameViewport` | none |
| Importing a texture | `EditorToolset.TextureToolset.ImportFile` | `TextureTools.import_file` |
| Materials | `EditorToolset.MaterialToolset`, `EditorToolset.MaterialInstanceToolset` | `MaterialTools`, `MaterialInstanceTools` |
| Reading the editor log | `ConsoleToolset.LogsToolset` | `EditorToolset.LogsToolset` |

## Viewport capture

`CaptureViewport` takes `captureTransform` `{location, rotation}` and needs every `annotations`
field set. The PNG comes back in base64 in `returnValue.image.data`, not as an image: decode it
to a file in `JOB_DIR` with a one-line script, then open it with the host's image-reading tool.
Without a shell, say the placement is checked by the numbers only.

## Imports

Never use Epic's `StaticMeshTools.import_file` or `SkeletalMeshTools.import_file` for Meshy
files on 5.8: they use the legacy FBX importer, refuse GLB, and give an FBX a wrong material and
no Nanite. Use MeshyTools.
