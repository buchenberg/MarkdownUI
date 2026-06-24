# Feature: Filesystem Storage Mode & SQLite → Filesystem Export

## Overview

Add a filesystem-based storage backend to MarkdownUI that works like VSCode's file explorer: browse a real directory on disk, see its contents in the left pane, and edit `.md` files directly. The existing SQLite storage remains intact. A storage-type selector in the Settings dialog lets users choose between SQLite and Filesystem mode. Additionally, add an exporter to dump any SQLite-stored collection to a real directory on disk.

---

## Architecture Summary

### Current Architecture

```
Frontend (React/TS)          IPC (Tauri invoke)          Backend (Rust)
─────────────────          ──────────────────          ───────────────
api.ts ──────────────────► main.rs handlers ─────────► database.rs
 (typed wrappers)           (thin pass-through)         (SQLite via rusqlite)
```

All 25+ Tauri commands (`get_collections`, `create_document`, etc.) call directly into `database.rs` methods. The `Database` struct wraps `Mutex<Connection>` and is managed as `Arc<Mutex<Database>>` (aliased `DbArc`) so both Tauri commands (synchronous) and the MCP server (async/spawn_blocking) share the same SQLite connection.

### Target Architecture

```
Frontend (React/TS)          IPC (Tauri invoke)          Backend (Rust)
─────────────────          ──────────────────          ───────────────
api.ts ──────────────────► main.rs handlers ────┬────► database.rs     (SQLite)
                                               │
                                               └────► filesystem.rs   (disk)
                                              (dispatch by storage_type)
```

A `StorageType` enum and a `StorageBackend` trait unify the two backends behind the same Tauri command surface. The frontend API layer and UI components require minimal changes — the same function signatures work for both backends.

---

## Data Model Mapping

### SQLite Mode (unchanged)

| Concept     | SQLite                                                        |
|-------------|---------------------------------------------------------------|
| Collection  | Row in `collections` table (numeric `id`)                     |
| Folder      | Row in `folders` table (numeric `id`, FK to collection/parent)|
| Document    | Row in `documents` table (numeric `id`, `content` as TEXT)    |
| Tree root   | Collection (contains folders + documents)                     |

### Filesystem Mode (new)

| Concept     | Filesystem                                             |
|-------------|--------------------------------------------------------|
| Collection  | **Workspace root** — a directory path chosen by user   |
| Folder      | Real subdirectory on disk                              |
| Document    | Real `.md` file on disk                                |
| Tree root   | The workspace root directory itself                    |
| Name        | Directory or filename (`.md` extension stripped for display) |
| Content     | File contents read/written directly                    |
| Timestamps  | File system metadata (`created` / `modified`)          |

### ID Strategy

SQLite uses `i64` auto-increment IDs. Filesystem entries are identified by their **absolute path**. To maintain API compatibility without a massive refactor:

- All Tauri commands continue using `string`-typed IDs.
- SQLite IDs are serialized as strings (`"42"` → `"42"`).
- Filesystem IDs are the absolute path (`"C:\Users\...\notes.md"`).
- Types change from `i64` to `String` in the serialized structs where necessary, but a thin mapping layer in the frontend (or a string-to-i64 shim for SQLite) handles backward compat.

**Practical choice**: use `String` for the ID field in the Rust structs sent over IPC. A `StorageId` newtype wraps this and dispatches to the correct backend.

---

## Detailed Implementation Plan

### Phase 1: Rust Backend — Storage Abstraction

#### 1.1 New file: `src-tauri/src/storage.rs`

A trait that both SQLite and filesystem backends implement:

