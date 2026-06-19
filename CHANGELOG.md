# Changelog

All notable changes to MarkdownUI are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.3](https://github.com/buchenberg/MarkdownUI/compare/v1.4.2...v1.4.3) (2026-06-19)

### Bug Fixes

* set persist-credentials false so PAT remote URL is used for tag push ([a3f7ecb](https://github.com/buchenberg/MarkdownUI/commit/a3f7ecb31719f2f578c5c1f91138cd0f375a0d5b))

## [1.4.2](https://github.com/buchenberg/MarkdownUI/compare/v1.4.1...v1.4.2) (2026-06-19)

### Bug Fixes

* configure git remote with PAT for tag push triggering ([dc9a54d](https://github.com/buchenberg/MarkdownUI/commit/dc9a54dede1be3b69b80e9cb56f7c9a8d4a132de))

## [1.4.1](https://github.com/buchenberg/MarkdownUI/compare/v1.4.0...v1.4.1) (2026-06-19)

### Bug Fixes

* use PAT for semantic-release tag push to trigger release workflow ([3784d3e](https://github.com/buchenberg/MarkdownUI/commit/3784d3e4ab2bcb7fc67d3d1f769e3e0e2e1bc213))

## [1.4.0](https://github.com/buchenberg/MarkdownUI/compare/v1.3.0...v1.4.0) (2026-06-09)

### Features

* nested folders in collections ([#9](https://github.com/buchenberg/MarkdownUI/issues/9)) ([95fbaf3](https://github.com/buchenberg/MarkdownUI/commit/95fbaf30ff5917a1706ed5dcfdaafc5bd401c7bc))

## [1.3.0](https://github.com/buchenberg/MarkdownUI/compare/v1.2.2...v1.3.0) (2026-06-09)

### Features

* MCP live update animations — shimmer & pulse on agent writes ([#8](https://github.com/buchenberg/MarkdownUI/issues/8)) ([c9884c4](https://github.com/buchenberg/MarkdownUI/commit/c9884c463d2a8f7499eb5b877cea940507b1d3cb))

## [1.2.2](https://github.com/buchenberg/MarkdownUI/compare/v1.2.1...v1.2.2) (2026-06-09)

### Bug Fixes

* update release workflow to ubuntu-latest with webkit2gtk 4.1 ([cc36609](https://github.com/buchenberg/MarkdownUI/commit/cc366095978a540c883a45fb75eed978767ebb3b))

## [1.2.1](https://github.com/buchenberg/MarkdownUI/compare/v1.2.0...v1.2.1) (2026-06-09)

### Bug Fixes

* switch release workflow to ubuntu-latest, update webkit2gtk to 4.1 ([7aa32a4](https://github.com/buchenberg/MarkdownUI/commit/7aa32a4293010e42edc73e500087766e8488da42))

## [1.2.0](https://github.com/buchenberg/MarkdownUI/compare/v1.1.0...v1.2.0) (2026-06-09)

### Features

* add semantic-release for automated versioning, changelogs, and releases ([a18721e](https://github.com/buchenberg/MarkdownUI/commit/a18721e50dc0aa17540361ad8902a7cda4c1245a))

### Bug Fixes

* parse nextRelease JSON in semantic-release exec plugin ([42160ea](https://github.com/buchenberg/MarkdownUI/commit/42160ea85f11b2fe3fdb571a2845198abbf977fb))
* pass nextRelease.version as CLI arg instead of env var ([1d8a0e9](https://github.com/buchenberg/MarkdownUI/commit/1d8a0e9a592b93288057e44b4659583102a8e805))
* rename sync-version to .cjs (package.json has type:module) ([be5c970](https://github.com/buchenberg/MarkdownUI/commit/be5c9702691501473fd056ed29a2d485ef55e0d7))
* use script file instead of inline node -e for version sync ([6ea7c4f](https://github.com/buchenberg/MarkdownUI/commit/6ea7c4f1865eef7b7d43c2a1c06a985664317497))

### Documentation

* add automated release process to README ([#7](https://github.com/buchenberg/MarkdownUI/issues/7)) ([f5c1939](https://github.com/buchenberg/MarkdownUI/commit/f5c19396b7dabc79f7e2952d06a10d1b3ed7fae2))

---

## [1.1.0] — 2026-06-09

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
- **FTS5 full-text search** on documents (`src-tauri/src/database.rs`): SQLite FTS5 virtual table with auto-sync triggers on INSERT/UPDATE/DELETE. Replaces linear `.contains()` scan in `search_documents` with indexed `MATCH` queries — O(log n) regardless of dataset size.
- **WAL journal mode**: `PRAGMA journal_mode = WAL` enabled at init to allow concurrent reads from the MCP server while Tauri commands write.

### Changed
- `DbState` refactored from `Mutex<Database>` to `Arc<Mutex<Database>>` (`DbArc`) to allow the MCP server to share the database handle across threads without a second connection
- README updated with MCP server section, updated tech stack, and updated project structure tree
- `search_documents` MCP tool now uses indexed FTS5 lookup instead of linear scan

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

[Unreleased]: https://github.com/buchenberg/MarkdownUI/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.12...v1.1.0
[1.0.12]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.11...v1.0.12
[1.0.11]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.10...v1.0.11
[1.0.10]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/buchenberg/MarkdownUI/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/buchenberg/MarkdownUI/releases/tag/v1.0.6
