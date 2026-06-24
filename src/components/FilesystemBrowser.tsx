import { useState } from "react";
import type { TreeNode } from "../api";
import * as api from "../api";

interface FilesystemBrowserProps {
    roots: TreeNode[];
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode) => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
    onRootsChanged?: () => void;
}

export default function FilesystemBrowser({
    roots,
    selectedDocId,
    onDocumentSelect,
    onHeadingClick,
}: FilesystemBrowserProps) {
    return (
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
                        selectedDocId={selectedDocId}
                        onDocumentSelect={onDocumentSelect}
                        onHeadingClick={onHeadingClick}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Root node ─────────────────────────────────────────────────────────────────

function FsRootNode({
    root,
    selectedDocId,
    onDocumentSelect,
    onHeadingClick,
}: {
    root: TreeNode;
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode) => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<TreeNode[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (children === null) {
            setLoading(true);
            try {
                const items = await api.listChildren(root.id);
                setChildren(items);
            } catch (err) {
                console.error("Failed to list children:", err);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div>
            <div
                className="group flex items-center gap-0.5 pl-3 pr-1 py-0.5 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={handleToggle}
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
                <span className="flex-1 text-sm truncate ml-0.5 text-gray-800 dark:text-gray-200">
                    {root.name}
                </span>
                {loading && (
                    <svg className="flex-shrink-0 w-3.5 h-3.5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                )}
            </div>

            {expanded && children !== null && (
                <div>
                    {children.map((child) =>
                        child.kind === "folder" ? (
                            <FsFolderNode
                                key={child.id}
                                node={child}
                                depth={1}
                                selectedDocId={selectedDocId}
                                onDocumentSelect={onDocumentSelect}
                                onHeadingClick={onHeadingClick}
                            />
                        ) : (
                            <FsDocumentRow
                                key={child.id}
                                doc={child}
                                depth={1}
                                selectedDocId={selectedDocId}
                                onDocumentSelect={onDocumentSelect}
                                onHeadingClick={onHeadingClick}
                            />
                        ),
                    )}
                    {children.length === 0 && (
                        <div className="pl-9 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
                            Empty
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Folder node ───────────────────────────────────────────────────────────────

function FsFolderNode({
    node,
    depth,
    selectedDocId,
    onDocumentSelect,
    onHeadingClick,
}: {
    node: TreeNode;
    depth: number;
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode) => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [children, setChildren] = useState<TreeNode[] | null>(null);
    const [loading, setLoading] = useState(false);
    const indent = 28 + depth * 16;

    const handleToggle = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        setExpanded(true);
        if (children === null) {
            setLoading(true);
            try {
                const items = await api.listChildren(node.id);
                setChildren(items);
            } catch (err) {
                console.error("Failed to list children:", err);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div>
            <div
                className="group flex items-center gap-0.5 cursor-pointer select-none py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                style={{ paddingLeft: indent }}
                onClick={handleToggle}
            >
                <span
                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 transition-transform duration-100 ${expanded ? "" : "-rotate-90"}`}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </span>
                <span className="flex-shrink-0 text-yellow-500 dark:text-yellow-400">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        {expanded ? (
                            <path d="M20 6h-8l-2-2H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
                        ) : (
                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                        )}
                    </svg>
                </span>
                <span className="flex-1 text-sm truncate ml-0.5 text-gray-700 dark:text-gray-300">
                    {node.name}
                </span>
                {loading && (
                    <svg className="flex-shrink-0 w-3 h-3 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                )}
            </div>

            {expanded && children !== null && (
                <div>
                    {children.map((child) =>
                        child.kind === "folder" ? (
                            <FsFolderNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                selectedDocId={selectedDocId}
                                onDocumentSelect={onDocumentSelect}
                                onHeadingClick={onHeadingClick}
                            />
                        ) : (
                            <FsDocumentRow
                                key={child.id}
                                doc={child}
                                depth={depth + 1}
                                selectedDocId={selectedDocId}
                                onDocumentSelect={onDocumentSelect}
                                onHeadingClick={onHeadingClick}
                            />
                        ),
                    )}
                    {children.length === 0 && (
                        <div className="py-1 text-xs text-gray-400 dark:text-gray-600 italic" style={{ paddingLeft: indent + 20 }}>
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
    selectedDocId,
    onDocumentSelect,
    onHeadingClick,
}: {
    doc: TreeNode;
    depth: number;
    selectedDocId: string | null;
    onDocumentSelect: (doc: TreeNode) => void;
    onHeadingClick?: (docId: string, headingId: string) => void;
}) {
    const [tocExpanded, setTocExpanded] = useState(false);
    const [docHeadings, setDocHeadings] = useState<Heading[] | null>(null);
    const indent = 28 + depth * 16;
    const isSelected = selectedDocId === doc.id;

    const loadHeadings = async () => {
        if (docHeadings !== null) return;
        try {
            const entry = await api.getEntry(doc.id);
            if (entry && entry.content) {
                const headings = parseHeadings(entry.content);
                setDocHeadings(headings);
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

    return (
        <div>
            <div
                className={`group flex items-center gap-1.5 cursor-pointer select-none py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    isSelected ? "bg-blue-100 dark:bg-blue-900/30" : ""
                }`}
                style={{ paddingLeft: indent }}
                onClick={() => {
                    api.getEntry(doc.id).then((entry) => {
                        if (entry) onDocumentSelect(entry);
                    });
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
                <span className="text-sm truncate text-gray-700 dark:text-gray-300">
                    {doc.name}
                </span>
            </div>

            {/* TOC section */}
            {tocExpanded && (
                <div className="pl-2" style={{ marginLeft: indent + 16 }}>
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
                                    if (onHeadingClick) {
                                        onHeadingClick(doc.id, h.id);
                                    }
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
        </div>
    );
}

// ── Heading parser ────────────────────────────────────────────────────────────

function parseHeadings(markdown: string): Heading[] {
    const headings: Heading[] = [];
    const lines = markdown.split("\n");
    for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            const level = match[1].length;
            const text = match[2].trim();
            const id = slugify(text);
            headings.push({ id, text, level });
        }
    }
    return headings;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}
