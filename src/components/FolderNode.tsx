import { useState, useEffect } from "react";
import type { Folder, Document } from "../api";
import * as api from "../api";
import { slugify } from "../utils/slugify";

interface Heading {
    text: string;
    level: number;
    id: string;
}

function parseHeadings(content: string): Heading[] {
    const counts = new Map<string, number>();
    return content.split("\n").reduce<Heading[]>((acc, line) => {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            const text = match[2].trim();
            let id = slugify(text);
            const count = counts.get(id) ?? 0;
            counts.set(id, count + 1);
            if (count > 0) id = `${id}-${count}`;
            acc.push({ level: match[1].length, text, id });
        }
        return acc;
    }, []);
}

interface FolderNodeProps {
    folder: Folder;
    allFolders: Folder[];
    depth: number;
    selectedDocument: Document | null;
    onDocumentSelect: (doc: Document) => void;
    onHeadingClick: (doc: Document, headingId: string) => void;
    onDocumentDelete: (id: number) => Promise<void>;
    onFolderDelete: (id: number) => Promise<void>;
    onFolderCreate: (collectionId: number, parentFolderId: number | null, name: string) => Promise<Folder>;
    onDocumentCreate: (collectionId: number, folderId: number | null) => Promise<void>;
    onRefresh: () => void;
    mcpAnimatingIds?: Set<number>;
}