```rust
pub enum StorageId {
    Numeric(i64),
    Path(PathBuf),
}

// Serializes as a plain string over IPC
impl Serialize for StorageId { ... }
impl Deserialize for StorageId { ... }

pub struct TreeNode {
    pub id: StorageId,
    pub parent_id: Option<StorageId>,
    pub name: String,
    pub kind: TreeNodeKind, // Folder | Document
    pub content: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub trait StorageBackend: Send + Sync + 'static {
    // Roots (= collections in SQLite mode, workspace roots in FS mode)
    fn list_roots(&self) -> Result<Vec<TreeNode>>;
    fn add_root(&self, name: &str, extra: Option<&str>) -> Result<TreeNode>;
    fn remove_root(&self, id: &StorageId) -> Result<bool>;

    // Children
    fn list_children(&self, parent_id: &StorageId) -> Result<Vec<TreeNode>>;
    fn get_entry(&self, id: &StorageId) -> Result<Option<TreeNode>>;

    // Mutations
    fn create_folder(&self, parent_id: &StorageId, name: &str) -> Result<TreeNode>;
    fn create_document(&self, parent_id: &StorageId, name: &str, content: &str) -> Result<TreeNode>;
    fn update_document(&self, id: &StorageId, name: &str, content: &str) -> Result<TreeNode>;
    fn delete_entry(&self, id: &StorageId) -> Result<bool>;
    fn move_entry(&self, id: &StorageId, new_parent_id: &StorageId) -> Result<TreeNode>;

    // Search
    fn search(&self, query: &str) -> Result<Vec<TreeNode>>;
}
```

#### 1.2 Refactor `database.rs` to implement `StorageBackend`

- Wrap the existing `Database` methods behind the `StorageBackend` trait.
- `StorageId::Numeric(i64)` maps to existing SQLite integer IDs.
- This is mostly delegation — the trait just formalizes the existing interface.

#### 1.3 New file: `src-tauri/src/filesystem.rs`

Implements `StorageBackend` for the filesystem. Key behaviors:

**Workspace roots**: stored in a JSON config file alongside the database (`workspaces.json` in the app data dir). Each entry: `{ "name": "My Notes", "path": "C:\\Users\\...\\notes" }`. The user picks a directory via a native folder dialog.

**Listing children** (`list_children`):
- `std::fs::read_dir` the directory
- Filter: only show directories and `.md` files
- Skip hidden files/folders (names starting with `.`)
- Sort: folders first (alphabetically), then files (alphabetically)
- For files: read file metadata for timestamps; content is `None` (lazy-loaded)

**Reading a document** (`get_entry`):
- Read the file content into `content` field
- Strip `.md` extension for the `name` field

**Creating a document** (`create_document`):
- Append `.md` to the name if not present
- Write content to `{parent_path}/{name}.md`
- Validate: no overwriting existing files

**Updating a document** (`update_document`):
- Handle rename: if name changed, rename the file on disk (`.md` extension handled)
- Write new content to the file

**Deleting** (`delete_entry`):
- For files: `std::fs::remove_file`
- For folders: `std::fs::remove_dir_all` (with confirmation — UI handles this)

**Search** (`search`):
- Walk the workspace root directories
- For each `.md` file, check if the filename or content matches the query
- Simple substring matching (no FTS5 equivalent on disk)
- Consider `grep` / `ripgrep` crate for better performance on large trees

**Timestamps**:
- `created_at`: file creation time via `std::fs::metadata`
- `updated_at`: file modification time
- Formatted as ISO 8601 strings for frontend compatibility

#### 1.4 Refactor `main.rs` — Storage Dispatch

Replace the direct `Database` usage with a `StorageBackend` dispatch:

```rust
enum StorageMode {
    Sqlite(Database),
    Filesystem(FilesystemStorage),
}

struct AppState {
    mode: RwLock<StorageMode>,
}
```

On startup:
1. Read a config file (`storage_config.json`) from the app data dir to determine the current mode.
2. If SQLite: initialize `Database` as before.
3. If Filesystem: initialize `FilesystemStorage`, load `workspaces.json`.
4. Wrap in `Arc<AppState>` and manage with Tauri.

Each Tauri command handler pattern changes from:
```rust
fn get_collections(db: DbState) -> Result<Vec<Collection>, String>
```
to:
```rust
fn get_collections(state: State<'_, AppState>) -> Result<Vec<TreeNode>, String>
```

The command body dispatches to `state.mode.read().unwrap().list_roots()`.

**Important**: All Tauri command signatures change — the returned structs use `TreeNode` instead of `Collection`/`Document`/`Folder`. This means the frontend's `api.ts` return types must be updated. However, the `TreeNode` shape is a superset: it contains all the fields the frontend needs plus a `kind` discriminator.

#### 1.5 MCP Server Compatibility

