# Unreal setup

Contents: 1. connect the agent to the editor · 2. install MeshyTools · 3. Meshy tools inside the
editor (optional) · 4. editor problems.

These setup steps spend no Meshy credits. Start with the [recommended quickstart](quickstart.md). This page is written for Unreal Engine 5.9; a project on 5.8 follows
[Unreal Engine 5.8](unreal-5-8.md) where that page differs. Read the `.uproject` file's
`EngineAssociation` and confirm the live editor build/project; source builds may use a GUID. When a step needs a click in the
editor, tell the user which, one step at a time, and check each one through Unreal MCP.

## 1. Connect the agent to the editor

Unreal MCP runs inside the open editor and listens on the user's computer only, at
`http://127.0.0.1:8000/mcp`. On 5.9 it starts with the editor. There are two ways to reach it.

**From a terminal or IDE agent (Claude Code, Cursor, Codex, VS Code, Gemini).** In the **Cmd** box
at the bottom of the editor, write the agent's configuration into the project folder:
`ModelContextProtocol.GenerateClientConfig ClaudeCode` (or `Cursor`, `Codex`, `VSCode`,
`Gemini`). Claude Code reads `.mcp.json`, Cursor `.cursor/mcp.json`, Codex `.codex/config.toml`
(only in a project Codex trusts). Then restart the agent from the project folder and approve the
project's `unreal-mcp` server. If the command isn't available, the entry is
`{"mcpServers": {"unreal-mcp": {"type": "http", "url": "http://127.0.0.1:8000/mcp"}}}` in
`.mcp.json` (Cursor: the same without `"type"`; Codex: `[mcp_servers.unreal-mcp]` with
`url = "http://127.0.0.1:8000/mcp"`).

**From Unreal's own Assistant panel.** Epic's current setup documentation uses **Edit > Editor
Preferences > General > Unreal Assistant > External Agent**, then **Use External Agent**. Select
Claude Code, Codex, Cursor or OpenCode and install its adapter as listed in
[the official panel guide](https://dev.epicgames.com/documentation/unreal-engine/run-external-ai-agents-in-the-unreal-assistant-panel-in-unreal-engine).
Do not confuse the external agent with Epic's own Unreal Assistant service. The editor starts the
agent's session in the project folder and hands it Unreal MCP itself, so no configuration file
is needed, and the agent has a shell, so a skill installed in the project and the Meshy CLI work
as in a terminal. What the user needs:

- The agent's adapter installed (for Claude Code:
  `npm install -g @agentclientprotocol/claude-agent-acp`). The editor asks once to approve
  starting it.
- An editor that can find it. The editor looks on its own `PATH`, and on a Mac an editor opened
  from the Epic Games Launcher has only `/usr/bin:/bin:/usr/sbin:/sbin`, with neither the adapter
  nor `node`: the selector then says "Could not find claude-agent-acp", however it was installed.
  Start the editor from a terminal instead, passing the `.uproject` path to `UnrealEditor`.

In one prior 5.9.0 Preview session (recorded in this skill before 2026-11-10), the agent did the work (it
loaded this skill, ran the Meshy CLI and called MeshyTools through Unreal MCP), but the panel
showed "Answer generation failed" in place of its answer and the chat took no further prompts.
Treat this as a build/adapter-specific observation, not a failure of every panel configuration.
Use a terminal/IDE route if it reproduces; record the exact build, OS and adapter for the release matrix.

**The editor toolsets.** Epic's known issue UE-412135 leaves the toolset plugins off in new 5.9
projects: `list_toolsets` then offers no level, asset, capture or Python tools. Check the
`.uproject` file's `Plugins` list; when it has no enabled `AllToolsets` entry, add this one (keep
the JSON valid and the other entries as they are), then ask the user to save their work and
restart the editor:

```json
{ "Name": "AllToolsets", "Enabled": true, "TargetAllowList": [ "Editor" ] }
```

Check: `list_toolsets` lists over 100 toolsets, among them `EditorToolset.LevelToolset`,
`SceneCaptureToolset.SceneCaptureToolset` and
`editor_toolset.toolsets.python_scripting.PythonScriptingTools`. Unreal MCP shows the agent only
four discovery tools (`list_toolsets`, `describe_toolsets`, `describe_tools`, `call_tool`) and
reaches every toolset through them, so a short tool list is normal. Use `describe_tools` for a
tool's exact arguments before the first call; tool names and shapes change between engine
versions.

**Skills served by the editor.** A folder holding a `SKILL.md` under `<project>/Skills/` is listed
by `ToolsetRegistry.AgentSkillToolset` to every agent connected to the editor, with no restart.
When the user wants teammates' agents, or Epic's own assistant, to find this skill, offer to copy
the whole `meshy-unreal` folder to `<project>/Skills/meshy-unreal/`, and each installed Meshy
prompt-writing skill folder beside it.

Say this once, on first setup: Epic counts what the plugin sends to the agent's AI provider as
Licensed Technology under the Unreal Engine EULA, and the user is responsible for the provider
not training on it, so they should check their agent's data settings.

## 2. Install MeshyTools

Follow [MeshyTools](meshy-toolset.md): run the bundled hash-checked installer, which preserves existing startup
code and refuses unowned/edited toolsets, then register it in the running editor
with `execute_python`. No restart is needed when the editor toolsets are already on. When
`AllToolsets` had to be added, write the MeshyTools files first so that one restart covers both.
After a restart, the editor log has the line `MeshyTools: registered with the toolset registry`.

