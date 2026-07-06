import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { TreeNode } from "../api";
import * as api from "../api";
import { slugify } from "../utils/slugify";

interface FilesystemBrowserProps {
    roots: TreeNode[];
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode | null) => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
    onRootsChanged?: () => void;
    onRemoveWorkspaceRoot?: (id: string) => Promise<void>;
    mcpAnimatingIds?: Set<string>;
}

// ── Tree refresh/drag context ────────────────────────────────────────────────
// Lets a row trigger a refresh of any parent directory after a mutation,
// and shares the in-flight drag source id across the tree.

interface TreeContextValue {
    refreshPath: (path: string) => void;
    register: (path: string, fn: () => void) => void;
    unregister: (path: string) => void;
    dragState: React.MutableRefObject<string | null>;
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode | null) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);

function useTreeContext(): TreeContextValue {
    const ctx = useContext(TreeContext);
    if (!ctx) throw new Error("Tree components must be used within FilesystemBrowser");
    return ctx;
}

// True if `path` is a descendant of `ancestor` (i.e. lives underneath it).
function isDescendant(ancestor: string, path: string): boolean {
    if (path === ancestor) return false;
    return path.startsWith(ancestor + "/") || path.startsWith(ancestor + "\\");
}

export default function FilesystemBrowser({
    roots,
    selectedDocId,
    onDocumentSelect,
    onHeadingClick,
    onRootsChanged,
    onRemoveWorkspaceRoot,
    mcpAnimatingIds,
}: FilesystemBrowserProps) {
    const registryRef = useRef<Map<string, () => void>>(new Map());
    const dragState = useRef<string | null>(null);

    const ctxValue: TreeContextValue = {
        refreshPath: (path) => {
            const fn = registryRef.current.get(path);
            if (fn) fn();
        },
        register: (path, fn) => registryRef.current.set(path, fn),
        unregister: (path) => registryRef.current.delete(path),
        dragState,
        selectedDocId,
        onDocumentSelect,
    };

    return (
        <TreeContext.Provider value={ctxValue}>
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto py-1">
                    {roots.length === 0 && (
                        <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                            No workspace roots. Open Settings → Storage to add a folder.
                        </div>
                    )}
                    {roots.map((root) => (
                        <FsRootNode
                            key={root.id}
                            root={root}
                            onHeadingClick={onHeadingClick}
                            onRootsChanged={onRootsChanged}
                            onRemoveWorkspaceRoot={onRemoveWorkspaceRoot}
                            mcpAnimatingIds={mcpAnimatingIds}
                        />
                    ))}
                </div>
            </div>
        </TreeContext.Provider>
    );
}

// ── Root node ─────────────────────────────────────────────────────────────────