The MCP server (`mcp_server.rs`) currently holds a `DbArc` and calls `database.rs` methods directly. It needs to accept `Arc<AppState>` instead and call through the `StorageBackend` trait. This ensures MCP tools work in both modes.

---

### Phase 2: Frontend Changes

#### 2.1 Update `api.ts` — Unified Types

Replace the three separate types (`Collection`, `Folder`, `Document`) with a unified `TreeNode`:

```typescript
export type TreeNodeKind = 'folder' | 'document';

export interface TreeNode {
    id: string;               // WAS: number
    parent_id: string | null;
    name: string;
    kind: TreeNodeKind;
    content?: string;         // only populated for documents
    created_at: string;
    updated_at: string;
}

// For backward compat, derive specialized types:
export type Collection = TreeNode;  // kind === 'folder', parent_id === null at root
export type Folder = TreeNode;
export type Document = TreeNode;    // kind === 'document'
```

**API function signatures change**:
- `id` parameters become `string` instead of `number`
- Return types become `TreeNode[]` / `TreeNode` instead of specialized types

This is a pervasive but mechanical change. The `CollectionsBrowser`, `FolderNode`, `DocumentRow` components all already access `id`, `name`, `content`, `folder_id`, etc. The main adjustments:
- `id` changes from `number` to `string`
- Access `doc.kind` to distinguish folders from documents
- Add `parent_id` as the unified parent reference (replacing `collection_id` + `folder_id`)

#### 2.2 New Tauri Commands (Frontend API)

Add to `api.ts`:

```typescript
// Workspace root management (filesystem mode)
export async function addWorkspaceRoot(name: string, path?: string): Promise<TreeNode>;
export async function removeWorkspaceRoot(id: string): Promise<boolean>;

// Get current storage type (for conditional UI)
export async function getStorageType(): Promise<'sqlite' | 'filesystem'>;

// Switch storage type
export async function setStorageType(type: 'sqlite' | 'filesystem'): Promise<void>;

// Export SQLite collection to filesystem
export async function exportCollectionToFilesystem(collectionId: string, targetPath: string): Promise<void>;
```

#### 2.3 New Rust Commands (Backend)

Add to `main.rs`:

```rust
#[tauri::command]
fn add_workspace_root(state: AppState, name: String, path: Option<String>) -> Result<TreeNode, String>;

#[tauri::command]
fn remove_workspace_root(state: AppState, id: String) -> Result<bool, String>;

#[tauri::command]
fn get_storage_type(state: AppState) -> Result<String, String>;

#[tauri::command]
fn set_storage_type(state: AppState, storage_type: String) -> Result<(), String>;

#[tauri::command]
fn export_collection_to_filesystem(
    state: AppState,
    collection_id: String,
    target_path: String,
) -> Result<(), String>;
```

#### 2.4 Update `CollectionsBrowser.tsx`

**SQLite mode (unchanged behavior)**:
- Collections are listed as root nodes
- Expanding a collection fetches folders + documents

**Filesystem mode (new behavior)**:
- Workspace root directories are listed as root nodes
- Expanding a root shows its real subdirectories and `.md` files
- "New Collection" button becomes "Open Folder" / "Add Workspace Root"
- On click: opens a native folder picker dialog (`@tauri-apps/api/dialog` → `open`)
- The selected folder path is saved as a workspace root

**Conditional rendering** based on `getStorageType()`:
- Hover actions: New Folder / New Document stay the same (they write to disk in FS mode)
- Upload button stays the same
- Delete button stays the same
- The "No collections yet" empty state shows "No workspace roots yet" in FS mode

#### 2.5 Update `FolderNode.tsx` and `DocumentRow.tsx`

- `DocumentRow` already handles `Document` items; minimal changes (ID type)
- `FolderNode` already recursively renders child folders + documents; minimal changes
- The `folder_id` / `collection_id` fields are replaced by `parent_id`
- Data fetching calls remain the same (they now go through the unified backend)

#### 2.6 Update `SettingsModal.tsx`

Add a new category: **Storage** (third item in `CATEGORIES` array).

**Storage settings content**:
1. **Storage Type** — Segmented toggle: `SQLite` | `Filesystem`
   - Changing this prompts a warning: "Switching storage type will reload the workspace. Unsaved changes will be lost."
   - On confirm: calls `setStorageType()`, then reloads the app (or re-fetches all data)
