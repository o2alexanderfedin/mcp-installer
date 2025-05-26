# mcp-installer - A MCP Server to install MCP Servers

This server is a server that installs other MCP servers for you. Install it, and you can ask Claude to install MCP servers hosted in npm or PyPi for you. Requires `npx` and `uv` to be installed for node and Python servers respectively.

**✨ Enhanced for Claude CLI Support**: This fork has been modified to work with the `claude` CLI tool, automatically detecting and using the appropriate installation method.

![image](https://github.com/user-attachments/assets/d082e614-b4bc-485c-a7c5-f80680348793)

### How to install:

#### For Claude CLI (Recommended):
```bash
claude mcp add mcp-installer npx --args @o2alexanderfedin/mcp-installer
```

#### For Claude Desktop:
Put this into your `claude_desktop_config.json` (either at `~/Library/Application Support/Claude` on macOS or `C:\Users\NAME\AppData\Roaming\Claude` on Windows):

```json
  "mcpServers": {
    "mcp-installer": {
      "command": "npx",
      "args": [
        "@o2alexanderfedin/mcp-installer"
      ]
    }
  }
```

### Claude CLI vs Claude Desktop

This enhanced version automatically detects which installation method to use:

- **Claude CLI**: Servers are installed immediately and available right away
- **Claude Desktop**: Servers are added to config file and require app restart

### Example prompts

> Hey Claude, install the MCP server named mcp-server-fetch

> Hey Claude, install the @modelcontextprotocol/server-filesystem package as an MCP server. Use ['/Users/anibetts/Desktop'] for the arguments

> Hi Claude, please install the MCP server at /Users/anibetts/code/mcp-youtube, I'm too lazy to do it myself.

> Install the server @modelcontextprotocol/server-github. Set the environment variable GITHUB_PERSONAL_ACCESS_TOKEN to '1234567890'

### Features Added for Claude CLI

- **Automatic Detection**: Detects if `claude` CLI is available
- **Immediate Availability**: Servers installed via CLI are available instantly
- **Graceful Fallback**: Falls back to Claude Desktop config if CLI unavailable
- **Environment Variables**: Supports setting environment variables via `--env`
- **Custom Arguments**: Supports custom arguments via `--args`
