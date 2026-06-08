# Changelog

All notable changes to MarkdownUI are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — feature/mcp-server

### Added
- **Embedded MCP Server** (`src-tauri/src/mcp_server.rs`): an axum HTTP server running at `http://localhost:3333/mcp` that exposes all collections and documents to any MCP-capable AI agent (Hermes, Claude Desktop, VS Code Copilot, Cursor, etc.)
  - JSON-RPC 2.0 over HTTP (MCP Streamable HTTP transport, protocol version `2024-11-05`)
  - 11 tools: `list_collections`, `get_collection`, `create_collection`, `update_collection`, `delete_collection`, `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `search_documents`
  - CORS open to any origin
  - Shares the existing `Arc<Mutex<Database>>` — no second DB connection
- **MCP toggle button** in the app header: grey dot (stopped) → green dot (running on `:3333`) → yellow pulse (transitioning)
- MCP server status checked on app mount to restore button state
- Three new Tauri commands: `start_mcp_server`, `stop_mcp_server`, `get_mcp_server_status`
- **Node.js stdio MCP server** (`mcp-server/server.js`): alternative implementation for agents that require stdio transport (VS Code, Claude Desktop). Includes its own `README.md` with setup instructions.
- `axum 0.7` and `tower-http 0.5` added to `Cargo.toml`

### Changed
- `DbState` refactored from `Mutex<Database>` to `Arc<Mutex<Database>>` (`DbArc`) to allow the MCP server to share the database handle across threads without a second connection
- README updated with MCP server section, updated tech stack, and updated project structure tree

---

## [1.0.12] — 2026-05-12

### Added
- Left navigation improvements (collapsible sidebar with snap-to-collapse at 240px)
- Icons for collection and document actions

### Fixed
- Various sidebar and navigation bug fixes

---

## [1.0.11] — 2026-05-01

### Changed
- Left nav refinements and UX polish

---

## [1.0.10] — 2026-04-15

### Changed
- Minor UI adjustments

---

## [1.0.9] — 2026-03-20

### Changed
- Internal refactoring and stability improvements

---

## [1.0.8] — 2026-02-10

### Added
- **Go to Heading**: Click the icon next to any heading in the preview panel to jump to that line in the Monaco editor
- Context menu improvements: "Copy" and "Copy as Markdown" options

---

## [1.0.7] — 2026-01-28

### Added
- Enhanced text selection behaviour

### Fixed
- List styling corrections in the preview pane

---

## [1.0.6] — 2026-01-15

### Added
- Increased scrollbar size in the preview pane for better usability
- UI polish pass across light and dark themes

---

## [1.0.5 and earlier]

Initial development releases establishing the core Tauri + React architecture, Monaco editor integration, SQLite-backed collections/documents, Mermaid diagram support, and PDF export via chromiumoxide.

---

[Unreleased]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.12...HEAD
[1.0.12]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/buchenberg/MarkdownUI/releases/tag/v1.0.6