2. **Workspace Roots** (only visible when Filesystem is selected):
   - List of current roots with remove buttons
   - "Add Root" button → opens folder picker
   - Shows the filesystem path for each root
3. **Export** (only visible when SQLite is selected and a collection exists):
   - "Export Collection to Folder" button per collection
   - Opens a folder picker for the target directory
   - Calls `exportCollectionToFilesystem()`

**Implementation**:
- New settings need to be stored persistently. Use a `storage_config.json` file in the app data directory (Rust side) and expose get/set via Tauri commands.
- The storage type change requires an app restart or full data reload. We can use `window.location.reload()` after the backend switches.

---

### Phase 3: Export Feature — SQLite Collection → Filesystem

#### 3.1 Backend Export Logic

New method in `database.rs` (or a new `export.rs`):

```rust
pub fn export_collection_to_filesystem(
    &self,
    collection_id: i64,
    target_path: &Path,
) -> Result<()> {
    // 1. Get collection info
    // 2. Create target_path/<collection_name>/ directory
    // 3. Get all root-level folders and documents
    // 4. For each folder: recursively create directories and write files
    // 5. For each document at root: write <name>.md
    // 6. Handle name collisions: append "(1)" suffix
}
```

**Exported structure**:
```
<target_path>/
  <collection_name>/
    document1.md
    document2.md
    subfolder/
      nested_doc.md
      deeper/
        file.md
```

#### 3.2 Frontend Export Trigger

Add an export button in `SettingsModal` → Storage section. When clicked:
1. Show a folder picker dialog (`@tauri-apps/api/dialog` `open` with `directory: true`)
2. Call `export_collection_to_filesystem` Tauri command
3. On success: show a brief success message or toast

Also consider adding an export option in `CollectionsBrowser` hover actions (a download/export icon) for quicker access per-collection.

---

### Phase 4: Configuration Persistence

#### 4.1 New file: `src-tauri/src/config.rs`

Manages `storage_config.json` in the app data directory:

```json
{
    "storage_type": "sqlite",
    "workspaces": [
        { "name": "My Notes", "path": "C:\\Users\\gbuch\\Documents\\notes" },
        { "name": "Project Docs", "path": "D:\\projects\\docs" }
    ]
}
```

Rust structs:
```rust
#[derive(Serialize, Deserialize)]
struct WorkspaceEntry {
    name: String,
    path: PathBuf,
}

#[derive(Serialize, Deserialize)]
struct StorageConfig {
    storage_type: String, // "sqlite" | "filesystem"
    workspaces: Vec<WorkspaceEntry>,
}
```

CRUD methods:
- `load_config(app_data_dir) -> StorageConfig`
- `save_config(app_data_dir, config)`
- `set_storage_type(app_data_dir, type)`
- `add_workspace(app_data_dir, name, path)`
- `remove_workspace(app_data_dir, name)`

---

### Phase 5: Edge Cases & Polish

