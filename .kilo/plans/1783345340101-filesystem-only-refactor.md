# Refactor: Filesystem-Only Storage (Remove SQLite & Collections)

> **Supersedes** `docs/PLAN-filesystem-storage.md` (which kept SQLite as an option).
> **Intended home:** `docs/` (could not be written there due to current edit permissions; saved here instead — move as desired).
> **Status:** Implementation-ready.
> **Decisions locked with user:** (1) No data migration — SQLite data is abandoned, clean start.
> (2) Move = drag-and-drop in the tree.

## Goal

Strip out SQLite and the collections concept entirely. MarkdownUI becomes a single
filesystem-backed markdown editor where:

- The left nav is a real, live file tree (roots = real directories on disk).
- Root folders are added/removed in **Settings → Storage**.
- The tree supports **create, rename, delete, and drag-to-move** for files and folders.
- The embedded MCP server is rewritten **path/file-centric** (no collections).

No storage-type selector, no SQLite, no `collection_id`, no numeric IDs.

---

## Resolved Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Existing SQLite data | **No migration** — delete `database.rs` and ignore `.db` | User confirmed data not needed; clean break. |
| Move interaction | **Drag-and-drop** in tree | User request; natural file-explorer behavior. |
| Workspace root IDs | **Absolute path** (not `fs:<index>`) | Survives removal/reorder; consistent with all other entries. |
| `StorageBackend` trait | **Drop it** | Exactly one backend; less indirection. Keep `TreeNode` types. |
| `storage_type` config | **Remove** | Always filesystem; kills the toggle + restart-to-switch flow. |
| Rename UX | Double-click → inline edit (Enter=save, Esc=cancel) | Standard file-explorer behavior. |
| Delete UX | Trash hover action → `ConfirmModal` | Reuse existing component; warn on recursive folder delete. |
| MCP tools | **Clean break** to path-centric | Breaking change for current MCP clients; README must update. |

---

## Data Model (single, final)

| Concept | Representation |
|---------|----------------|
| Root folder | A real directory registered in `storage_config.json`; `TreeNode.id` = absolute path |
| Folder | Real subdirectory; `TreeNode.id` = absolute path |
| Document | Real `.md` file; `TreeNode.id` = absolute path; `.md` suffix stripped from `name` for display |
| Content | File contents, lazy-loaded via `get_entry`/`list_children` (no content in listings) |
| Timestamps | File `created`/`modified` metadata as ISO 8601-ish strings |

`TreeNode` (string `id`, string `parent_id`, `name`, `kind: folder|document`, optional `content`, timestamps) stays in `storage.rs`.

**Note on path IDs:** renaming or moving an entry changes its `id`, and moving/renaming a folder changes its descendants' IDs. After any rename/move the frontend **re-fetches** the affected parent(s); the currently open document's path is re-resolved (or cleared if it no longer exists).

---

## Backend Changes (Rust)

### Delete
- **`src-tauri/src/database.rs`** (entire file, ~1095 lines).
- **`rusqlite`** dependency in `src-tauri/Cargo.toml`.
- In `main.rs`: all legacy commands — `get_collections`, `get_collection`, `create_collection`, `update_collection`, `delete_collection`, `get_documents_by_collection`, `get_document`, `create_document`, `update_document`, `delete_document`, `create_folder`, `get_folders_by_collection`, `update_folder`, `delete_folder`, `get_documents_by_folder`, `move_document`, `get_folder`, `move_folder`, `list_folder_contents`, legacy `export_document`.
- `DbArc` type alias + the second `Database::new(...)` init in `setup()`.
- `get_storage_type` / `set_storage_type` commands (config has no type anymore).

### `config.rs` — simplify
- Remove `storage_type` field and `default_storage_type()`.
- `StorageConfig` becomes just `workspaces: Vec<WorkspaceEntry>`.
- Keep `load`/`save` (file still `storage_config.json`). Remove `set_storage_type`.
- Add `remove_workspace_by_path(&mut self, path: &Path) -> bool` so roots can be removed by path id.

