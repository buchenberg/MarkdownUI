# Plan: MCP Live Update Animations

**Date**: 2026-06-09  
**Feature branch**: `feat/mcp-live-animations`  
**Status**: Planning

---

## Goal

When an AI agent updates documents/collections via the MCP server, the MarkdownUI frontend should show real-time animations:

1. **Open document**: Content updates appear with a "beamed in" shimmer/scan-line effect
2. **Tree items**: Documents and collections in the sidebar pulse when affected by MCP operations
3. **Batched updates**: Multiple rapid MCP events are deduplicated so animations don't stack chaotically

## Current Architecture (what we're building on)

```
MCP Agent (Hermes) ──HTTP POST──▶ axum MCP server (tokio task)
                                      │
                                      ▼
                              run_tool(db, name, args)
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                    create_*     update_*     delete_*
                         │            │            │
                         └────────────┼────────────┘
                                      ▼
                              SQLite (via Arc<Mutex<Database>>)

Frontend (React) ◀── poll/invoke ── Tauri commands ── same DB handle
                                      (no push mechanism currently)
```

**Key observation**: The MCP server and Tauri commands share `Arc<Mutex<Database>>` but the frontend has no way to know when MCP operations happen. Currently the MCP server is completely firewalled from the Tauri event system.

## Proposed Architecture

```
MCP Agent ──HTTP──▶ axum MCP server
                        │
                        ▼
                 run_tool(db, name, args)
                        │
                        ▼
                 SQLite write succeeds
                        │
                        ▼
            app_handle.emit_all("mcp-operation", payload)
                        │
                        ▼
              Tauri event bus ──────▶ Frontend listener (useMcpEvents hook)
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                        open doc?     tree item?     collection?
                        shimmer      pulse bg       expand/refresh
```

### Why Tauri Events (not WebSocket, not polling)

| Approach | Pros | Cons |
|----------|------|------|
| **Tauri events** ✅ | Already in Tauri, zero new deps, same process, type-safe payloads, frontend already uses `@tauri-apps/api` | Need to thread `AppHandle` into MCP server |
| WebSocket | Works in browser-only dev mode | New dep (`tokio-tungstenite`), new port, more complex |
| Polling | Simplest | Not real-time, wasteful, defeats the "live" feel |

**Decision**: Tauri events. The MCP server is Tauri-only (not available in `dev:frontend` mode), so there's no browser-only use case that needs WebSocket.

---

## Implementation Plan

### Phase 1: Backend — Emit Tauri events from MCP server

#### 1.1 Pass `AppHandle` into the MCP router

**File**: `src-tauri/src/main.rs` (line 124)

Currently:
```rust
let router = mcp_server::build_router(Arc::clone(&db_arc));
```

Change to:
```rust
let app_handle = app.handle();  // app: &tauri::App from setup
let router = mcp_server::build_router(Arc::clone(&db_arc), app_handle);
```

Also add `use tauri::AppHandle;` if not already imported.

#### 1.2 Add `AppHandle` to MCP server state

**File**: `src-tauri/src/mcp_server.rs`

Create a shared state struct:
```rust
use tauri::AppHandle;

pub struct McpState {
    pub db: DbArc,
    pub app_handle: AppHandle,
}
```

Change `build_router` signature:
```rust
pub fn build_router(db: DbArc, app_handle: AppHandle) -> Router {
    let state = Arc::new(McpState { db, app_handle });
    // ...
    .with_state(state)
}
```

Update handler signatures from `State<DbArc>` to `State<Arc<McpState>>`.

#### 1.3 Define the event payload

**File**: `src-tauri/src/mcp_server.rs` (new struct)

```rust
#[derive(Debug, Serialize, Clone)]
struct McpEvent {
    operation: String,           // "create_document", "update_document", etc.
    id: i64,                     // affected entity ID
    collection_id: Option<i64>,  // for document ops: parent collection
    name: String,                // affected entity name (for tree display)
    timestamp: String,           // ISO 8601
}
```

