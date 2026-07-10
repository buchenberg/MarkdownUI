# AGENTS.md — MarkdownUI

## Project Overview

MarkdownUI is a desktop Markdown document viewer and editor with embedded Mermaid diagram support. Built with Tauri (Rust backend) and React (TypeScript frontend). Features include filesystem-backed storage, an embedded MCP server for AI agent integration, PDF/HTML export, live preview, and dark mode.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Editor | Monaco Editor (custom dark blue theme) |
| Markdown | react-markdown, remark-gfm, rehype-raw, rehype-sanitize |
| Diagrams | Mermaid.js |
| Backend | Tauri 1.5, Rust (edition 2021) |
| MCP Server | axum 0.7, tower-http 0.5 (HTTP, JSON-RPC 2.0) |
| PDF Export | chromiumoxide (headless Chrome) |
| CI/CD | GitHub Actions, semantic-release |

## Project Structure

```
MarkdownUI/
├── src/                          # Frontend (React/TypeScript)
│   ├── App.tsx                   # Root component, orchestrates all state
│   ├── api.ts                    # Tauri IPC bridge — all invoke() calls live here
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # Global styles + Tailwind directives
│   ├── ThemeContext.tsx           # Dark/light theme provider
│   ├── components/               # UI components
│   │   ├── Header.tsx            # Top bar: sidebar toggle, name, save, export, MCP, zoom
│   │   ├── FilesystemBrowser.tsx # Sidebar file tree with drag-drop, rename, TOC
│   │   ├── DocumentEditor.tsx    # Monaco editor + live preview split view
│   │   ├── DocumentPreview.tsx   # Markdown renderer (react-markdown + Mermaid)
│   │   ├── SettingsModal.tsx     # Settings dialog (roots, theme, MCP)
│   │   ├── ResizableSplit.tsx    # Draggable split pane
│   │   ├── ConfirmModal.tsx      # Reusable confirmation dialog
│   │   ├── InlineRename.tsx      # Double-click inline rename
│   │   ├── IconAction.tsx        # Icon button with tooltip
│   │   ├── SegmentedToggle.tsx   # Tab-style toggle control
│   │   ├── SettingsRow.tsx       # Label + value row for settings
│   │   ├── ThemeToggle.tsx       # Sun/moon icon toggle
│   │   └── ZoomControls.tsx      # Zoom in/out/reset
│   ├── contexts/
│   │   ├── SettingsContext.tsx    # Settings modal open/close state
│   │   └── ToastContext.tsx       # Toast notification provider
│   ├── hooks/
│   │   ├── useMcpEvents.ts       # SSE listener for MCP live updates
│   │   ├── useSidebarResize.ts   # Sidebar drag-to-resize logic
│   │   └── useFocusTrap.ts       # Focus trap for modals
│   └── utils/
│       ├── headings.ts           # Extract headings from markdown
│       ├── paths.ts              # Path utility functions
│       └── slugify.ts            # Generate heading ID slugs
├── src-tauri/                    # Backend (Rust/Tauri)
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri config (allowlist, window, bundle)
│   └── src/
│       ├── main.rs               # Tauri commands, app setup, state management
│       ├── filesystem.rs         # FilesystemStorage — all file I/O operations
│       ├── storage.rs            # TreeNode, SearchResult types
│       ├── converter.rs          # Markdown → HTML/PDF export
│       ├── mcp_server.rs         # Embedded MCP HTTP server (axum)
│       └── config.rs             # StorageConfig (workspace roots persistence)
├── scripts/
│   ├── release.cjs               # Local release helper
│   └── sync-version.cjs          # Syncs version across package.json, Cargo.toml, tauri.conf.json
├── docs/                         # Documentation
└── .github/workflows/
    ├── release.yml               # Build binaries on v* tag
    └── semantic-release.yml      # Version + changelog on push to main
```

## Development Commands

```bash
# Install dependencies
npm install

# Run in dev mode (starts Vite + Tauri)
npm run tauri dev

# Frontend only (Vite dev server on :5173)
npm run dev:frontend

# Build frontend only
npm run build:frontend

# Full production build (frontend + Tauri bundle)
npm run build

# Run Tauri CLI directly
npm run tauri

# Release (semantic-release handles versioning)
npm run release:patch
npm run release:minor
npm run release:major
```

## Coding Conventions

### TypeScript / React

