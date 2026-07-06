# MarkdownUI

A Markdown document viewer and editor with embedded Mermaid diagram support, built with Tauri + React.

![MarkdownUI Screenshot](./docs/MarkdownUI_Windows_Screenshot.png)

## Features

- **Markdown Editor**: Full-featured Monaco editor with custom dark blue theme
- **Live Preview**: Real-time markdown rendering with support for:
  - GitHub Flavored Markdown (tables, task lists, strikethrough)
  - Embedded Mermaid diagrams with theme support (both ` ```mermaid ` and `:::mermaid` syntax)
  - Code blocks with syntax highlighting (Prism)
- **Filesystem-Backed**: Browse, edit, and organize real `.md` files and folders on disk
  - Add/remove root folders in Settings
  - Create, rename (double-click), delete, and drag-to-move files and folders
  - Per-document expandable table of contents
- **Auto-save**: Optional automatic saving of document content
- **Export Options**:
  - Markdown (.md) - Raw markdown file
  - HTML - Styled document with embedded diagrams
  - PDF - Print-ready document (requires Chrome/Chromium)
- **MCP Server**: Embedded [Model Context Protocol](https://modelcontextprotocol.io/) server — expose your files and folders to any AI agent over HTTP
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
2. **Add a Root Folder**: Open Settings → Storage and click "+ Add Root Folder" to browse a directory
3. **Create a Document/Folder**: Hover a folder row and click the New Document / New Folder action; type the name and press Enter
4. **Rename**: Double-click any file or folder row, edit the name, then press Enter (Esc to cancel)
5. **Move**: Drag a file or folder onto another folder to move it
6. **Edit Markdown**: Write your markdown in the left editor panel
7. **Preview**: See the rendered output in the right preview panel
8. **Embed Mermaid Diagrams**: Use fenced code blocks with the `mermaid` language:

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

9. **Export**: Click the Export button to save as Markdown, HTML, or PDF
10. **Toggle Theme**: Click the sun/moon icon to switch between light and dark modes
11. **MCP Server**: Click the **MCP** button in the header to start the agent integration server (see [MCP Server](#mcp-server) below)

## MCP Server

MarkdownUI includes an embedded [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI agents read and write the files and folders you have added as workspace roots directly. No external process or Node.js runtime required — the server runs inside the app.

### Starting the Server

Click the **MCP** button in the top-right header:

| Indicator | Meaning |
|-----------|---------|
| ⚫ Grey dot | Server stopped |
| 🟢 Green dot | Server running on `http://localhost:3333/mcp` |
| 🟡 Yellow pulse | Starting / stopping |

### Available Tools

Once running, agents have access to 11 path/file-centric tools:

| Tool | Description |
|------|-------------|
| `list_roots` | List all registered root folders |
| `list_directory` | List the children (folders and `.md` documents) of a directory |
| `get_entry` | Get a file (with content) or folder metadata by absolute path |
| `read_file` | Read the markdown content of a `.md` file |
| `create_file` | Create a new `.md` document (extension appended automatically) |
| `update_file` | Update a document's content (and rename it if `name` changed) |
| `create_directory` | Create a new subdirectory inside a parent directory |
| `rename_entry` | Rename a file or folder (kept in place) |
| `delete_entry` | Delete a file or folder (recursive for folders) |
| `move_entry` | Move a file or folder into a new parent directory (same volume only) |
| `search` | Search documents by filename or content across all root folders |

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

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "markdownui": {
      "url": "http://localhost:3333/mcp",
      "type": "http"
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "markdownui": {
      "url": "http://localhost:3333/mcp",
      "type": "http"
    }
  }
}
```

Config file locations:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

#### Cline

Add to Cline's MCP settings (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "markdownui": {
      "url": "http://localhost:3333/mcp",
      "type": "streamableHttp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Config file locations:
- **Windows**: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Linux**: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

Or via CLI (Windows PowerShell):

```powershell
$configPath = "$env:APPDATA\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json"
$config = Get-Content $configPath | ConvertFrom-Json
$config.mcpServers | Add-Member -Name "markdownui" -Value @{ url = "http://localhost:3333/mcp"; type = "http" } -MemberType NoteProperty
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath
```

#### Roo Code (Roo)

Add to Roo's MCP settings:

```json
{
  "mcpServers": {
    "markdownui": {
      "url": "http://localhost:3333/mcp",
      "type": "http"
    }
  }
}
```

Config file locations:
- **Windows**: `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
- **Linux**: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`

Or via CLI (Windows PowerShell):

```powershell
$configPath = "$env:APPDATA\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\mcp_settings.json"
$config = Get-Content $configPath | ConvertFrom-Json
$config.mcpServers | Add-Member -Name "markdownui" -Value @{ url = "http://localhost:3333/mcp"; type = "http" } -MemberType NoteProperty
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath
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
- **Storage**: Filesystem (real `.md` files on disk)
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
│       ├── converter.rs    # Export conversion
│       ├── filesystem.rs   # Filesystem-backed storage
│       ├── storage.rs      # Shared TreeNode types
│       └── mcp_server.rs   # Embedded axum MCP HTTP server
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