#### 1.4 Emit events after write operations

**File**: `src-tauri/src/mcp_server.rs` — in `run_tool()`

After each successful write operation, emit to all windows:

```rust
let payload = McpEvent {
    operation: "update_document".into(),
    id,
    collection_id: Some(doc.collection_id),
    name: doc.name.clone(),
    timestamp: chrono::Utc::now().to_rfc3339(),
};
let _ = state.app_handle.emit_all("mcp-operation", payload);
```

Operations that emit events:
- `create_document` — after successful creation
- `update_document` — after successful update
- `delete_document` — after successful deletion (need to capture collection_id before deleting)
- `create_collection` — after successful creation
- `update_collection` — after successful update
- `delete_collection` — after successful deletion

**Read-only operations** (list_collections, get_collection, list_documents, get_document, search_documents) do NOT emit events.

#### 1.5 Thread safety considerations

`AppHandle` is `Send + Sync` and cheap to clone (it's an `Arc` internally). The `McpState` wraps it in `Arc`, safe to share across the tokio task and axum handlers.

**Important**: `emit_all` sends to ALL windows. MarkdownUI is single-window, so this is correct. If multi-window support is added later, consider `emit_to` targeting the main window.

#### 1.6 `delete_document` edge case

For `delete_document`, we need `collection_id` before deleting:

```rust
"delete_document" => {
    let id = get_i64(&args, "id")?;
    // Capture collection_id before deletion
    let collection_id = db.get_document(id)
        .map_err(|e| e.to_string())?
        .map(|d| d.collection_id);
    let name = db.get_document(id)?.map(|d| d.name).unwrap_or_default();
    let ok = db.delete_document(id).map_err(|e| e.to_string())?;
    // Emit event with captured collection_id
    // ...
    Ok(format!("{{\"deleted\": {ok}}}"))
}
```

---

### Phase 2: Frontend — Listen and animate

#### 2.1 New hook: `useMcpEvents`

**File**: `src/hooks/useMcpEvents.ts` (new)

```typescript
import { useEffect, useState, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface McpEventPayload {
    operation: string;
    id: number;
    collection_id: number | null;
    name: string;
    timestamp: string;
}

interface AnimatingItem {
    id: number;
    operation: string;
    expiresAt: number;  // epoch ms
}

const ANIMATION_DURATION_MS = 2000;

export function useMcpEvents(enabled: boolean) {
    const [animatingIds, setAnimatingIds] = useState<Set<number>>(new Set());
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        if (!enabled) return;
        
        let unlisten: UnlistenFn;
        
        const setup = async () => {
            unlisten = await listen<McpEventPayload>("mcp-operation", (event) => {
                const { id, collection_id, operation } = event.payload;
                
                // Add to animating set
                setAnimatingIds((prev) => new Set(prev).add(id));
                
                // Also animate the parent collection for document ops
                if (collection_id != null) {
                    setAnimatingIds((prev) => new Set([...prev, collection_id]));
                }
                
                // Clear existing timer for this ID (dedup)
                const existing = timersRef.current.get(id);
                if (existing) clearTimeout(existing);
                
                // Set expiration timer
                const timer = setTimeout(() => {
                    setAnimatingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    timersRef.current.delete(id);
                }, ANIMATION_DURATION_MS);
                
                timersRef.current.set(id, timer);
            });
        };
        
        setup();
        
        return () => {
            unlisten?.();
            // Clean up all timers
            timersRef.current.forEach((t) => clearTimeout(t));
            timersRef.current.clear();
        };
    }, [enabled]);

    return { animatingIds };
}
```

**Design decisions**:
- Hook only activates when `enabled` is true (MCP server running)
- Uses `Set<number>` for O(1) lookup in render
- Deduplicates rapid updates by resetting the timer (last event extends animation)
- Automatically cleans up timers on unmount

#### 2.2 App.tsx — Wire up the hook and handle open-document updates

**File**: `src/App.tsx`

Changes:
```typescript
import { useMcpEvents } from "./hooks/useMcpEvents";

// New state
const [mcpFlash, setMcpFlash] = useState(false);

// Listen for MCP events when server is running
const { animatingIds } = useMcpEvents(mcpRunning);

// When an MCP event touches the currently open document, refresh it
useEffect(() => {
    if (!selectedDocument || !mcpRunning) return;
    
    // Check if our open document was affected
    if (animatingIds.has(selectedDocument.id)) {
        // Re-fetch the document to get updated content
        api.getDocument(selectedDocument.id).then((doc) => {
            if (doc) {
                setDocumentContent(doc.content);
                setDocumentName(doc.name);
                setHasChanges(false);
                // Trigger the shimmer animation
                setMcpFlash(true);
                setTimeout(() => setMcpFlash(false), 1500);
            }
        });
    }
}, [animatingIds, selectedDocument?.id]);

// Pass new props to children
<CollectionsBrowser
    // ... existing props
    mcpAnimatingIds={animatingIds}
/>

<DocumentEditor
    // ... existing props
    mcpFlash={mcpFlash}
/>
```

**Important**: The `useEffect` watching `animatingIds` must not cause infinite loops. The `animatingIds` Set changes reference each time, so we use `selectedDocument?.id` as the dependency and check containment inside.

#### 2.3 DocumentEditor — Shimmer overlay animation

**File**: `src/components/DocumentEditor.tsx`

Add prop:
```typescript
interface DocumentEditorProps {
    // ... existing
    mcpFlash?: boolean;
}
```

Add overlay element (rendered conditionally):
```tsx
{mcpFlash && (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <div className="mcp-shimmer-overlay absolute inset-0" />
    </div>
)}
```

This requires the DocumentEditor container to have `position: relative`.

#### 2.4 CollectionsBrowser — Tree item pulse animation

**File**: `src/components/CollectionsBrowser.tsx`

Add prop:
```typescript
interface CollectionsBrowserProps {
    // ... existing
    mcpAnimatingIds?: Set<number>;
}
```

On each document row (line 504) and collection row (line 394), add conditional animation class:
```tsx
className={`... ${
    mcpAnimatingIds?.has(doc.id) ? "mcp-animate-pulse" : ""
}`}
```

Same for collection rows using `collection.id`.

#### 2.5 CSS animations

**File**: `src/index.css` (append)

```css
/* ── MCP Live Update Animations ─────────────────────────────────────────── */

/* Tree item pulse: accent background that fades out */
@keyframes mcp-pulse {
    0%   { background-color: rgba(59, 130, 246, 0.25); }  /* blue-500 */
    60%  { background-color: rgba(59, 130, 246, 0.08); }
    100% { background-color: transparent; }
}

.mcp-animate-pulse {
    animation: mcp-pulse 2s ease-out forwards;
}

/* Dark theme variant */
.dark .mcp-animate-pulse {
    animation-name: mcp-pulse-dark;
}

@keyframes mcp-pulse-dark {
    0%   { background-color: rgba(96, 165, 250, 0.20); }  /* blue-400 */
    60%  { background-color: rgba(96, 165, 250, 0.06); }
    100% { background-color: transparent; }
}

/* ── Editor shimmer: scan-line effect ────────────────────────────────────── */

@keyframes mcp-shimmer {
    0%   { 
        transform: translateX(-100%) skewX(-15deg);
        opacity: 0;
    }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { 
        transform: translateX(200%) skewX(-15deg);
        opacity: 0;
    }
}

.mcp-shimmer-overlay {
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(59, 130, 246, 0.12) 40%,   /* blue-500 at 12% */
        rgba(147, 197, 253, 0.20) 50%,   /* blue-300 at 20% */
        rgba(59, 130, 246, 0.12) 60%,
        transparent 100%
    );
    animation: mcp-shimmer 1.2s ease-in-out forwards;
}

/* Dark theme shimmer (brighter) */
.dark .mcp-shimmer-overlay {
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(96, 165, 250, 0.15) 40%,
        rgba(191, 219, 254, 0.25) 50%,
        rgba(96, 165, 250, 0.15) 60%,
        transparent 100%
    );
}

/* ── Collection-level pulse (subtler than document pulse) ───────────────── */
.mcp-animate-pulse-collection {
    animation: mcp-pulse-collection 2s ease-out forwards;
}

@keyframes mcp-pulse-collection {
    0%   { background-color: rgba(234, 179, 8, 0.15); }   /* yellow-500 */
    60%  { background-color: rgba(234, 179, 8, 0.05); }
    100% { background-color: transparent; }
}

.dark .mcp-animate-pulse-collection {
    animation-name: mcp-pulse-collection-dark;
}

@keyframes mcp-pulse-collection-dark {
    0%   { background-color: rgba(250, 204, 21, 0.12); }
    60%  { background-color: rgba(250, 204, 21, 0.04); }
    100% { background-color: transparent; }
}
```

---

### Phase 3: Polish and edge cases

#### 3.1 Auto-save conflict resolution

**Problem**: If the user has unsaved changes and an MCP update overwrites the document, the user loses their work.

**Solution**: When `mcpFlash` triggers for an open document:
- If `hasChanges` is true AND `documentContent !== newContent`: show a toast/banner "Document was updated externally. Your changes were preserved in clipboard." and save the user's content to clipboard, then load the MCP version.
- If no unsaved changes: silently update with animation.

**Implementation**: In the `useEffect` that handles `animatingIds`:
```typescript
api.getDocument(selectedDocument.id).then((doc) => {
    if (!doc) return;
    if (hasChanges && documentContent !== doc.content) {
        // Conflict: save user's version to clipboard
        navigator.clipboard.writeText(documentContent);
        // Could show a toast here (future enhancement)
    }
    setDocumentContent(doc.content);
    setDocumentName(doc.name);
    setHasChanges(false);
    setHasNameChanges(false);
    setMcpFlash(true);
    setTimeout(() => setMcpFlash(false), 1500);
});
```

#### 3.2 Re-fetch tree data after MCP events

**Problem**: When a document is created or deleted via MCP, the tree doesn't update until the user manually re-expands the collection.

**Solution**: After receiving an MCP event, trigger a re-fetch of the affected collection's documents:

In `CollectionsBrowser`, add a new prop or internal effect:
```typescript
useEffect(() => {
    if (!mcpAnimatingIds || mcpAnimatingIds.size === 0) return;
    
    // Find which collections need refreshing
    for (const [collectionId, docs] of documentsByCollection) {
        const needsRefresh = docs.some(d => mcpAnimatingIds.has(d.id))
            || mcpAnimatingIds.has(collectionId);
        if (needsRefresh) {
            fetchDocumentsForCollection(collectionId);
        }
    }
}, [mcpAnimatingIds]);
```

**Alternative (better)**: Use the `collection_id` from the event payload directly. The `useMcpEvents` hook should expose not just a Set of IDs, but a list of events with `collection_id` so the browser knows exactly which collection to refresh.

Refined hook return:
```typescript
interface McpEventDetail {
    id: number;
    operation: string;
    collectionId: number | null;
}

// Return both the animation set and the event details
return {
    animatingIds,
    lastEvents: lastEventsRef.current,  // MCP events from the last ~3 seconds
};
```

Then in `CollectionsBrowser`:
```typescript
useEffect(() => {
    for (const event of lastEvents) {
        if (event.collectionId != null) {
            fetchDocumentsForCollection(event.collectionId);
        }
    }
}, [lastEvents]);
```

#### 3.3 Performance: debounce tree re-fetches

If an agent batch-creates 50 documents, we don't want 50 re-fetches. Debounce to one re-fetch per collection per 500ms window:

```typescript
const pendingRefreshes = useRef<Set<number>>(new Set());

useEffect(() => {
    for (const event of lastEvents) {
        if (event.collectionId != null) {
            pendingRefreshes.current.add(event.collectionId);
        }
    }
    
    const timer = setTimeout(() => {
        for (const cid of pendingRefreshes.current) {
            fetchDocumentsForCollection(cid);
        }
        pendingRefreshes.current.clear();
    }, 500);
    
    return () => clearTimeout(timer);
}, [lastEvents]);
```

---

## Files Changed

| File | Change | Phase |
|------|--------|-------|
| `src-tauri/src/main.rs` | Pass `AppHandle` to `build_router` | 1 |
| `src-tauri/src/mcp_server.rs` | Add `McpState`, emit events after writes | 1 |
| `src/hooks/useMcpEvents.ts` | **New** — Tauri event listener hook | 2 |
| `src/App.tsx` | Wire `useMcpEvents`, refresh open doc, pass props | 2 |
| `src/components/DocumentEditor.tsx` | Accept `mcpFlash`, render shimmer overlay | 2 |
| `src/components/CollectionsBrowser.tsx` | Accept `mcpAnimatingIds`, apply pulse classes, re-fetch | 2 |
| `src/index.css` | Add `@keyframes` and animation classes | 2 |

## Verification

### Manual testing steps

1. `npm run tauri dev` — start the app
2. Click MCP button to start the server (green dot)
3. From terminal, trigger an update:
   ```bash
   curl -s -X POST http://localhost:3333/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"update_document","arguments":{"id":2,"name":"Changelog","content":"# Updated via MCP\n\nNew content!"}}}' | jq
   ```
4. **Verify**: If document 2 is open, the editor shows a shimmer effect and content updates
5. **Verify**: Document 2 in the tree pulses blue and fades over ~2 seconds
6. Test rapid fire:
   ```bash
   for i in {1..5}; do
     curl -s -X POST http://localhost:3333/mcp \
       -H "Content-Type: application/json" \
       -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/call\",\"params\":{\"name\":\"update_document\",\"arguments\":{\"id\":2,\"name\":\"Changelog\",\"content\":\"Update $i\"}}}" &
   done
   ```
7. **Verify**: Only one animation plays (deduplication), tree refreshes once (debounce)

### Edge cases to test

- MCP server OFF → no events, no animation, no errors
- Delete the open document via MCP → editor clears, document removed from tree
- Create document via MCP → new doc appears in tree with pulse, collection auto-expands
- Delete a collection via MCP → collection removed from tree

## Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| **Threading**: `AppHandle` must be `Send + Sync` | It is — Tauri guarantees this. Verified in Tauri 1.x API docs. |
| **Auto-save conflicts**: User editing while MCP writes | Phase 3.1 clipboard save + future toast notification |
| **Performance**: Many rapid MCP events | Debounce tree refreshes (Phase 3.3), deduplicate animations (already in hook) |
| **`delete_document` needs `collection_id`** | Need extra DB read before delete (Phase 1.6) — one extra query, acceptable |
| **Window closed during MCP op**: `emit_all` on dead window | `emit_all` returns `Result` — we use `let _ =` to ignore errors |

## Open Questions

1. **Should `update_document` events only fire when content actually changed?** Currently they fire on every update call. If an agent calls update with identical content, there's still an animation. This is acceptable — the agent shouldn't be doing that, and it's a minor UX issue if it does.

2. **Collection-level animation color**: Yellow (collection theme) vs blue (document theme) — we use yellow for collection pulses, blue for document pulses. This matches the existing folder icon colors.

3. **Should animations respect the user's reduced-motion preference?** Future enhancement. Can add `@media (prefers-reduced-motion: reduce)` to disable animations for accessibility.

---

## Dependencies

- **No new npm packages required** — uses existing `@tauri-apps/api` (already a dependency)
- **No new Cargo crates required** — `tauri::AppHandle`, `serde::Serialize` already in tree
- **Optional**: `chrono` for timestamps (alternatively use `std::time::SystemTime` to avoid new dep)