- **Components**: Functional components only, PascalCase filenames (e.g., `Header.tsx`, `ResizableSplit.tsx`)
- **Props**: Define an interface above the component (e.g., `interface HeaderProps {}`), destructure in function signature
- **State**: `useState` for local state; React Context for shared state (`SettingsContext`, `ToastContext`, `ThemeContext`)
- **Hooks**: Custom hooks in `src/hooks/`, named `use<Thing>.ts`
- **IPC**: All Tauri `invoke()` calls go through `src/api.ts`. Components never call `invoke()` directly
- **Styling**: TailwindCSS utility classes. Dark mode via `dark:` prefix (class-based). No CSS modules
- **Imports**: Absolute imports from `src/` root (e.g., `import * as api from "./api"`)
- **TypeScript**: Strict mode enabled. `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` all enforced
- **File naming**: PascalCase for components, contexts, and hooks/utils files (e.g., `SettingsContext.tsx`, `useFocusTrap.ts`)

### Rust

- **Modules**: One concern per file — `filesystem.rs` for I/O, `storage.rs` for types, `converter.rs` for export, `mcp_server.rs` for HTTP
- **Commands**: Tauri commands are `#[tauri::command]` functions in `main.rs`. Naming convention: `storage_<action>` (e.g., `storage_list_roots`, `storage_create_document`)
- **Error handling**: Return `Result<T, String>` from commands. Use `.map_err(|e| e.to_string())` for IO errors
- **State**: Managed via `tauri::State`. `FilesystemStorage` is wrapped in `Arc<>` for shared access
- **Dependencies**: See `src-tauri/Cargo.toml` — tauri 1.5, axum 0.7, tokio, serde, chromiumoxide

## Key Patterns

### IPC Bridge (`src/api.ts`)

Every frontend-to-backend call goes through typed functions in `api.ts`:

```typescript
export async function listRoots(): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("storage_list_roots");
}
```

The Tauri command names in Rust match the strings passed to `invoke()`. When adding a new command:
1. Add the `#[tauri::command]` function in `src-tauri/src/main.rs`
2. Register it in `tauri::generate_handler![]`
3. Add the TypeScript wrapper in `src/api.ts`

### MCP Server

The embedded MCP server runs on `localhost:3333/mcp` using axum. It exposes 11 tools for file CRUD and search. Server lifecycle is managed via `start_mcp_server` / `stop_mcp_server` / `get_mcp_server_status` commands. Frontend receives live update events via SSE (handled by `useMcpEvents` hook).

### Filesystem Storage

All document data lives on disk as real `.md` files. `FilesystemStorage` (`src-tauri/src/filesystem.rs`) manages:
- Workspace roots (persisted in `StorageConfig`)
- File/folder CRUD operations
- Search across all root folders (case-insensitive, max 50 results)

`TreeNode` is the universal type for both files and folders. The `id` field is the absolute file path.

### Theme System

Dark/light mode uses TailwindCSS class-based dark mode (`darkMode: 'class'`). Theme state is managed in `ThemeContext.tsx` and toggled via `ThemeToggle` component. All components use `dark:` variants.

## Build and Release

- **Branch**: `main` only
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `chore:`
- **Versioning**: Automated via semantic-release. `feat:` → minor, `fix:`/`docs:`/`refactor:` → patch, `feat!:` or `BREAKING CHANGE:` → major
- **Version sync**: `scripts/sync-version.cjs` updates `package.json`, `Cargo.toml`, and `tauri.conf.json` atomically
- **Binaries**: GitHub Actions builds Windows (.msi), macOS (.dmg), Linux (.deb, AppImage) on `v*` tags

## Adding New Features

1. **New Tauri command**: Add function in `main.rs`, register in `generate_handler![]`, add TypeScript wrapper in `api.ts`
2. **New React component**: Create in `src/components/`, PascalCase, export default, import where needed
3. **New hook**: Create in `src/hooks/`, prefix with `use`
4. **New context**: Create in `src/contexts/`, provide via wrapper component in `App.tsx`
5. **New Rust module**: Create file in `src-tauri/src/`, add `mod <name>;` in `main.rs`

## Testing

No formal test suite is currently configured. The project relies on manual testing via `npm run tauri dev` and the automated CI build pipeline.

## Important Notes

- Tauri allowlist is restrictive — only specific filesystem and dialog APIs are enabled. Check `tauri.conf.json` before adding new Tauri API calls
- The `.md` extension is automatically appended to document names in `filesystem.rs` (`ensure_md_extension`). Display names strip the suffix (`strip_md_suffix`)
- Hidden files (starting with `.`) are excluded from file listings and search
- PDF export requires Chrome/Chromium installed on the system
- MCP server binds to `127.0.0.1:3333` — hardcoded in `main.rs`. If port 3333 is unavailable, the MCP server will fail silently. Port configuration is not currently supported; do not attempt to make it configurable without updating both `main.rs` and the frontend MCP endpoint references.