function FsRootNode({
    root,
    onHeadingClick,
    onRootsChanged,
    onRemoveWorkspaceRoot,
    mcpAnimatingIds,
}: {
    root: TreeNode;
    onHeadingClick?: (docId: string, headingId: string) => void;
    onRootsChanged?: () => void;
    onRemoveWorkspaceRoot?: (id: string) => Promise<void>;
    mcpAnimatingIds?: Set<string>;
}) {
    const { register, unregister } = useTreeContext();
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<TreeNode[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

    const refreshChildren = async () => {
        try {
            const items = await api.listChildren(root.id);
            setChildren(items);
        } catch (err) {
            console.error("Failed to list children:", err);
        }
    };

    useEffect(() => {
        register(root.id, refreshChildren);
        return () => unregister(root.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root.id]);

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (children === null) {
            setLoading(true);
            await refreshChildren();
            setLoading(false);
        }
    };

    const handleCreate = async (kind: "folder" | "document") => {
        if (!expanded) {
            setExpanded(true);
            if (children === null) {
                setLoading(true);
                await refreshChildren();
                setLoading(false);
            }
        }
        const placeholder = kind === "folder" ? "New Folder" : "New Document";
        try {
            const node =
                kind === "folder"
                    ? await api.createFolderEntry(root.id, placeholder)
                    : await api.createDocEntry(root.id, placeholder, "");
            await refreshChildren();
            setRenamingId(node.id);
            setNewlyCreatedId(node.id);
        } catch (err) {
            console.error("Failed to create entry:", err);
            alert(`Failed to create ${kind}: ${err}`);
        }
    };

    const handleRenameCommit = async (id: string, newName: string) => {
        setRenamingId(null);
        const wasNew = newlyCreatedId === id;
        setNewlyCreatedId(null);
        try {
            await api.renameEntry(id, newName);
            await refreshChildren();
        } catch (err) {
            console.error("Rename failed:", err);
            alert(`Rename failed: ${err}`);
            if (wasNew) {
                // clean up orphan placeholder
                try {
                    await api.deleteEntry(id);
                    await refreshChildren();
                } catch {
                    /* ignore */
                }
            }
        }
    };

    const handleRenameCancel = async (id: string) => {
        setRenamingId(null);
        if (newlyCreatedId === id) {
            setNewlyCreatedId(null);
            try {
                await api.deleteEntry(id);
                await refreshChildren();
            } catch (err) {
                console.error("Failed to clean up placeholder:", err);
            }
        }
    };

    return (
        <FsDirBody
            node={root}
            depth={0}
            isRoot
            expanded={expanded}
            children={children}
            loading={loading}
            renamingId={renamingId}
            mcpAnimatingIds={mcpAnimatingIds}
            onToggle={handleToggle}
            onHeadingClick={onHeadingClick}
            onCreate={handleCreate}
            onRenameStart={(id) => {
                setRenamingId(id);
                setNewlyCreatedId(null);
            }}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
            onRemoveWorkspaceRoot={onRemoveWorkspaceRoot}
            onRootsChanged={onRootsChanged}
        />
    );
}

// ── Folder node ───────────────────────────────────────────────────────────────

function FsFolderNode({
    node,
    depth,
    onHeadingClick,
    mcpAnimatingIds,
}: {
    node: TreeNode;
    depth: number;
    onHeadingClick?: (docId: string, headingId: string) => void;
    mcpAnimatingIds?: Set<string>;
}) {
    const { register, unregister } = useTreeContext();
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<TreeNode[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);

    const refreshChildren = async () => {
        try {
            const items = await api.listChildren(node.id);
            setChildren(items);
        } catch (err) {
            console.error("Failed to list children:", err);
        }
    };

    useEffect(() => {
        register(node.id, refreshChildren);
        return () => unregister(node.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (children === null) {
            setLoading(true);
            await refreshChildren();
            setLoading(false);
        }
    };

    const handleCreate = async (kind: "folder" | "document") => {
        if (!expanded) {
            setExpanded(true);
            if (children === null) {
                setLoading(true);
                await refreshChildren();
                setLoading(false);
            }
        }
        const placeholder = kind === "folder" ? "New Folder" : "New Document";
        try {
            const created =
                kind === "folder"
                    ? await api.createFolderEntry(node.id, placeholder)
                    : await api.createDocEntry(node.id, placeholder, "");
            await refreshChildren();
            setRenamingId(created.id);
            setNewlyCreatedId(created.id);
        } catch (err) {
            console.error("Failed to create entry:", err);
            alert(`Failed to create ${kind}: ${err}`);
        }
    };

    const handleRenameCommit = async (id: string, newName: string) => {
        setRenamingId(null);
        const wasNew = newlyCreatedId === id;
        setNewlyCreatedId(null);
        try {
            await api.renameEntry(id, newName);
            await refreshChildren();
        } catch (err) {
            console.error("Rename failed:", err);
            alert(`Rename failed: ${err}`);
            if (wasNew) {
                try {
                    await api.deleteEntry(id);
                    await refreshChildren();
                } catch {
                    /* ignore */
                }
            }
        }
    };

    const handleRenameCancel = async (id: string) => {
        setRenamingId(null);
        if (newlyCreatedId === id) {
            setNewlyCreatedId(null);
            try {
                await api.deleteEntry(id);
                await refreshChildren();
            } catch (err) {
                console.error("Failed to clean up placeholder:", err);
            }
        }
    };

    return (
        <FsDirBody
            node={node}
            depth={depth}
            isRoot={false}
            expanded={expanded}
            children={children}
            loading={loading}
            renamingId={renamingId}
            mcpAnimatingIds={mcpAnimatingIds}
            onToggle={handleToggle}
            onHeadingClick={onHeadingClick}
            onCreate={handleCreate}
            onRenameStart={(id) => {
                setRenamingId(id);
                setNewlyCreatedId(null);
            }}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={handleRenameCancel}
        />
    );
}

// ── Shared directory body (renders header + children) ────────────────────────

function FsDirBody({
    node,
    depth,
    isRoot,
    expanded,
    children,
    loading,
    renamingId,
    mcpAnimatingIds,
    onToggle,
    onHeadingClick,
    onCreate,
    onRenameStart,
    onRenameCommit,
    onRenameCancel,
    onRemoveWorkspaceRoot,
    onRootsChanged,
}: {
    node: TreeNode;
    depth: number;
    isRoot: boolean;
    expanded: boolean;
    children: TreeNode[] | null;
    loading: boolean;
    renamingId: string | null;
    mcpAnimatingIds?: Set<string>;
    onToggle: () => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
    onCreate: (kind: "folder" | "document") => void;
    onRenameStart: (id: string) => void;
    onRenameCommit: (id: string, newName: string) => void;
    onRenameCancel: (id: string) => void;
    onRemoveWorkspaceRoot?: (id: string) => Promise<void>;
    onRootsChanged?: () => void;
}) {
    const { dragState, refreshPath, selectedDocId, onDocumentSelect } = useTreeContext();
    const [isDragOver, setIsDragOver] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const indent = depth === 0 ? undefined : 28 + depth * 16;

    const canDropHere = (): boolean => {
        const src = dragState.current;
        if (!src) return false;
        if (src === node.id) return false;
        // can't move a folder into its own descendant
        if (isDescendant(src, node.id)) return false;
        return true;
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const src = dragState.current;
        if (!src || !canDropHere()) return;
        try {
            await api.moveEntry(src, node.id);
            refreshPath(node.id);
            // best-effort refresh of the source's parent
            const srcParent = getParentPath(src);
            if (srcParent) refreshPath(srcParent);
        } catch (err) {
            console.error("Move failed:", err);
            alert(`Move failed: ${err}`);
        }
        dragState.current = null;
    };

    const handleDelete = async () => {
        setConfirmDelete(false);
        try {
            await api.deleteEntry(node.id);
            if (isDescendant(node.id, selectedDocId ?? "") || selectedDocId === node.id) {
                onDocumentSelect(null);
            }
            const parent = getParentPath(node.id);
            if (parent) refreshPath(parent);
        } catch (err) {
            console.error("Delete failed:", err);
            alert(`Delete failed: ${err}`);
        }
    };

    return (
        <div>
            <div
                className={`group flex items-center gap-0.5 cursor-pointer select-none py-0.5 pr-1 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    isDragOver && canDropHere()
                        ? "bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400"
                        : ""
                } ${mcpAnimatingIds?.has(node.id) ? "mcp-animate-pulse" : ""}`}
                style={indent ? { paddingLeft: indent } : { paddingLeft: 12 }}
                draggable={!isRoot && renamingId !== node.id}
                onDragStart={(e) => {
                    if (isRoot) return;
                    dragState.current = node.id;
                    e.dataTransfer.effectAllowed = "move";
                    try {
                        e.dataTransfer.setData("text/plain", node.id);
                    } catch {
                        /* ignore */
                    }
                }}
                onDragEnd={() => {
                    dragState.current = null;
                }}
                onClick={onToggle}
                onDoubleClick={(e) => {
                    if (!isRoot) {
                        e.stopPropagation();
                        onRenameStart(node.id);
                    }
                }}
                onDragOver={(e) => {
                    if (canDropHere()) {
                        e.preventDefault();
                        setIsDragOver(true);
                    }
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
            >
                <span
                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 transition-transform duration-100 ${expanded ? "" : "-rotate-90"}`}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </span>
                <span className="flex-shrink-0 text-yellow-500 dark:text-yellow-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        {expanded ? (
                            <path d="M20 6h-8l-2-2H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
                        ) : (
                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                        )}
                    </svg>
                </span>

                {renamingId === node.id ? (
                    <InlineRename
                        initialValue={node.name}
                        className={`flex-1 ml-0.5 text-sm px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none ${
                            isRoot ? "text-gray-800 dark:text-gray-200" : "text-gray-700 dark:text-gray-300"
                        }`}
                        onCommit={(v) => onRenameCommit(node.id, v)}
                        onCancel={() => onRenameCancel(node.id)}
                    />
                ) : (
                    <span
                        className={`flex-1 text-sm truncate ml-0.5 ${
                            isRoot
                                ? "text-gray-800 dark:text-gray-200"
                                : "text-gray-700 dark:text-gray-300"
                        }`}
                    >
                        {node.name}
                    </span>
                )}

                {loading && (
                    <svg className="flex-shrink-0 w-3.5 h-3.5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                )}

                {/* Hover actions */}
                {renamingId !== node.id && (
                    <div
                        className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <IconAction title="New Document" onClick={() => onCreate("document")}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="12" x2="12" y2="18" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                        </IconAction>
                        <IconAction title="New Folder" onClick={() => onCreate("folder")}>
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            <line x1="12" y1="11" x2="12" y2="17" />
                            <line x1="9" y1="14" x2="15" y2="14" />
                        </IconAction>
                        {!isRoot && (
                            <IconAction title="Delete" danger onClick={() => setConfirmDelete(true)}>
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </IconAction>
                        )}
                        {isRoot && onRemoveWorkspaceRoot && (
                            <IconAction
                                title="Remove root from sidebar (does not delete folder)"
                                danger
                                onClick={async () => {
                                    await onRemoveWorkspaceRoot(node.id);
                                    onRootsChanged?.();
                                }}
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </IconAction>
                        )}
                    </div>
                )}
            </div>

            {/* Inline delete confirm */}
            {confirmDelete && (
                <div
                    style={indent ? { paddingLeft: indent } : { paddingLeft: 12 }}
                    className="pr-2 py-1 bg-red-50 dark:bg-red-900/20 border-t border-b border-red-200 dark:border-red-800"
                >
                    <p className="text-xs text-red-700 dark:text-red-300 mb-1">
                        Delete "{node.name}" and all of its contents? This cannot be undone.
                    </p>
                    <div className="flex gap-1.5">
                        <button
                            onClick={handleDelete}
                            className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            Delete
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {expanded && children !== null && (
                <div>
                    {children.map((child) =>
                        child.kind === "folder" ? (
                            <FsFolderNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                onHeadingClick={onHeadingClick}
                                mcpAnimatingIds={mcpAnimatingIds}
                            />
                        ) : (
                            <FsDocumentRow
                                key={child.id}
                                doc={child}
                                depth={depth + 1}
                                onHeadingClick={onHeadingClick}
                                mcpAnimatingIds={mcpAnimatingIds}
                                renaming={renamingId === child.id}
                                onRenameStart={() => onRenameStart(child.id)}
                                onRenameCommit={(v) => onRenameCommit(child.id, v)}
                                onRenameCancel={() => onRenameCancel(child.id)}
                            />
                        ),
                    )}
                    {children.length === 0 && (
                        <div className="py-1 text-xs text-gray-400 dark:text-gray-600 italic" style={{ paddingLeft: (indent ?? 12) + 20 }}>
                            Empty
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Document row with TOC ─────────────────────────────────────────────────────

interface Heading {
    id: string;
    text: string;
    level: number;
}

function FsDocumentRow({
    doc,
    depth,
    onHeadingClick,
    mcpAnimatingIds,
    renaming,
    onRenameStart,
    onRenameCommit,
    onRenameCancel,
}: {
    doc: TreeNode;
    depth: number;
    onHeadingClick?: (docId: string, headingId: string) => void;
    mcpAnimatingIds?: Set<string>;
    renaming: boolean;
    onRenameStart: () => void;
    onRenameCommit: (newName: string) => void;
    onRenameCancel: () => void;
}) {
    const { dragState, refreshPath, selectedDocId, onDocumentSelect } = useTreeContext();
    const [tocExpanded, setTocExpanded] = useState(false);
    const [docHeadings, setDocHeadings] = useState<Heading[] | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const indent = 28 + depth * 16;
    const isSelected = selectedDocId === doc.id;

    const loadHeadings = async () => {
        if (docHeadings !== null) return;
        try {
            const entry = await api.getEntry(doc.id);
            if (entry && entry.content) {
                setDocHeadings(parseHeadings(entry.content));
            } else {
                setDocHeadings([]);
            }
        } catch {
            // ignore
        }
    };

    const handleToggleToc = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (tocExpanded) {
            setTocExpanded(false);
            return;
        }
        setTocExpanded(true);
        loadHeadings();
    };

    const handleDelete = async () => {
        setConfirmDelete(false);
        try {
            await api.deleteEntry(doc.id);
            if (selectedDocId === doc.id) onDocumentSelect(null);
            const parent = getParentPath(doc.id);
            if (parent) refreshPath(parent);
        } catch (err) {
            console.error("Delete failed:", err);
            alert(`Delete failed: ${err}`);
        }
    };

    return (
        <div>
            <div
                draggable={!renaming}
                onDragStart={(e) => {
                    dragState.current = doc.id;
                    e.dataTransfer.effectAllowed = "move";
                    try {
                        e.dataTransfer.setData("text/plain", doc.id);
                    } catch {
                        /* some environments disallow setData */
                    }
                }}
                onDragEnd={() => {
                    dragState.current = null;
                }}
                className={`group flex items-center gap-1.5 cursor-pointer select-none py-0.5 pr-1 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    isSelected ? "bg-blue-100 dark:bg-blue-900/30" : ""
                } ${mcpAnimatingIds?.has(doc.id) ? "mcp-animate-pulse" : ""}`}
                style={{ paddingLeft: indent }}
                onClick={() => {
                    api.getEntry(doc.id).then((entry) => {
                        if (entry) onDocumentSelect(entry);
                    });
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    onRenameStart();
                }}
            >
                {/* TOC toggle chevron */}
                <button
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                    onClick={handleToggleToc}
                    title="Toggle table of contents"
                >
                    <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className={`transition-transform duration-100 ${tocExpanded ? "" : "-rotate-90"}`}
                    >
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </button>

                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 flex-shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                </svg>

                {renaming ? (
                    <InlineRename
                        initialValue={doc.name}
                        className="flex-1 text-sm px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 outline-none"
                        onCommit={onRenameCommit}
                        onCancel={onRenameCancel}
                    />
                ) : (
                    <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-300">
                        {doc.name}
                    </span>
                )}

                {/* Hover actions */}
                {!renaming && (
                    <div
                        className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <IconAction title="Delete" danger onClick={() => setConfirmDelete(true)}>
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </IconAction>
                    </div>
                )}
            </div>

            {/* TOC section */}
            {tocExpanded && (
                <div style={{ marginLeft: indent + 16 }}>
                    {docHeadings === null ? (
                        <div className="py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                            Loading...
                        </div>
                    ) : docHeadings.length === 0 ? (
                        <div className="py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                            No headings
                        </div>
                    ) : (
                        docHeadings.map((h) => (
                            <div
                                key={h.id}
                                className="group flex items-center gap-1 py-0.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded"
                                style={{ paddingLeft: (h.level - 1) * 12 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onHeadingClick?.(doc.id, h.id);
                                }}
                            >
                                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">#</span>
                                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                    {h.text}
                                </span>
                                <span className="hidden group-hover:inline text-[10px] text-blue-400 flex-shrink-0 ml-auto">
                                    →
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Inline delete confirm */}
            {confirmDelete && (
                <div
                    style={{ paddingLeft: indent }}
                    className="pr-2 py-1 bg-red-50 dark:bg-red-900/20 border-t border-b border-red-200 dark:border-red-800"
                >
                    <p className="text-xs text-red-700 dark:text-red-300 mb-1">
                        Delete "{doc.name}"? This cannot be undone.
                    </p>
                    <div className="flex gap-1.5">
                        <button
                            onClick={handleDelete}
                            className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            Delete
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Inline rename input ───────────────────────────────────────────────────────

function InlineRename({
    initialValue,
    onCommit,
    onCancel,
    className,
}: {
    initialValue: string;
    onCommit: (value: string) => void;
    onCancel: () => void;
    className?: string;
}) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const committedRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => {
        if (committedRef.current) return;
        committedRef.current = true;
        onCommit(value.trim() || initialValue);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className={className}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    if (committedRef.current) return;
                    committedRef.current = true;
                    onCancel();
                }
            }}
            onBlur={commit}
        />
    );
}

// ── Hover icon button ─────────────────────────────────────────────────────────

function IconAction({
    title,
    onClick,
    danger,
    children,
}: {
    title: string;
    onClick: () => void;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            title={title}
            onClick={onClick}
            className={`p-0.5 rounded transition-colors ${
                danger
                    ? "text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-blue-500 dark:hover:text-blue-400"
            }`}
        >
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {children}
            </svg>
        </button>
    );
}

// ── Heading parser (deduplicating) ────────────────────────────────────────────

function parseHeadings(markdown: string): Heading[] {
    const counts = new Map<string, number>();
    const headings: Heading[] = [];
    for (const line of markdown.split("\n")) {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (!match) continue;
        const level = match[1].length;
        const text = match[2].trim();
        let id = slugify(text);
        const count = counts.get(id) ?? 0;
        counts.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        headings.push({ id, text, level });
    }
    return headings;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function getParentPath(path: string): string | null {
    const normalized = path.replace(/\\/g, "/");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return null;
    return normalized.slice(0, idx);
}
