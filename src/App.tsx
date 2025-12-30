import { useState, useEffect } from "react";
import CollectionsBrowser from "./components/CollectionsBrowser";
import DocumentEditor from "./components/DocumentEditor";
import ThemeToggle from "./components/ThemeToggle";
import { useTheme } from "./ThemeContext";
import * as api from "./api";
import type { Collection, Document } from "./api";

// Re-export types for components that import from App.tsx
export type { Collection, Document };

function App() {
    const [selectedCollection, setSelectedCollection] =
        useState<Collection | null>(null);
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const { theme } = useTheme();

    useEffect(() => {
        fetchCollections();
    }, []);

    const fetchCollections = async () => {
        try {
            const data = await api.getCollections();
            setCollections(data);
            if (data.length > 0 && !selectedCollection) {
                setSelectedCollection(data[0]);
            }
        } catch (error) {
            console.error("Failed to fetch collections:", error);
        }
    };

    const handleCollectionSelect = (collection: Collection) => {
        setSelectedCollection(collection);
        setSelectedDocument(null);
    };

    const handleDocumentSelect = (document: Document) => {
        setSelectedDocument(document);
    };

    const handleDocumentCreate = async (
        collectionId: number,
        name: string,
        content: string,
    ) => {
        try {
            const newDocument = await api.createDocument(collectionId, name, content);
            setSelectedDocument(newDocument);
            return newDocument;
        } catch (error) {
            console.error("Failed to create document:", error);
            throw error;
        }
    };

    const handleDocumentUpdate = async (
        documentId: number,
        name: string,
        content: string,
    ) => {
        try {
            const updatedDocument = await api.updateDocument(documentId, name, content);
            setSelectedDocument(updatedDocument);
            return updatedDocument;
        } catch (error) {
            console.error("Failed to update document:", error);
            throw error;
        }
    };

    const handleCollectionCreate = async (name: string, description?: string) => {
        try {
            const newCollection = await api.createCollection(name, description);
            setCollections([...collections, newCollection]);
            setSelectedCollection(newCollection);
            return newCollection;
        } catch (error) {
            console.error("Failed to create collection:", error);
            throw error;
        }
    };

    const handleCollectionDelete = async (collectionId: number) => {
        try {
            const success = await api.deleteCollection(collectionId);
            if (success) {
                const updatedCollections = collections.filter(
                    (c) => c.id !== collectionId,
                );
                setCollections(updatedCollections);
                if (selectedCollection?.id === collectionId) {
                    setSelectedCollection(
                        updatedCollections.length > 0 ? updatedCollections[0] : null,
                    );
                    setSelectedDocument(null);
                }
            } else {
                alert("Failed to delete collection");
            }
        } catch (error) {
            console.error("Failed to delete collection:", error);
            alert("Failed to delete collection");
        }
    };

    const handleDocumentDelete = async (documentId: number) => {
        try {
            const success = await api.deleteDocument(documentId);
            if (success) {
                if (selectedDocument?.id === documentId) {
                    setSelectedDocument(null);
                }
            } else {
                alert("Failed to delete document");
            }
        } catch (error) {
            console.error("Failed to delete document:", error);
            alert("Failed to delete document");
        }
    };

    return (
        <div className={`flex h-screen overflow-hidden ${theme === 'dark' ? 'dark' : ''}`}>
            <div
                className={`flex flex-col bg-gray-100 dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 transition-all duration-300 ${sidebarCollapsed ? "w-12" : "w-80"}`}
            >
                <div className="flex items-center justify-between border-b border-gray-300 dark:border-gray-700">
                    <button
                        className="w-12 h-12 border-none bg-gray-100 dark:bg-gray-800 cursor-pointer text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0 transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {sidebarCollapsed ? (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        ) : (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        )}
                    </button>
                    {!sidebarCollapsed && <ThemeToggle />}
                </div>
                <div className={sidebarCollapsed ? "hidden" : "flex-1 overflow-hidden"}>
                    <CollectionsBrowser
                        collections={collections}
                        selectedCollection={selectedCollection}
                        onCollectionSelect={handleCollectionSelect}
                        onCollectionCreate={handleCollectionCreate}
                        onCollectionDelete={handleCollectionDelete}
                        selectedDocument={selectedDocument}
                        onDocumentSelect={handleDocumentSelect}
                        onDocumentCreate={handleDocumentCreate}
                        onDocumentDelete={handleDocumentDelete}
                    />
                </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white dark:bg-gray-900">
                {selectedDocument ? (
                    <DocumentEditor
                        document={selectedDocument}
                        onUpdate={handleDocumentUpdate}
                        onSave={handleDocumentUpdate}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600 dark:text-gray-400">
                        <h1 className="mb-4 text-gray-800 dark:text-gray-200">Welcome to MarkdownUI</h1>
                        <p>
                            Select a collection from the sidebar to view documents, or create a
                            new document.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
