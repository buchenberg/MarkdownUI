import { useState, useEffect, useRef } from "react";
import type { Collection, Document } from "../api";
import * as api from "../api";
import ConfirmModal from "./ConfirmModal";
import { slugify } from "../utils/slugify";

interface CollectionsBrowserProps {
    collections: Collection[];
    selectedDocument: Document | null;
    onDocumentSelect: (document: Document) => void;
    onDocumentCreate?: (
        collectionId: number,
        name: string,
        content: string,
    ) => Promise<Document>;
    onDocumentDelete: (documentId: number) => Promise<void>;
    onCollectionCreate: (name: string, description?: string) => Promise<Collection>;
    onCollectionDelete: (collectionId: number) => Promise<void>;
    onHeadingClick: (document: Document, headingId: string) => void;
}

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

export default function CollectionsBrowser({
    collections,
    selectedDocument,
    onDocumentSelect,
    onDocumentCreate,
    onDocumentDelete,
    onCollectionCreate,
    onCollectionDelete,
    onHeadingClick,
}: CollectionsBrowserProps) {
    const [expandedCollections, setExpandedCollections] = useState<Set<number>>(new Set());
    const [documentsByCollection, setDocumentsByCollection] = useState<Map<number, Document[]>>(new Map());
    const [loadingCollections, setLoadingCollections] = useState<Set<number>>(new Set());
    const [expandedDocuments, setExpandedDocuments] = useState<Set<number>>(new Set());
    const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [newCollectionDesc, setNewCollectionDesc] = useState("");
    const [deleteCollectionId, setDeleteCollectionId] = useState<number | null>(null);
    const [deleteDocumentId, setDeleteDocumentId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetCollectionIdRef = useRef<number | null>(null);
    const initializedRef = useRef(false);

    // ── Data fetching ────────────────────────────────────────────────────────

    const fetchDocumentsForCollection = async (collectionId: number) => {
        try {
            const docs = await api.getDocumentsByCollection(collectionId);
            setDocumentsByCollection((prev) => {
                const next = new Map(prev);
                next.set(collectionId, docs);
                return next;
            });
        } catch (error) {
            console.error("Failed to fetch documents:", error);
        }
    };

    // ── Expand / collapse ────────────────────────────────────────────────────

    const loadAndExpandCollection = async (collectionId: number) => {
        if (!documentsByCollection.has(collectionId)) {
            setLoadingCollections((prev) => new Set([...prev, collectionId]));
            await fetchDocumentsForCollection(collectionId);
            setLoadingCollections((prev) => {
                const next = new Set(prev);
                next.delete(collectionId);
                return next;
            });
        }
        setExpandedCollections((prev) => new Set([...prev, collectionId]));
    };

    const toggleCollection = (collectionId: number) => {
        if (expandedCollections.has(collectionId)) {
            setExpandedCollections((prev) => {
                const next = new Set(prev);
                next.delete(collectionId);
                return next;
            });
        } else {
            loadAndExpandCollection(collectionId);
        }
    };

    const toggleDocument = (documentId: number) => {
        setExpandedDocuments((prev) => {
            const next = new Set(prev);
            if (next.has(documentId)) {
                next.delete(documentId);
            } else {
                next.add(documentId);
            }
            return next;
        });
    };

    // ── Initialization: auto-expand on first load ────────────────────────────

    useEffect(() => {
        if (collections.length === 0 || initializedRef.current) return;
        initializedRef.current = true;
        const targetId = selectedDocument?.collection_id ?? collections[0].id;
        loadAndExpandCollection(targetId);
    }, [collections]);

    // ── Sync document updates (e.g. after save) ──────────────────────────────

    useEffect(() => {
        if (!selectedDocument) return;
        setDocumentsByCollection((prev) => {
            const collectionDocs = prev.get(selectedDocument.collection_id);
            if (!collectionDocs) return prev;
            const next = new Map(prev);
            next.set(
                selectedDocument.collection_id,
                collectionDocs.map((d) =>
                    d.id === selectedDocument.id ? selectedDocument : d,
                ),
            );
            return next;
        });
    }, [selectedDocument]);

    // ── Collection CRUD ──────────────────────────────────────────────────────

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            const newCollection = await onCollectionCreate(
                newCollectionName,
                newCollectionDesc || undefined,
            );
            setShowNewCollectionInput(false);
            setNewCollectionName("");
            setNewCollectionDesc("");
            setExpandedCollections((prev) => new Set([...prev, newCollection.id]));
            setDocumentsByCollection((prev) => {
                const next = new Map(prev);
                next.set(newCollection.id, []);
                return next;
            });
        } catch {
            alert("Failed to create collection");
        }
    };

    const handleDeleteCollection = async () => {
        if (deleteCollectionId === null) return;
        try {
            await onCollectionDelete(deleteCollectionId);
            setExpandedCollections((prev) => {
                const next = new Set(prev);
                next.delete(deleteCollectionId);
                return next;
            });
            setDocumentsByCollection((prev) => {
                const next = new Map(prev);
                next.delete(deleteCollectionId);
                return next;
            });
            setDeleteCollectionId(null);
        } catch {
            alert("Failed to delete collection");
        }
    };

    // ── Document CRUD ────────────────────────────────────────────────────────

    const handleCreateDocument = async (collectionId: number) => {
        if (!onDocumentCreate) return;
        const existingDocs = documentsByCollection.get(collectionId) ?? [];
        const name = `New Document ${existingDocs.length + 1}`;
        const content = `# New Document\n\nWrite your markdown content here.\n`;
        try {
            const newDocument = await onDocumentCreate(collectionId, name, content);
            await fetchDocumentsForCollection(collectionId);
            onDocumentSelect(newDocument);
        } catch {
            alert("Failed to create document");
        }
    };

    const handleDeleteDocument = async () => {
        if (deleteDocumentId === null) return;
        let ownerCollectionId: number | null = null;
        for (const [cid, docs] of documentsByCollection) {
            if (docs.some((d) => d.id === deleteDocumentId)) {
                ownerCollectionId = cid;
                break;
            }
        }
        try {
            await onDocumentDelete(deleteDocumentId);
            if (ownerCollectionId !== null) {
                await fetchDocumentsForCollection(ownerCollectionId);
            }
            setDeleteDocumentId(null);
        } catch {
            alert("Failed to delete document");
        }
    };

    // ── File upload ──────────────────────────────────────────────────────────

    const triggerUpload = (collectionId: number) => {
        uploadTargetCollectionIdRef.current = collectionId;
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const collectionId = uploadTargetCollectionIdRef.current;
        if (!e.target.files || !collectionId) return;
        const file = e.target.files[0];
        if (!file.name.match(/\.md$/i)) {
            alert("Please upload a .md file");
            return;
        }
        setIsUploading(true);
        try {
            const content = await file.text();
            const name = file.name.replace(/\.md$/i, "");
            const newDocument = await api.createDocument(collectionId, name, content);
            await fetchDocumentsForCollection(collectionId);
            onDocumentSelect(newDocument);
        } catch {
            alert("Failed to upload file");
        } finally {
            setIsUploading(false);
        }
    };

    // ── Derived helpers ──────────────────────────────────────────────────────

    const deletingDocumentName =
        deleteDocumentId !== null
            ? [...documentsByCollection.values()]
                  .flat()
                  .find((d) => d.id === deleteDocumentId)?.name ?? "this document"
            : "";

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Confirm modals */}
            <ConfirmModal
                isOpen={deleteCollectionId !== null}
                title="Delete Collection"
                message={`Are you sure you want to delete "${collections.find((c) => c.id === deleteCollectionId)?.name}"? This will also delete all documents in this collection. This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={handleDeleteCollection}
                onCancel={() => setDeleteCollectionId(null)}
            />
            <ConfirmModal
                isOpen={deleteDocumentId !== null}
                title="Delete Document"
                message={`Are you sure you want to delete "${deletingDocumentName}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={handleDeleteDocument}
                onCancel={() => setDeleteDocumentId(null)}
            />

            {/* Hidden file input for uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".md"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Collections
                </span>
                <button
                    onClick={() => setShowNewCollectionInput((v) => !v)}
                    title="New Collection"
                    className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                    {/* Folder + icon */}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                </button>
            </div>

            {/* Inline new-collection form */}
            {showNewCollectionInput && (
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col gap-1.5 flex-shrink-0">
                    <input
                        autoFocus
                        type="text"
                        placeholder="Collection name"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateCollection();
                            if (e.key === "Escape") {
                                setShowNewCollectionInput(false);
                                setNewCollectionName("");
                                setNewCollectionDesc("");
                            }
                        }}
                        className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newCollectionDesc}
                        onChange={(e) => setNewCollectionDesc(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateCollection();
                            if (e.key === "Escape") {
                                setShowNewCollectionInput(false);
                                setNewCollectionName("");
                                setNewCollectionDesc("");
                            }
                        }}
                        className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex gap-1.5">
                        <button
                            onClick={handleCreateCollection}
                            className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => {
                                setShowNewCollectionInput(false);
                                setNewCollectionName("");
                                setNewCollectionDesc("");
                            }}
                            className="flex-1 px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-1">
                {collections.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                        No collections yet
                    </div>
                )}

                {collections.map((collection) => {
                    const isExpanded = expandedCollections.has(collection.id);
                    const isLoading = loadingCollections.has(collection.id);
                    const docs = documentsByCollection.get(collection.id) ?? [];

                    return (
                        <div key={collection.id}>
                            {/* ── Collection row ── */}
                            <div
                                className="group flex items-center gap-0.5 px-1 py-0.5 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700"
                                onClick={() => toggleCollection(collection.id)}
                            >
                                {/* Chevron */}
                                <span
                                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 transition-transform duration-100 ${isExpanded ? "" : "-rotate-90"}`}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 10l5 5 5-5z" />
                                    </svg>
                                </span>

                                {/* Folder icon */}
                                <span className="flex-shrink-0 text-yellow-500 dark:text-yellow-400">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        {isExpanded ? (
                                            <path d="M20 6h-8l-2-2H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
                                        ) : (
                                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                                        )}
                                    </svg>
                                </span>

                                {/* Name */}
                                <span className="flex-1 text-sm truncate ml-0.5 text-gray-800 dark:text-gray-200">
                                    {collection.name}
                                </span>

                                {/* Loading spinner */}
                                {isLoading && (
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
                                {!isLoading && (
                                    <div
                                        className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {onDocumentCreate && (
                                            <button
                                                title="New Document"
                                                onClick={() => handleCreateDocument(collection.id)}
                                                className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                            >
                                                {/* File + icon */}
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                    <line x1="12" y1="18" x2="12" y2="12" />
                                                    <line x1="9" y1="15" x2="15" y2="15" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            title={isUploading ? "Uploading…" : "Upload Markdown"}
                                            onClick={() => !isUploading && triggerUpload(collection.id)}
                                            disabled={isUploading}
                                            className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
                                        >
                                            {/* Upload icon */}
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="16 16 12 12 8 16" />
                                                <line x1="12" y1="12" x2="12" y2="21" />
                                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                            </svg>
                                        </button>
                                        <button
                                            title="Delete Collection"
                                            onClick={() => setDeleteCollectionId(collection.id)}
                                            className="p-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            {/* Trash icon */}
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

                            {/* ── Documents ── */}
                            {isExpanded && (
                                <div>
                                    {docs.length === 0 && !isLoading && (
                                        <div className="pl-9 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
                                            No documents
                                        </div>
                                    )}

                                    {docs.map((doc) => {
                                        const isDocExpanded = expandedDocuments.has(doc.id);
                                        const isSelected = selectedDocument?.id === doc.id;
                                        const headings = isDocExpanded ? parseHeadings(doc.content) : [];

                                        return (
                                            <div key={doc.id}>
                                                {/* ── Document row ── */}
                                                <div
                                                    className={`group flex items-center gap-0.5 pl-5 pr-1 py-0.5 select-none ${
                                                        isSelected
                                                            ? "bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                                                            : "hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    }`}
                                                >
                                                    {/* Chevron (toggles TOC) */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleDocument(doc.id);
                                                        }}
                                                        className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform duration-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ${isDocExpanded ? "" : "-rotate-90"}`}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M7 10l5 5 5-5z" />
                                                        </svg>
                                                    </button>

                                                    {/* File icon + name */}
                                                    <div
                                                        className="flex-1 flex items-center gap-1 min-w-0 cursor-pointer"
                                                        onClick={() => onDocumentSelect(doc)}
                                                    >
                                                        <span className={`flex-shrink-0 ${isSelected ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}>
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                                <polyline points="14 2 14 8 20 8" />
                                                            </svg>
                                                        </span>
                                                        <span className={`text-sm truncate ${
                                                            isSelected
                                                                ? "text-blue-700 dark:text-blue-300 font-medium"
                                                                : "text-gray-700 dark:text-gray-300"
                                                        }`}>
                                                            {doc.name}
                                                        </span>
                                                    </div>

                                                    {/* Hover: delete */}
                                                    <div
                                                        className="hidden group-hover:flex items-center flex-shrink-0"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            title="Delete Document"
                                                            onClick={() => setDeleteDocumentId(doc.id)}
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

                                                {/* ── Heading TOC ── */}
                                                {isDocExpanded && headings.length > 0 && (
                                                    <div>
                                                        {headings.map((heading, i) => (
                                                            <div
                                                                key={i}
                                                                style={{ paddingLeft: `${28 + (heading.level - 1) * 10}px` }}
                                                                className="flex items-center py-0.5 pr-2 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700"
                                                                onClick={() => onHeadingClick(doc, heading.id)}
                                                            >
                                                                <span className={`text-xs truncate ${
                                                                    heading.level === 1
                                                                        ? "text-gray-600 dark:text-gray-300"
                                                                        : "text-gray-500 dark:text-gray-400"
                                                                }`}>
                                                                    {heading.text}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