### `filesystem.rs` — path-based roots + hardening
- **Root IDs = absolute path.** Remove the `fs:<index>` scheme entirely:
  - `list_roots` returns `TreeNode { id: <abs path>, parent_id: None, kind: Folder, name: <dir basename> }`.
  - `remove_root(id)` resolves `id` as a path and calls `remove_workspace_by_path`.
  - `resolve_path(id)` becomes trivial: `PathBuf::from(id)` (no prefix parsing). All entries, roots included, are paths.
  - `get_entry` for a root path returns the root node (no special `fs:` branch).
- Keep existing create/update/rename/delete/move/list_children/search logic (it already operates on paths for non-roots — generalize the root cases).
- **Move hardening:** `move_entry` already uses `fs::rename`. On error, return the OS message; the frontend surfaces it. Document the cross-volume limitation.
- `search` already walks roots — update to use path-based root IDs.

### `storage.rs` — drop trait, keep types
- Delete the `StorageBackend` trait.
- Keep `TreeNode` + `TreeNodeKind` (used by both Rust and frontend via serde).
- (Optional: rename to `types.rs`. Low value; leave as `storage.rs`.)

### `main.rs` — slim dispatch
- `mod database;` removed; `mod storage;` and `mod filesystem;` remain.
- Setup builds a single `Arc<FilesystemStorage>` from config and manages it.
- Keep these commands (rename prefix optional): `storage_list_roots`, `storage_add_root`, `storage_remove_root`, `storage_get_entry`, `storage_list_children`, `storage_create_folder`, `storage_create_document`, `storage_update_document`, `storage_rename_entry`, `storage_delete_entry`, `storage_move_entry`, `storage_search`, `storage_export_document`.
- **Remove** `storage_export_root` (no-op on filesystem).
- `start_mcp_server(app_handle, mcp_state, fs: State<Arc<FilesystemStorage>>)` — pass the filesystem backend to `build_router` instead of `DbArc`.

### `mcp_server.rs` — full rewrite (file-centric)
- State holds `Arc<FilesystemStorage>` + `AppHandle`.
- New tool set (all string/path params):
  - `list_roots` — list registered root folders.
  - `list_directory { path }` — children of a directory.
  - `get_entry { path }` — file (with content) or folder metadata.
  - `read_file { path }` — return a `.md` file's content.
  - `create_file { parent_path, name, content }` — create `.md` (auto-append extension).
  - `update_file { path, name, content }` — write content; rename if `name` changed.
  - `create_directory { parent_path, name }`.
  - `rename_entry { path, new_name }`.
  - `delete_entry { path }` — file or recursive folder delete.
  - `move_entry { path, new_parent_path }`.
  - `search { query }` — across all roots (filename + content).
- Keep JSON-RPC 2.0 framing, `initialize`, `tools/list`, `tools/call`, CORS, `:3333` bind.
- **Event payload changes:** `McpEvent { operation: String, id: String (path), name: String }` — **drop** `collection_id`. After each write, emit `mcp-operation` so the UI refreshes.

---

## Frontend Changes (React/TypeScript)

### Delete
- `src/components/CollectionsBrowser.tsx`
- `src/components/FolderNode.tsx`
- `src/components/DocumentRow.tsx`

### `api.ts` — trim to one model
- Delete `Collection`, `Folder`, `Document` interfaces and **all** numeric-ID functions (`getCollections`, `getCollection`, `createCollection`, `updateCollection`, `deleteCollection`, `getDocumentsByCollection`, `getDocument`, `createDocument`, `updateDocument`, `deleteDocument`, `createFolder`, `getFoldersByCollection`, `updateFolder`, `deleteFolder`, `getDocumentsByFolder`, `moveDocument`, `getFolder`, `moveFolder`, `listFolderContents`, legacy `exportDocument`, `getStorageType`, `setStorageType`, `exportRootToFilesystem`).
- Keep `TreeNode` type and the `storage_*` wrappers (`listRoots`, `addRoot`, `removeRoot`, `getEntry`, `listChildren`, `createFolderEntry`, `createDocEntry`, `updateDoc`, `renameEntry`, `deleteEntry`, `moveEntry`, `searchEntries`, `exportDocToFile`, `exportMarkdown`, MCP fns, `pickDirectory`, `checkPdfAvailable`).
- `Document`/`Collection` re-exports removed from `App.tsx`.

