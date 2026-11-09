# Agent files for cookbook 15

These are the commands, client configurations and prompts that [cookbook 15](../README.md) uses to make a 3D asset with the Meshy CLI and place it in Unreal Engine through Unreal MCP. The recipe has no code: your coding agent runs everything here.

| File | What it is |
|---|---|
| [prompts.md](prompts.md) | Every prompt in the recipe, in the order you paste them |
| [mcp/claude-code.json](mcp/claude-code.json) | The Unreal MCP entry for Claude Code. Save it as `.mcp.json` in your project folder |
| [mcp/cursor.json](mcp/cursor.json) | The same entry for Cursor. Save it as `.cursor/mcp.json` in your project folder |
| [mcp/codex.md](mcp/codex.md) | The same entry for Codex, which reads TOML |

You only need the client files if the editor cannot write them for you. The console command in step 3 below writes the same entry.

## 1. Install the Meshy CLI and the skills

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

## 2. Turn on Unreal MCP in Unreal Engine 5.8

1. **Edit > Plugins**: enable **Unreal MCP** and **All Toolsets**, then restart the editor when it asks. Both depend on **Toolset Registry**, which is enabled with them.
2. **Edit > Editor Preferences > General > Model Context Protocol**: turn on **Auto Start Server**. Or start the server for this session from the console (the `` ` `` key):

```Unreal
ModelContextProtocol.StartServer
```

The server listens on `http://127.0.0.1:8000/mcp`. To use another port, change **Server Port Number** on the same page, or pass the port: `ModelContextProtocol.StartServer 8010`.

## 3. Write your agent's configuration

In the editor console, run the line for your agent:

```Unreal
ModelContextProtocol.GenerateClientConfig ClaudeCode
ModelContextProtocol.GenerateClientConfig Cursor
ModelContextProtocol.GenerateClientConfig Codex
```

`VSCode`, `Gemini` and `All` work too. The editor writes the file into the project folder: `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor and `.codex/config.toml` for Codex. Then start your agent from that folder, the one that holds the `.uproject` file.
