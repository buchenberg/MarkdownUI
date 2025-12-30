import { useState, useEffect } from "react";
import { Collection, Document } from "../App";
import * as api from "../api";
import ConfirmModal from "./ConfirmModal";

interface CollectionsBrowserProps {
    collections: Collection[];
    selectedCollection: Collection | null;
    onCollectionSelect: (collection: Collection) => void;
    onCollectionCreate: (
        name: string,
        description?: string,
    ) => Promise<Collection>;
    onCollectionDelete: (collectionId: number) => Promise<void>;
    selectedDocument: Document | null;
    onDocumentSelect: (document: Document) => void;
    onDocumentCreate?: (
        collectionId: number,
        name: string,
        content: string,
    ) => Promise<Document>;
    onDocumentDelete: (documentId: number) => Promise<void>;
}

export default function CollectionsBrowser({
    collections,
    selectedCollection,
    onCollectionSelect,
    onCollectionCreate,
    onCollectionDelete,
    selectedDocument,
    onDocumentSelect,
    onDocumentCreate,
    onDocumentDelete,
}: CollectionsBrowserProps) {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [newCollectionDesc, setNewCollectionDesc] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [deleteCollectionId, setDeleteCollectionId] = useState<number | null>(
        null,
    );
    const [deleteDocumentId, setDeleteDocumentId] = useState<number | null>(null);

    useEffect(() => {
        if (selectedCollection) {
            fetchDocuments(selectedCollection.id);
        }
    }, [selectedCollection]);

    // Update document in list when selectedDocument changes (e.g., after save)
    useEffect(() => {
        if (selectedDocument) {
            setDocuments((prevDocuments) =>
                prevDocuments.map((document) =>
                    document.id === selectedDocument.id ? selectedDocument : document,
                ),
            );
        }
    }, [selectedDocument]);

    const fetchDocuments = async (collectionId: number) => {
        try {
            const data = await api.getDocumentsByCollection(collectionId);
            setDocuments(data);
        } catch (error) {
            console.error("Failed to fetch documents:", error);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !selectedCollection) return;

        const file = e.target.files[0];
        if (!file.name.match(/\.md$/i)) {
            alert("Please upload a .md file");
            return;
        }

        setIsUploading(true);
        try {
            const content = await file.text();
            const name = file.name.replace(/\.md$/i, "");

            const newDocument = await api.createDocument(
                selectedCollection.id,
                name,
                content,
            );
            await fetchDocuments(selectedCollection.id);
            onDocumentSelect(newDocument);
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload file");
        } finally {
            setIsUploading(false);
            e.target.value = "";
        }
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await onCollectionCreate(newCollectionName, newCollectionDesc);
            setShowNewCollection(false);
            setNewCollectionName("");
            setNewCollectionDesc("");
        } catch (error) {
            alert("Failed to create collection");
        }
    };

    const handleCreateDocument = async () => {
        if (!selectedCollection || !onDocumentCreate) return;
        const name = `New Document ${documents.length + 1}`;
        const content = `# New Document

Write your markdown content here.

## Features

- Supports **bold** and *italic* text
- Lists and numbered lists
- Code blocks with syntax highlighting
- Tables and more

## Mermaid Diagrams

You can embed Mermaid diagrams:

\`\`\`mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`
`;
        try {
            const newDocument = await onDocumentCreate(
                selectedCollection.id,
                name,
                content,
            );
            await fetchDocuments(selectedCollection.id);
            onDocumentSelect(newDocument);
        } catch (error) {
            alert("Failed to create document");
        }
    };

    const handleDeleteCollection = async () => {
        if (deleteCollectionId === null) return;
        try {
            await onCollectionDelete(deleteCollectionId);
            setDeleteCollectionId(null);
        } catch (error) {
            alert("Failed to delete collection");
        }
    };

    const handleDeleteDocument = async () => {
        if (deleteDocumentId === null || !selectedCollection) return;
        try {
            await onDocumentDelete(deleteDocumentId);
            await fetchDocuments(selectedCollection.id);
            setDeleteDocumentId(null);
        } catch (error) {
            alert("Failed to delete document");
        }
    };

    return (
        <div className="flex flex-col h-full">
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
                message={`Are you sure you want to delete "${documents.find((d) => d.id === deleteDocumentId)?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={handleDeleteDocument}
                onCancel={() => setDeleteDocumentId(null)}
            />
            <div className="flex justify-between items-center p-4 border-b border-gray-300">
                <h2 className="text-lg font-semibold text-gray-800">Collections</h2>
                <button
                    className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-lg font-bold hover:bg-blue-600 transition-colors"
                    onClick={() => setShowNewCollection(!showNewCollection)}
                >
                    +
                </button>
            </div>

            {showNewCollection && (
                <div className="p-4 border-b border-gray-300 bg-white">
                    <input
                        type="text"
                        placeholder="Collection name"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded mb-2"
                    />
                    <textarea
                        placeholder="Description (optional)"
                        value={newCollectionDesc}
                        onChange={(e) => setNewCollectionDesc(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded mb-2 resize-none"
                        rows={3}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleCreateCollection}
                            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => setShowNewCollection(false)}
                            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {collections.map((collection) => (
                    <div
                        key={collection.id}
                        className={`flex items-center justify-between p-3 border-b border-gray-200 cursor-pointer transition-colors ${selectedCollection?.id === collection.id
                                ? "bg-blue-50 border-blue-200"
                                : "hover:bg-gray-50"
                            }`}
                    >
                        <div
                            className="flex-1 min-w-0"
                            onClick={() => onCollectionSelect(collection)}
                        >
                            <div className="font-medium text-gray-900 truncate">
                                {collection.name}
                            </div>
                            {collection.description && (
                                <div className="text-sm text-gray-600 truncate mt-1">
                                    {collection.description}
                                </div>
                            )}
                        </div>
                        <button
                            className="w-6 h-6 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center ml-2"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteCollectionId(collection.id);
                            }}
                            title="Delete collection"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            {selectedCollection && (
                <div className="border-t border-gray-300">
                    <div className="flex justify-between items-center p-4 border-b border-gray-300">
                        <h3 className="font-medium text-gray-800">Documents</h3>
                        <div className="flex gap-2">
                            {onDocumentCreate && (
                                <button
                                    className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-colors"
                                    onClick={handleCreateDocument}
                                >
                                    New
                                </button>
                            )}
                            <label
                                className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${isUploading
                                        ? "bg-gray-400 text-white cursor-not-allowed"
                                        : "bg-blue-500 text-white hover:bg-blue-600"
                                    }`}
                            >
                                {isUploading ? "Uploading..." : "Upload"}
                                <input
                                    type="file"
                                    accept=".md"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    disabled={isUploading}
                                />
                            </label>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {documents.map((document) => (
                            <div
                                key={document.id}
                                className={`flex items-center justify-between p-3 border-b border-gray-200 cursor-pointer transition-colors ${selectedDocument?.id === document.id
                                        ? "bg-blue-50 border-blue-200"
                                        : "hover:bg-gray-50"
                                    }`}
                            >
                                <div
                                    className="flex-1 truncate"
                                    onClick={() => onDocumentSelect(document)}
                                >
                                    {document.name}
                                </div>
                                <button
                                    className="w-6 h-6 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center ml-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteDocumentId(document.id);
                                    }}
                                    title="Delete document"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {documents.length === 0 && (
                            <div className="p-4 text-center text-gray-500">
                                No documents in this collection
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