### `App.tsx` — collapse parallel state
- Remove `selectedDocument`, `collections`, `storageType`, `storagePending`, and all `handleDocument*`/`handleCollection*`/`handleFolder*` SQLite handlers, `fetchCollections`, `handleStorageTypeChange`, the browser switch.
- Keep a single document model: `selectedFsDoc: TreeNode | null`. Save path → `api.updateDoc(id, name, content)`.
- Always render `FilesystemBrowser`. Always `fetchWorkspaceRoots()` on mount.
- MCP live-update effect keyed on **path id** (string).
- Export handlers use `exportDocToFile(selectedFsDoc.id, ...)`.

### `FilesystemBrowser.tsx` — the single sidebar (expand this file)
Become the full-featured file explorer. Add:

- **Root row actions (hover):** New Document, New Folder, Remove Root (calls `onRemoveWorkspaceRoot`). Roots themselves are not renameable/deletable via tree (managed in Settings) — but New Doc/Folder here is convenient.
- **Folder row actions (hover):** New Document, New Folder, Rename (double-click), Delete (confirm). Recursive-delete warning.
- **Document row actions (hover):** Rename (double-click), Delete (confirm).
- **Create flow:** new doc/folder created with a placeholder name, then the row **auto-enters inline rename** so the user types the real name immediately.
- **Inline rename:** shared `InlineRename` subcomponent — input replaces the label; Enter commits (`api.renameEntry`), Esc cancels; refocus/autoselect.
- **Delete:** reuse `ConfirmModal` (or the existing inline confirm pattern). Re-fetch parent after.
- **Heading TOC:** keep the existing per-document expandable TOC; consolidate to the **deduplicating** `parseHeadings` (from the deleted `DocumentRow.tsx`) so duplicate heading text gets `-1`, `-2` suffixes. Also reuse `src/utils/slugify.ts`.
- **Drag-and-drop move:**
  - Rows are draggable; valid drop targets = folders + roots only (directories).
  - Block: dropping an item onto itself; dropping a folder onto any of its descendants (walk `parent_id` chain client-side from the cached tree).
  - Visual feedback: highlight valid target on `dragover`; show no-drop cursor otherwise.
  - On `drop`: `api.moveEntry(srcId, destId)`; on success re-fetch source parent + dest parent; surface errors via alert/toast.
  - Cross-root allowed (same backend `move_entry`); surface OS error if cross-volume rename fails.
- After **any** mutation, re-fetch the affected parent directory (`api.listChildren`). Keep a per-parent `children` cache keyed by path; invalidate on change. On rename/move of the open document, re-resolve via `api.getEntry(newId)` or clear selection.

### `useMcpEvents.ts` — string IDs
- `McpEventPayload.id: string` (path); remove `collection_id`.
- `McpEventDetail.id: string`; drop `collectionId`.
- `animatingIds: Set<string>`; `timersRef` keyed by string.
- Animation handler matches path ids shown in the tree.

### `SettingsModal.tsx` — Storage section simplified
- Remove the SQLite/Filesystem `SegmentedToggle` and the restart prompt.
- Storage section becomes **Root Folders** management only: list of roots (path shown) with remove buttons, and **+ Add Root Folder** (opens folder picker, calls `onAddWorkspaceRoot`).
- Remove `storageType` / `storagePending` / `onStorageTypeChange` props.

### `contexts/SettingsContext.tsx`
- Unchanged (still provides open/close). Drop nothing required.

---

## File Inventory

### Delete
| File | Reason |
|------|--------|
| `src-tauri/src/database.rs` | SQLite removed |
| `src/components/CollectionsBrowser.tsx` | SQLite/collections UI |
| `src/components/FolderNode.tsx` | SQLite UI |
| `src/components/DocumentRow.tsx` | SQLite UI |

