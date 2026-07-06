# Add Global Full-Text Search to Sidebar

## Goal

Add a global full-text search bar pinned at the top of the `FilesystemBrowser` sidebar. Typing shows matching `.md` files with a content snippet; the tree is replaced by results. Clearing the query restores the tree. Backend search returns a matched-line snippet. The MCP `search` tool already works — just extends its output with snippets.

## Data Model: new `SearchResult`

**Rust** (`src-tauri/src/storage.rs`) — add alongside `TreeNode`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub kind: TreeNodeKind,
    pub created_at: String,
    pub updated_at: String,
    pub matched_line: String,
}
```

**TypeScript** (`src/api.ts`) — add alongside `TreeNode`:

```ts
export interface SearchResult {
    id: string;
    name: string;
    parent_id: string | null;
    kind: "folder" | "document";
    created_at: string;
    updated_at: string;
    matched_line: string;
}
```

## Implementation Order

### Step 1: Backend — extend `walk_for_search`

**File**: `src-tauri/src/filesystem.rs`

- The current `walk_for_search` (line 522) already reads every `.md` file's content (line 559: `fs::read_to_string(&path)`). It checks `.to_lowercase().contains(query)` but discards the content.
- **Change**: when `content_match` is true, find the first line containing `query` (case-insensitive), extract that line trimmed to ~120 chars, and store it.
- **Change**: when `name_match` is true (filename matched, content not checked), extract the first non-empty line of content as the snippet (or use the filename itself as fallback).
- **New helper**: `fn extract_matched_line(content: &str, query: &str) -> String` — walks lines, finds first that contains query case-insensitively, returns trimmed 120-char snippet.
- Replace `Vec<TreeNode>` accumulator with `Vec<SearchResult>`.
- Update `fn search` signature to return `Result<Vec<SearchResult>, String>`.
- Register `SearchResult` in `storage.rs`.

### Step 2: Backend — update `storage_search` command

**File**: `src-tauri/src/main.rs`

- Change `storage_search` return type from `Vec<TreeNode>` to `Vec<SearchResult>`.
- Wire `searchEntries` in api.ts to return `SearchResult[]`.

### Step 3: MCP — extend `search` tool

**File**: `src-tauri/src/mcp_server.rs`  
**File**: `README.md` (MCP tool table row for `search`)

- The `search` tool handler (line 422) already calls `fs.search(&query)`. It just returns `serde_json::to_string_pretty(&results)`.
- After the backend returns `Vec<SearchResult>`, the JSON output naturally includes `matched_line`. MCP clients get the extra field automatically.
- Update README MCP tool description: `"Search documents by filename or content across all root folders. Returns matching files with a snippet of the first matching line."`

### Step 4: Frontend API

**File**: `src/api.ts`

- Add `SearchResult` interface.
- Change `searchEntries` return type to `SearchResult[]`.
- Keep `storage_search` invoke unchanged (just type annotation change).

### Step 5: Frontend — `FilesystemBrowser.tsx` search UI

Add these changes inside the `FilesystemBrowser` component (the tree root):

- **State**: `query: string`, `results: SearchResult[] | null`, `searching: boolean`.
- **Debounce**: 300ms `useEffect` on `query` change → calls `api.searchEntries(query)` → sets `results`.
- **Keyboard ref**: `useRef<HTMLInputElement>` on the search input. A `useEffect` listens for `Ctrl+Shift+F` to focus the input. `Esc` in the input clears `query` (restoring the tree).
- **Layout**:

  ```
  ┌─────────────────────────┐
  │  🔍 [Search input…]  ✕  │  ← always visible (hidden when roots.length === 0)
  │─────────────────────────│
  │ IF query is empty:      │
  │   same tree as before   │
  │ IF query has results:   │
  │   result rows (below)   │
  │ IF query has no results:│
  │   "No results for 'q'"  │
  └─────────────────────────┘
  ```

- **Result row** component (inline in `FilesystemBrowser.tsx`, ~30 lines):

  ```
  [📄 icon]  result.name
             result.matched_line (truncated, italic, gray)
  ```

- **Click result** → `api.getEntry(result.id)` → `onDocumentSelect(entry)` → clear `query` and `results`.
- **Clear button** (✕) → clears `query` and `results`.

- **Propagation**: the search input + results DIV sits **inside** the `TreeContext.Provider` (it needs `onDocumentSelect` from context), but **outside** the tree scroll area. Structure:

  ```tsx
  <TreeContext.Provider value={ctxValue}>
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar — always visible when roots.length > 0 */}
      {roots.length > 0 && (
        <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
          <input ref={searchRef} ... />
        </div>
      )}
      {/* Content area */}
      <div className="flex-1 overflow-y-auto py-1">
        {query ? renderResults() : renderTree()}
      </div>
    </div>
  </TreeContext.Provider>
  ```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Roots added/removed while search results visible | `roots` prop changes → re-run search if `query` is non-empty (via `useEffect` on `roots`) |
| Document renamed/deleted while in search results | Stale results (acceptable — user clears or re-queries) |
| Search matches >50 files | Cap at 50 results |
| Query contains regex special chars | Use `to_lowercase().contains()` — no regex, no escaping needed |
| Empty/whitespace query | Treat as cleared (return to tree) |
| Very long file with many matching lines | `extract_matched_line` returns only the first matching line |
| No roots configured | Hide search bar entirely |

## Validation

- `cargo check` passes.
- `npx tsc --noEmit` passes.
- `npm run build` succeeds.
- Manual smoke: add 2+ root folders with `.md` files, type in search bar, see results with matching line previews, click result → opens doc, press Esc → tree returns.
- MCP: `search { "query": "some text" }` returns `{ ...matched_line: "…" }`.

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/storage.rs` | Add `SearchResult` struct |
| `src-tauri/src/filesystem.rs` | `walk_for_search` → extract matched line; `search` returns `Vec<SearchResult>` |
| `src-tauri/src/main.rs` | `storage_search` return type → `Vec<SearchResult>` |
| `src-tauri/src/mcp_server.rs` | `search` tool handler — no code change, implicit from new return type |
| `src/api.ts` | Add `SearchResult` type; update `searchEntries` |
| `src/components/FilesystemBrowser.tsx` | Add search bar + result rows (adds ~80 lines) |
| `README.md` | Update MCP `search` tool description |