1. **Switching storage type mid-session**: Warn about unsaved changes, save current document first, then switch.
2. **Missing workspace root**: If a workspace root path no longer exists on disk, show a warning icon and skip it in the tree.
3. **File watch**: In filesystem mode, watch the workspace root for external changes and auto-refresh the tree. Use Tauri's filesystem watch or a polling mechanism. MVP can skip this — manual refresh is acceptable.
4. **Concurrent access**: The filesystem backend doesn't need a mutex (OS handles it), but we should handle errors gracefully if a file is locked by another process.
5. **Unicode filenames**: Handle with Rust's `std::fs` which supports Unicode paths natively.
6. **Large directories**: Paginate or lazy-load directory listings if a folder has 1000+ entries. MVP can load all; filesystem listings are fast even for large dirs.
7. **Symlinks**: Follow symlinks? MVP: treat symlinks to directories as directories, symlinks to `.md` files as documents. Skip broken symlinks.
8. **Permissions**: Handle "access denied" errors gracefully — show an error in the UI, don't crash.
9. **Search in filesystem mode**: Use a simple file-walking approach for MVP. Can integrate `ripgrep` crate later for performance.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src-tauri/src/storage.rs` | `StorageBackend` trait + `TreeNode` / `StorageId` types |
| `src-tauri/src/filesystem.rs` | Filesystem backend implementation |
| `src-tauri/src/config.rs` | Configuration persistence (`storage_config.json`) |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src-tauri/src/main.rs` | Replace direct `Database` calls with `StorageBackend` dispatch; add new Tauri commands for workspace roots, storage type switching, export |
| `src-tauri/src/database.rs` | Implement `StorageBackend` trait for `Database`; add `export_collection_to_filesystem` |
| `src-tauri/src/mcp_server.rs` | Switch from `DbArc` to `Arc<AppState>` for storage dispatch |
| `src-tauri/Cargo.toml` | Add `walkdir` or similar crate for filesystem search (optional) |
| `src/api.ts` | Unified `TreeNode` type; string-based IDs; new API functions for workspace roots, storage type, export |
| `src/App.tsx` | Minor: handle unified types; pass storage type to browser |
| `src/components/CollectionsBrowser.tsx` | Conditional rendering for filesystem vs SQLite mode; "Open Folder" button |
| `src/components/FolderNode.tsx` | Use `parent_id` instead of `collection_id` + `folder_id`; handle `TreeNodeKind` |
| `src/components/DocumentRow.tsx` | String ID type change |
| `src/components/SettingsModal.tsx` | Add Storage category with storage type toggle, workspace roots list, export button |
| `src/components/SettingsRow.tsx` | No structural changes needed (already generic) |
| `src/contexts/SettingsContext.tsx` | No changes needed (already provides open/close) |

### Unchanged Files

| File | Notes |
|------|-------|
| `src/components/DocumentEditor.tsx` | Editor operates on content string — storage-agnostic |
| `src/components/DocumentPreview.tsx` | Preview operates on content string — storage-agnostic |
| `src/components/ResizableSplit.tsx` | Pure layout component |
| `src/components/ZoomControls.tsx` | Pure UI; export functions pass through unchanged |
| `src/components/ThemeToggle.tsx` | No changes |
| `src/components/ConfirmModal.tsx` | No changes |
| `src/components/SegmentedToggle.tsx` | No changes |
| `src-tauri/src/converter.rs` | No changes (operates on content strings) |
| `src/hooks/useMcpEvents.ts` | No changes |
| `src/utils/slugify.ts` | No changes |

---

## Migration Path

The changes are designed to be backward-compatible:

1. Existing SQLite databases continue to work — the `StorageBackend` trait is just a wrapper around the existing `Database` methods.
2. The default storage type remains `sqlite` — users who don't open Settings see no difference.
3. The settings dialog is additive — new Storage section appears alongside existing General and MCP Server sections.
4. The `TreeNode` type is a superset of the existing types — existing documents, folders, and collections serialize to the same shape.

---

## Implementation Order

1. **`storage.rs`** — Define the `StorageBackend` trait and `TreeNode`/`StorageId` types.
2. **Refactor `database.rs`** — Implement `StorageBackend` for `Database`. Ensure all existing tests/behavior unchanged.
3. **Refactor `main.rs`** — Switch Tauri commands to use `StorageBackend` trait. Introduce `AppState`.
4. **Refactor `mcp_server.rs`** — Switch to `AppState`.
5. **`config.rs`** — Configuration persistence.
6. **Frontend type unification** (`api.ts`) — String IDs, `TreeNode` type.
7. **`filesystem.rs`** — Implement filesystem backend.
8. **Settings integration** — Storage type toggle, workspace management.
9. **`CollectionsBrowser` conditional rendering** — Filesystem mode UI.
10. **Export feature** — SQLite → filesystem export command + UI trigger.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Breaking existing SQLite behavior | Medium | Implement trait for SQLite first, verify all commands return identical data shapes |
| ID type change (i64 → String) causes frontend breakage | High | Mechanical replacement; use TypeScript to catch all mismatches at compile time |
| Filesystem operations fail on locked/read-only files | Low | Graceful error handling; surface errors in UI without crashing |
| MCP server desync with unified backend | Medium | MCP server already uses `DbArc` — switching to `AppState` is a direct replacement |
| Performance of filesystem listing for large directories | Low | Filesystem reads are fast; consider lazy loading for dirs with >1000 entries |
| Cross-platform path handling | Medium | Use Rust's `Path`/`PathBuf` consistently; test on Windows first (primary dev platform) |
