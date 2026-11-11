# Your first asset in Unreal

Open your project with a local terminal or IDE agent using this skill. Start with one request:

> Import this GLB into my project and place it beside the selected actor. Keep its materials.

Or, using something already in the level:

> Make this chest larger and change only this instance to blue.

The agent should inspect the project, perform the requested edit, check the result and report
whether it is saved. These local workflows need no Meshy login or paid generation. For a new
model, try “Create a weathered treasure chest for my game”; the agent will establish the look,
size and cost before generating it. Start with one asset before expanding to a batch.

Already connected? Begin with your request. The setup below is needed only once. For known
platform coverage and remaining gaps, see [validation evidence](validation.md).

## Connect once

1. Confirm the `.uproject`, open level and engine build. `.uproject` EngineAssociation can be a
   source-build identifier rather than a version; inspect the connected editor's version too.
   With several editors open, verify project identity before mutations and use distinct ports.
2. Install this complete skill directory into the selected agent's project skills location
   (Claude Code `.claude/skills/`, Cursor `.cursor/skills/`, Codex `.agents/skills/`), or use the
   suite's installer with `--skill meshy-unreal`. Ensure `assets/` and `scripts/` are included.
   For new generations, install the four Meshy prompt-writing skills beside it: this skill
   uses them to write its prompts and falls back to its own templates without them.
3. In Unreal **Edit > Plugins**, enable Unreal MCP and All Toolsets (or the specific required
   toolsets). Save existing work and restart only if plugin activation requires it.
4. In Unreal's Cmd box run `ModelContextProtocol.GenerateClientConfig` with your agent name,
   e.g. `ClaudeCode`, `Cursor` or `Codex`. Restart/reconnect the agent from the project directory
   and approve/trust that project's connection. Preserve other servers/configuration.
5. Discover toolsets and schemas, confirm project identity, then install/check
   [MeshyTools](meshy-toolset.md) if needed. Tell the user briefly what project files it adds.
6. For a paid Meshy operation only, check Node/CLI, sign in if needed and quote using the shared
   [setup](setup.md) and [delivery](delivery.md). An already authenticated account is reused.
   For MegaJam eligibility/perks see [the dated jam reference](megajam.md).


## Windows terminal/IDE walkthrough

- Open the actual project in Unreal. Open PowerShell or your agent's terminal at that same
  folder, using `Set-Location -LiteralPath 'C:\Users\NAME\Documents\Unreal Projects\Game'`.
- Follow steps 2–5 above. Generated agent config avoids guessing Windows-specific MCP syntax.
  A Codex project must be trusted before its project config is used.
- If Meshy generation is needed, check `node --version`, then use `npm.cmd install -g meshy-cli@0.8`
  and `meshy.cmd --version` when PowerShell's script policy prevents the `.ps1` wrapper. Do not
  change execution policy or use Administrator mode to fix a wrapper issue.
- For bundled helpers use `py -3` when Python 3.11+ is installed. Otherwise run them through
  Unreal's embedded Python using the `runpy` examples; no separate Python install is required.
- Quote every path as one argument, including non-ASCII names and paths with spaces. File paths
  passed to Unreal must exist on the editor's machine. A cloud/container agent needs an explicit
  transfer/local execution path; `127.0.0.1` in a remote container is not the desktop editor.

On macOS/Linux the equivalent terminal path uses `cd`, `npm` and normally `python3`. On macOS,
Launcher-started Unreal may not inherit Node/adapter PATH; [setup](unreal-setup.md) explains it.