### Modify
| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Remove `rusqlite` |
| `src-tauri/src/main.rs` | Remove legacy cmds, DbArc, storage-type cmds; single FilesystemStorage backend; pass to MCP |
| `src-tauri/src/mcp_server.rs` | Full rewrite → file-centric tools, path events |
| `src-tauri/src/filesystem.rs` | Path-based root IDs; drop `fs:` scheme; harden move |
| `src-tauri/src/storage.rs` | Drop `StorageBackend` trait; keep `TreeNode` |
| `src-tauri/src/config.rs` | Drop `storage_type`; add `remove_workspace_by_path` |
| `src/api.ts` | Delete legacy types/fns; keep TreeNode + storage_* wrappers |
| `src/App.tsx` | Remove SQLite state/handlers/browser switch; single FS model |
| `src/components/FilesystemBrowser.tsx` | Add create/rename/delete/drag-move; consolidate TOC |
| `src/components/SettingsModal.tsx` | Storage section = root-folder management only |
| `src/hooks/useMcpEvents.ts` | String path IDs; drop collection_id |
| `README.md` | Update features, MCP tool table (19 → ~11 path-centric), tech stack (drop SQLite) |

### Unchanged
`src-tauri/src/converter.rs`, `src/components/{DocumentEditor,DocumentPreview,ResizableSplit,ZoomControls,ThemeToggle,ConfirmModal,SegmentedToggle,SettingsRow}.tsx`, `src/ThemeContext.tsx`, `src/contexts/SettingsContext.tsx`, `src/utils/slugify.ts`.

---

## Implementation Order

1. **Config + filesystem path-ID fix** (`config.rs`, `filesystem.rs`) — roots as paths; `remove_workspace_by_path`.
2. **Drop trait** (`storage.rs`) — keep `TreeNode` only.
3. **`main.rs` cleanup** — remove `database` mod, legacy cmds, DbArc, storage-type cmds, `storage_export_root`; single backend; thread it into `start_mcp_server`.
4. **MCP rewrite** (`mcp_server.rs`) — file-centric tools + path events.
5. **`Cargo.toml`** — remove `rusqlite`; `cargo check`.
6. **`api.ts` trim** — delete legacy; keep unified wrappers.
7. **`App.tsx` collapse** — single FS model; remove SQLite state/switch.
8. **`useMcpEvents.ts`** — string IDs.
9. **`FilesystemBrowser` build-out** — create/rename/delete + inline rename + consolidated TOC.
10. **Drag-and-drop move** — DnD handlers, invalid-target blocking, refresh.
11. **`SettingsModal` simplify** — roots management only.
12. **Delete dead UI files** (CollectionsBrowser/FolderNode/DocumentRow).
13. **README update** — features, MCP table, tech stack.
14. **Manual validation pass** (below).

---

## Validation / Test Plan

- `cargo check` / `cargo build` after steps 2–5 (no `rusqlite`, no `database` references).
- `npm run build` (tsc) after steps 6–12 — confirms no numeric/legacy type leaks.
- **Functional smoke test (`npm run tauri dev`):**
  - Add 2 root folders in Settings; both appear; remove one.
  - Create folder + nested `.md` in tree; rename via double-click; content edits save.
  - Delete a `.md` (confirm) and a folder (recursive confirm).
  - Drag a `.md` into a subfolder; drag a folder into another folder; drag onto root; attempt invalid drops (self, descendant, onto a document) → blocked.
  - Cross-root drag → works or shows clear error.
  - Rename/move the open document → editor stays in sync or clears.
  - Start MCP; call `list_roots`, `list_directory`, `read_file`, `create_file`, `move_entry` via curl/agent; verify `mcp-operation` events animate the tree.
  - Auto-save + manual save still write to disk (verify file contents on disk).
  - Export to MD/HTML/PDF still works from header.

---

## Risks & Breaking Changes

| Risk | Severity | Mitigation |
|------|----------|------------|
| MCP tool set changes — existing agent calls to `list_collections`, etc. break | **High (breaking)** | Documented; README MCP table rewritten. Connection config (`url`) unchanged. |
| Cross-volume drag-move fails under `fs::rename` | Medium | Surface OS error in UI; note limitation. Future: copy+delete fallback. |
| Rename/move changes the open document's path → stale selection | Medium | Re-resolve via `getEntry(newId)` after the op; clear if gone. |
| Recursive folder delete is destructive | Medium | Clear confirm modal naming the folder + "all contents". |
| Descendant-ID invalidation after folder move/rename | Medium | Re-fetch parents; don't rely on cached child paths post-move. |
| Path ID size over IPC (long Windows paths) | Low | Strings are fine; no action. |
| Hidden/non-`.md` files | Low | Already filtered in `list_children`; keep. |
