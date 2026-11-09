# Unreal MCP for Codex

Codex reads MCP servers from a TOML file, so this configuration is written here as text. The editor writes it for you when you run this command in its console:

```Unreal
ModelContextProtocol.GenerateClientConfig Codex
```

The editor writes the Codex file only once and does not overwrite an existing one. To add the server to a Codex configuration you already have, add these lines to `~/.codex/config.toml`, or to `.codex/config.toml` in a project Codex trusts:

```toml
[mcp_servers.unreal-mcp]
url = "http://127.0.0.1:8000/mcp"
```

If you changed the server's port in **Edit > Editor Preferences > General > Model Context Protocol**, change `8000` to the same number. Start Codex from your project folder, the one that holds the `.uproject` file.