export default function FolderNode({
    folder,
    allFolders,
    depth,
    selectedDocument,
    onDocumentSelect,
    onHeadingClick,
    onDocumentDelete,
    onFolderDelete,
    onFolderCreate,
    onDocumentCreate,
    onRefresh,
    mcpAnimatingIds,
}: FolderNodeProps) {
    const [expanded, setExpanded] = useState(false);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
    const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

    const childFolders = allFolders.filter((f) => f.parent_folder_id === folder.id);

    const loadChildren = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const docs = await api.getDocumentsByFolder(folder.id);
            setDocuments(docs);
        } catch (e) {
            console.error("Failed to fetch folder documents", e);
        } finally {
            setLoading(false);
        }
    };

    // Sync selected document into local state (e.g. after rename + save)
    useEffect(() => {
        if (!selectedDocument || selectedDocument.folder_id !== folder.id) return;
        setDocuments((prev) =>
            prev.map((d) => (d.id === selectedDocument.id ? selectedDocument : d)),
        );
    }, [selectedDocument, folder.id]);

    const toggle = async () => {
        if (!expanded && documents.length === 0 && childFolders.length === 0) {
            await loadChildren();
        }
        setExpanded((prev) => !prev);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onFolderCreate(folder.collection_id, folder.id, newFolderName.trim());
            setNewFolderName("");
            setShowNewFolderInput(false);
            onRefresh();
        } catch {
            alert("Failed to create folder");
        }
    };

    const handleDeleteFolder = async () => {
        setShowDeleteConfirm(false);
        try {
            await onFolderDelete(folder.id);
            onRefresh();
        } catch {
            alert("Failed to delete folder");
        }
    };

    const handleDeleteDocument = async () => {
        if (deleteDocId === null) return;
        try {
            await onDocumentDelete(deleteDocId);
            setDocuments((prev) => prev.filter((d) => d.id !== deleteDocId));
            setDeleteDocId(null);
        } catch {
            alert("Failed to delete document");
        }
    };

    return (
        <div>
            {/* ── Folder row ── */}
            <div
                className={`group flex items-center gap-0.5 py-0.5 pr-1 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    mcpAnimatingIds?.has(folder.id) ? "mcp-animate-pulse" : ""
                }`}
                style={{ paddingLeft: `${28 + depth * 16}px` }}
                onClick={toggle}
            >
                {/* Chevron */}
                <span
                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 transition-transform duration-100 ${
                        expanded ? "" : "-rotate-90"
                    }`}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </span>

                {/* Folder icon */}
                <span className="flex-shrink-0 text-yellow-500 dark:text-yellow-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        {expanded ? (
                            <path d="M20 6h-8l-2-2H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
                        ) : (
                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                        )}
                    </svg>
                </span>

                {/* Name */}
                <span className="flex-1 text-sm truncate ml-0.5 text-gray-800 dark:text-gray-200">
                    {folder.name}
                </span>

                {/* Loading spinner */}
                {loading && (
                    <svg
                        className="flex-shrink-0 w-3.5 h-3.5 animate-spin text-gray-400 dark:text-gray-500 mr-1"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                )}

                {/* Hover action buttons */}
                {!loading && (
                    <div
                        className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            title="New Document"
                            onClick={async () => {
                                await onDocumentCreate(folder.collection_id, folder.id);
                                await loadChildren();
                            }}
                            className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="12" y1="18" x2="12" y2="12" />
                                <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                        </button>
                        <button
                            title="New Folder"
                            onClick={() => setShowNewFolderInput((v) => !v)}
                            className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                <line x1="12" y1="11" x2="12" y2="17" />
                                <line x1="9" y1="14" x2="15" y2="14" />
                            </svg>
                        </button>
                        <button
                            title="Delete Folder"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
                <div
                    style={{ paddingLeft: `${40 + depth * 16}px` }}
                    className="px-2 py-1.5 bg-red-50 dark:bg-red-900/20 border-t border-b border-red-200 dark:border-red-800"
                >
                    <p className="text-xs text-red-700 dark:text-red-300 mb-1.5">
                        Delete "{folder.name}" and all its contents?
                    </p>
                    <div className="flex gap-1.5">
                        <button
                            onClick={handleDeleteFolder}
                            className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                            Delete
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* New folder inline form */}
            {showNewFolderInput && (
                <div
                    style={{ paddingLeft: `${40 + depth * 16}px` }}
                    className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-b border-gray-200 dark:border-gray-700"
                >
                    <div className="flex gap-1.5">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Folder name"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateFolder();
                                if (e.key === "Escape") {
                                    setShowNewFolderInput(false);
                                    setNewFolderName("");
                                }
                            }}
                            className="flex-1 px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                        <button
                            onClick={handleCreateFolder}
                            className="px-2 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => {
                                setShowNewFolderInput(false);
                                setNewFolderName("");
                            }}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Children ── */}
            {expanded && (
                <div>
                    {/* Child folders (recursive) */}
                    {childFolders.map((childFolder) => (
                        <FolderNode
                            key={childFolder.id}
                            folder={childFolder}
                            allFolders={allFolders}
                            depth={depth + 1}
                            selectedDocument={selectedDocument}
                            onDocumentSelect={onDocumentSelect}
                            onHeadingClick={onHeadingClick}
                            onDocumentDelete={onDocumentDelete}
                            onFolderDelete={onFolderDelete}
                            onFolderCreate={onFolderCreate}
                            onDocumentCreate={onDocumentCreate}
                            onRefresh={onRefresh}
                            mcpAnimatingIds={mcpAnimatingIds}
                        />
                    ))}

                    {/* Documents in this folder */}
                    {documents.map((doc) => {
                        const isSelected = selectedDocument?.id === doc.id;
                        const isDocExpanded = expandedDocs.has(doc.id);
                        const headings = isDocExpanded ? parseHeadings(doc.content) : [];
                        return (
                            <div key={doc.id}>
                                <div
                                    className={`group flex items-center gap-0.5 py-0.5 pr-1 cursor-pointer select-none ${
                                        isSelected
                                            ? "bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                                            : "hover:bg-gray-200 dark:hover:bg-gray-700"
                                    } ${
                                        mcpAnimatingIds?.has(doc.id) ? "mcp-animate-pulse" : ""
                                    }`}
                                    style={{ paddingLeft: `${44 + depth * 16}px` }}
                                >
                                    {/* Chevron (toggles heading TOC) */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedDocs((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(doc.id)) next.delete(doc.id);
                                                else next.add(doc.id);
                                                return next;
                                            });
                                        }}
                                        className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform duration-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ${
                                            isDocExpanded ? "" : "-rotate-90"
                                        }`}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M7 10l5 5 5-5z" />
                                        </svg>
                                    </button>

                                    {/* File icon */}
                                    <span
                                        className={`flex-shrink-0 ${
                                            isSelected
                                                ? "text-blue-500 dark:text-blue-400"
                                                : "text-gray-400 dark:text-gray-500"
                                        }`}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                            <polyline points="14 2 14 8 20 8" />
                                        </svg>
                                    </span>

                                    {/* Name */}
                                    <div
                                        className="flex-1 flex items-center min-w-0 cursor-pointer"
                                        onClick={() => onDocumentSelect(doc)}
                                    >
                                        <span
                                            className={`text-sm truncate ml-0.5 ${
                                                isSelected
                                                    ? "text-blue-700 dark:text-blue-300 font-medium"
                                                    : "text-gray-700 dark:text-gray-300"
                                            }`}
                                        >
                                            {doc.name}
                                        </span>
                                    </div>

                                    {/* Hover: delete */}
                                    <div
                                        className="hidden group-hover:flex items-center flex-shrink-0 ml-auto"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            title="Delete Document"
                                            onClick={() => setDeleteDocId(doc.id)}
                                            className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                <path d="M10 11v6M14 11v6" />
                                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Heading TOC */}
                                {isDocExpanded && headings.length > 0 && (
                                    <div>
                                        {headings.map((heading, i) => (
                                            <div
                                                key={i}
                                                style={{ paddingLeft: `${60 + depth * 16 + (heading.level - 1) * 10}px` }}
                                                className="flex items-center py-0.5 pr-2 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => onHeadingClick(doc, heading.id)}
                                            >
                                                <span
                                                    className={`text-xs truncate ${
                                                        heading.level === 1
                                                            ? "text-gray-600 dark:text-gray-300"
                                                            : "text-gray-500 dark:text-gray-400"
                                                    }`}
                                                >
                                                    {heading.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Delete doc confirmation */}
                                {deleteDocId === doc.id && (
                                    <div
                                        style={{ paddingLeft: `${56 + depth * 16}px` }}
                                        className="px-2 py-1 bg-red-50 dark:bg-red-900/20 border-t border-b border-red-200 dark:border-red-800"
                                    >
                                        <p className="text-xs text-red-700 dark:text-red-300 mb-1">
                                            Delete "{doc.name}"?
                                        </p>
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={handleDeleteDocument}
                                                className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={() => setDeleteDocId(null)}
                                                className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Empty state */}
                    {documents.length === 0 && childFolders.length === 0 && !loading && (
                        <div
                            style={{ paddingLeft: `${44 + depth * 16}px` }}
                            className="py-1 text-xs text-gray-400 dark:text-gray-600 italic"
                        >
                            Empty folder
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
