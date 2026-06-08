# MarkdownUI MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes your MarkdownUI documents and collections as tools any MCP-capable agent can use — Hermes, VS Code Copilot, Claude Desktop, Cursor, etc.

## Requirements

- Node.js 18+
- MarkdownUI installed (provides the SQLite database)

## Setup

```bash
cd mcp-server
npm install
```

## Usage

The server speaks MCP over stdio — you don't run it directly. Register it with your agent of choice.

### Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  markdownui:
    command: "node"
    args: ["C:/Code/Personal/MarkdownUI/mcp-server/server.js"]
```

Then restart Hermes. Tools will appear prefixed with `mcp_markdownui_*`.

### VS Code (Copilot / Continue / etc.)

The project already has `.vscode/mcp.json`. Add an entry:

```json
{
  "servers": {
    "markdownui": {
      "command": "node",
      "args": ["${workspaceFolder}/mcp-server/server.js"],
      "type": "stdio"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "markdownui": {
      "command": "node",
      "args": ["C:/Code/Personal/MarkdownUI/mcp-server/server.js"]
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MARKDOWNUI_DB_PATH` | `%APPDATA%\com.markdownui.app\markdown-ui.db` | Override DB path |

## Tools

| Tool | Description |
|---|---|
| `list_collections` | List all collections |
| `get_collection` | Get a collection by ID |
| `create_collection` | Create a new collection |
| `update_collection` | Rename / update a collection |
| `delete_collection` | Delete a collection and all its documents |
| `list_documents` | List documents in a collection (no content) |
| `get_document` | Get a document with full markdown content |
| `search_documents` | Search documents by name |
| `create_document` | Create a new document |
| `update_document` | Update a document's name and/or content |
| `delete_document` | Delete a document |