If it is missing, read the editor's output log with `ConsoleToolset.LogsToolset` (search
`MeshyTools` and `LogPython`). A Python error there names the line; check the installed checksum/version and the actual plugin/API availability before changing code.

Tell the user, in one line, that MeshyTools is a versioned Python integration in their project that adds
import and placement tools to Unreal MCP, and how to remove it.

## 3. Meshy tools inside the editor (optional)

Unreal Engine 5.9 can connect to other MCP servers and list their tools as a toolset. With the
Meshy MCP server connected, an agent that has no terminal (Epic's own assistant, or any client
that only speaks to Unreal MCP) can generate with Meshy and then import with MeshyTools. Offer it
when the user asks for Meshy inside Unreal's assistant or their agent has no shell. An agent with
a shell keeps using the Meshy CLI as this skill describes; it does not need this.

A person or local filesystem-capable agent must bootstrap this optional path; a shell-less
client cannot create its own launcher, credential file or installed skill. On Windows, use the
recommended terminal/IDE + CLI path until a Windows external-server launcher has been tested.
The steps below are the characterized macOS/Linux optional path.

The user does the step that involves their API key. Never ask for the key in chat, read it, or
write it yourself.

1. **You** write an executable launcher script `meshy-mcp.sh` in a folder outside the project,
   for example `~/.meshy/unreal/`. Explain this optional user-level write outside the
   project before creating it; the user's request for this setup covers the launcher, not credentials.
   It holds no secret. Replace `NODE_DIR` with the folder that
   holds `node` on this computer:

   ```sh
   #!/bin/sh
   export PATH="NODE_DIR:/usr/bin:/bin"
   cd -- "$(dirname -- "$0")" || exit 1
   exec npx -y @meshy-ai/meshy-mcp-server
   ```

   The `PATH` line matters because an editor opened from the Epic Games Launcher does not have
   the shell's `PATH`.
   **The user** then creates a file named `.env` in that folder with one line: `MESHY_API_KEY=`
   followed by their key from <https://www.meshy.ai/developers/keys>. The launcher explicitly changes to its own folder so the server can read `.env` there,
   independently of the editor's current directory. Keep that folder outside source control.
2. **You** enable the plugin: add
   `{ "Name": "MCPClientToolset", "Enabled": true, "TargetAllowList": [ "Editor" ] }` to the
   `.uproject` file's `Plugins` (All Toolsets lists it but does not turn it on), and ask for one
   editor restart.
3. **You** register the server with `ConfigSettingsToolset.SetSectionProperties`: container
   `Editor`, category `Plugins`, section `MCP Toolset Servers`, and `propertiesJson` holding
   `MCPServers` with one entry: `name` `Meshy`, `transport` `Stdio`, `exePath` the absolute path
   of the launcher, `bEnabled` true. Read the section first with `GetSectionPropertyValues` and
   send back its existing entries unchanged plus the new one. The same list is under **Edit >
   Editor Preferences > Plugins > MCP Toolset Servers**.

Check: within a few seconds `list_toolsets` shows `Meshy`, and its `meshy_check_balance` (free)
returns the balance. An authentication error there means the key in `.env` is wrong.

The `Meshy` toolset carries its own instructions, including asking before any tool that costs
credits; follow them. Save files into the project with `meshy_download_model` and `save_to` set
to an absolute path under `MeshyAssets/`, then import with MeshyTools. Tested on macOS with 5.9.0
Preview; the launcher above is for macOS and Linux.

## 4. Editor problems

- **Port 8000 is in use** (`LogModelContextProtocol` says so in the Output Log): change **Server
  Port Number** on the Model Context Protocol page of **Edit > Editor Preferences**, or start the
  editor with `-ModelContextProtocolPort=8010`, then run `GenerateClientConfig` again and restart
  the agent. Each open editor needs its own port.
- **The port is in use right after the editor crashed or was force-quit:** Unreal's crash
  reporter starts with the editor's open connections and keeps the port. Ask the user to close
  the crash reporter window, then restart the editor. To restart the editor, ask the user to quit
  it normally (File > Exit) rather than force-quit it.
- **The editor asks to restore packages at start:** it quit with unsaved changes. Until the user
  answers that dialog, Unreal MCP may not answer; ask them to choose, then carry on.
- **"Not run: the Unreal Editor is running a slow task":** the editor is still building an
  import or compiling shaders. Nothing changed; wait a few seconds and send the call again.
- **Unreal MCP stops answering mid-task:** a dialog is open in the editor (a save, import or
  message dialog). Ask the user to close it, then carry on. Never open dialogs yourself.
- **A tool call times out:** the editor runs tool calls one at a time, and some agents give up
  on a call after about two minutes. Never send Unreal calls in parallel, and import one file per
  call.
- **The agent sees no Unreal tools:** the editor was not restarted after enabling the plugins,
  the server is not running, or the agent was started from another folder than the one holding
  the configuration file.
- **A Mac editor quits at start with a Metal Toolchain error:** run
  `xcodebuild -downloadComponent MetalToolchain` in a terminal, then open the editor again.
- **Windows paths:** the default `Documents\Unreal Projects` path has a space. Quote every path,
  and pass absolute paths to MeshyTools.
- **The asset already exists:** an import does not replace unless you pass `replace_existing`
  true. Use it to update the same model; use a new `asset_name` or folder for a different one.
- **Collision is wrong:** inspect the imported collision and the project's import defaults.
  A convex hull may close a doorway and a mesh may have no useful collision at all. Choose
  collision for the requested gameplay and test it in play. Vehicle mechanics require separate
  gameplay setup, not just a vehicle-shaped mesh.
