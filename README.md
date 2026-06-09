# MarkdownUI

A Markdown document viewer and editor with embedded Mermaid diagram support, built with Tauri + React.

## Features

- **Markdown Editor**: Full-featured Monaco editor with custom dark blue theme
- **Live Preview**: Real-time markdown rendering with support for:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Embedded Mermaid diagrams with theme support (both ` ```mermaid ` and `:::mermaid` syntax)
  - Code blocks with syntax highlighting (Prism)
- **Collections**: Organize documents into collections
- **Auto-save**: Optional automatic saving of document content
- **Export Options**:
  - Markdown (.md) - Raw markdown file
  - HTML - Styled document with embedded diagrams
  - PDF - Print-ready document (requires Chrome/Chromium)
- **MCP Server**: Embedded [Model Context Protocol](https://modelcontextprotocol.io/) server — expose your documents and collections to any AI agent over HTTP
- **Zoom Controls**: Adjust preview zoom level (30% - 300%)
- **Dark Mode**: Full dark/light theme support across all UI elements
- **Unified Header**: Clean single-header layout with all controls
- **Custom Navigation**: Resizable sidebar with snap-to-collapse behavior
- **Enhanced Scrollbars**: Custom styled scrollbars for improved visibility
- **Smart Navigation**:
  - **Go to Heading**: Click the icon next to any heading in the preview to jump to that line in the editor
  - **Context Menu**: Improved copy functionality with "Copy" and "Copy as Markdown" options
- **Visual Improvements**:
  - Refined code block styling in light and dark modes
  - Fixed semantic rendering for better accessibility

## Installation

Download the latest release for your platform from the [GitHub Releases](https://github.com/buchenberg/MarkdownUI/releases) page.

**Supported Platforms:**
- **Windows**: Installer (`.msi`)
- **macOS**: Disk Image (`.dmg`)
- **Linux**: Debian package (`.deb`) and AppImage

## Usage

1. **Toggle Sidebar**: Click the hamburger menu (☰) to show/hide the sidebar
2. **Create a Collection**: Click "New" in the Collections section
3. **Create a Document**: Select a collection, then click "New" in Documents
4. **Edit Markdown**: Write your markdown in the left editor panel
5. **Preview**: See the rendered output in the right preview panel
6. **Embed Mermaid Diagrams**: Use fenced code blocks with the `mermaid` language:

   ~~~markdown
   ```mermaid
   graph TD
       A[Start] --> B[Process]
       B --> C[End]
   ```
   ~~~

   **Azure DevOps Syntax**: You can also use the `:::mermaid` syntax (common in Azure DevOps and other platforms):

   ~~~markdown
   :::mermaid
   graph TD
       A[Start] --> B[Process]
       B --> C[End]
   :::
   ~~~

   Both syntaxes are fully supported and can be mixed in the same document.

7. **Export**: Click the Export button to save as Markdown, HTML, or PDF
8. **Toggle Theme**: Click the sun/moon icon to switch between light and dark modes
9. **MCP Server**: Click the **MCP** button in the header to start the agent integration server (see [MCP Server](#mcp-server) below)

## MCP Server

MarkdownUI includes an embedded [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI agents read and write your collections and documents directly. No external process or Node.js runtime required — the server runs inside the app.

### Starting the Server

Click the **MCP** button in the top-right header:

| Indicator | Meaning |
|-----------|---------|
| ⚫ Grey dot | Server stopped |
| 🟢 Green dot | Server running on `http://localhost:3333/mcp` |
| 🟡 Yellow pulse | Starting / stopping |

### Available Tools

Once running, agents have access to 11 tools:

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections |
| `get_collection` | Get a collection by ID |
| `create_collection` | Create a new collection |
| `update_collection` | Rename / update a collection |
| `delete_collection` | Delete a collection and all its documents |
| `list_documents` | List documents in a collection (metadata only) |
| `get_document` | Get a document with full markdown content |
| `create_document` | Create a new document in a collection |
| `update_document` | Update a document's name and/or content |
| `delete_document` | Delete a document |
| `search_documents` | Search documents by name or content across all collections |

### Agent Configuration

#### Hermes Agent

Add to `~/.hermes/config.yaml` and restart Hermes:

```yaml
mcp_servers:
  markdownui:
    url: "http://localhost:3333/mcp"
    transport: "http"
```

#### VS Code (Copilot / Continue / etc.)

`.vscode/mcp.json` is already included in the repo. Add an entry:

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

> **Note:** The `mcp-server/` directory contains a Node.js stdio implementation for clients that don't support HTTP transport. Run `npm install` inside `mcp-server/` before using it.

#### Claude Desktop

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

## Development

Instructions for building the application from source.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://rustup.rs/) (latest stable)
- Chrome, Chromium, or Edge (for PDF export)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Building for Production

```bash
npm run tauri build
```

### Releases

Releases are fully automated via [semantic-release](https://semantic-release.gitbook.io/). Every push to `main` triggers versioning, changelog generation, and a GitHub Release.

#### How It Works

```
PR merged to main
       │
       ▼
  semantic-release
       │
       ├─ Reads commits since last tag
       ├─ Determines bump from commit types (see below)
       ├─ Generates CHANGELOG.md
       ├─ Bumps version in package.json, Cargo.toml, tauri.conf.json
       ├─ Creates git tag (vX.Y.Z)
       └─ Creates GitHub Release with changelog
                │
                ▼
       GitHub Actions (on v* tag)
                │
                └─ Builds macOS / Windows / Linux binaries
```

#### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/). The commit type determines the version bump:

| Prefix | Bump | Example |
|--------|------|---------|
| `feat:` | minor | `feat: add FTS5 full-text search` |
| `fix:` | patch | `fix: sidebar collapse animation` |
| `docs:` | patch | `docs: update MCP config section` |
| `refactor:` | patch | `refactor: extract search logic` |
| `perf:` | patch | `perf: optimize document list query` |
| `chore:` | — *(no release)* | `chore: update dependencies` |

Breaking changes use `feat!:` or `fix!:` and trigger a major bump. A `BREAKING CHANGE:` footer in the commit body also works.

You no longer need to run `npm run release:*` or manually bump versions — semantic-release handles the entire pipeline.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Editor**: Monaco Editor (with custom theme)
- **Markdown**: react-markdown, remark-gfm, rehype-raw
- **Syntax Highlighting**: react-syntax-highlighter (Prism)
- **Diagrams**: Mermaid.js
- **Backend**: Tauri 1.5, Rust
- **Database**: SQLite (rusqlite)
- **MCP Server**: axum 0.7, tower-http 0.5 (HTTP transport, JSON-RPC 2.0)
- **PDF Export**: chromiumoxide (headless Chrome)

## Architecture

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Project Structure

```txt
MarkdownUI/
├── src/                    # Frontend (React/TypeScript)
│   ├── App.tsx             # Main application component
│   ├── api.ts              # Tauri IPC API layer
│   └── components/         # React components
├── src-tauri/              # Backend (Rust/Tauri)
│   └── src/
│       ├── main.rs         # Tauri commands and app setup
│       ├── database.rs     # SQLite operations
│       ├── converter.rs    # Export conversion
│       └── mcp_server.rs   # Embedded axum MCP HTTP server
├── mcp-server/             # Node.js stdio MCP server (alternative transport)
│   ├── server.js           # MCP server implementation
│   └── README.md           # Setup instructions
└── docs/                   # Documentation
    └── ARCHITECTURE.md     # Detailed architecture guide
```

## Future Ideas

- [ ] **Image Support**: Embed and manage images within documents
- [ ] **Tags**: Tag documents for better organization
- [ ] **Synchronized Scrolling**: Sync scroll position between editor and preview
- [ ] **Custom CSS**: User-defined styles for preview
- [ ] **DOCX Export**: Export to Microsoft Word format
- [ ] **MCP: Configurable Port**: Allow the MCP server port to be set in preferences
- [ ] **MCP: Auto-start**: Option to start the MCP server automatically on app launch

## License

MIT
