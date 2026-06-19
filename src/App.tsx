import { useState, useEffect, useRef } from "react";
import CollectionsBrowser from "./components/CollectionsBrowser";
import DocumentEditor from "./components/DocumentEditor";
import ThemeToggle from "./components/ThemeToggle";
import ZoomControls from "./components/ZoomControls";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useTheme } from "./ThemeContext";
import { useSettings } from "./contexts/SettingsContext";
import { useMcpEvents } from "./hooks/useMcpEvents";
import * as api from "./api";
import type { Collection, Document, ExportFormat } from "./api";

// Re-export types for components that import from App.tsx
export type { Collection, Document };

function AppContent() {
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [scrollToHeadingId, setScrollToHeadingId] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(320); // Initial width in pixels
    const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { theme, toggleTheme } = useTheme();
    const { settingsOpen, openSettings, closeSettings } = useSettings();

    // Document editor state lifted to App level for unified header
    const [documentName, setDocumentName] = useState("");
    const [documentContent, setDocumentContent] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [hasNameChanges, setHasNameChanges] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
        const saved = localStorage.getItem("markdown-ui-auto-save");
        return saved ? saved === "true" : false;
    });

    // MCP server state
    const [mcpRunning, setMcpRunning] = useState(false);
    const [mcpPending, setMcpPending] = useState(false);

    // MCP live update animations
    const [mcpFlash, setMcpFlash] = useState(false);
    const { animatingIds, lastEvents } = useMcpEvents(mcpRunning);

    // When an MCP event touches the currently open document, refresh it
    useEffect(() => {
        if (!selectedDocument || !mcpRunning) return;
        if (!animatingIds.has(selectedDocument.id)) return;

        api.getDocument(selectedDocument.id).then((doc) => {
            if (!doc) return;
            setDocumentContent(doc.content);
            setDocumentName(doc.name);
            setHasChanges(false);
            setHasNameChanges(false);
            setMcpFlash(true);
            setTimeout(() => setMcpFlash(false), 2200);
        });
    }, [animatingIds, selectedDocument?.id, mcpRunning]);

    useEffect(() => {
        // Check initial MCP server status on mount
        api.getMcpServerStatus().then(setMcpRunning).catch(() => {});
    }, []);

    useEffect(() => {
        fetchCollections();
    }, []);

    // Sync document state when selected document changes
    useEffect(() => {
        if (selectedDocument) {
            setDocumentName(selectedDocument.name);
            setDocumentContent(selectedDocument.content);
            setHasChanges(false);
            setHasNameChanges(false);
        }
    }, [selectedDocument]);

    // Sidebar resize handling
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingSidebar || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;

            // Snap to collapse if dragged too far left (Threshold 240px)
            if (newWidth < 240) {
                setSidebarCollapsed(true);
                setIsDraggingSidebar(false);
                return;
            }

            // Constrain width to ensure content remains visible (min 300px)
            setSidebarWidth(Math.max(300, Math.min(500, newWidth)));
        };

        const handleMouseUp = () => {
            setIsDraggingSidebar(false);
        };

        if (isDraggingSidebar) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDraggingSidebar]);

    const fetchCollections = async () => {
        try {
            const data = await api.getCollections();
            setCollections(data);
        } catch (error) {
            console.error("Failed to fetch collections:", error);
        }
    };

    const handleDocumentSelect = (document: Document) => {
        setSelectedDocument(document);
    };

    const handleDocumentCreate = async (
        collectionId: number,
        folderId: number | null,
        name: string,
        content: string,
    ) => {
        try {
            const newDocument = await api.createDocument(collectionId, folderId, name, content);
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
                if (selectedDocument?.collection_id === collectionId) {
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

    const handleFolderCreate = async (collectionId: number, parentFolderId: number | null, name: string) => {
        return await api.createFolder(collectionId, parentFolderId, name);
    };

    const handleFolderDelete = async (folderId: number) => {
        await api.deleteFolder(folderId);
    };

    // Header control handlers
    const handleNameChange = (newName: string) => {
        setDocumentName(newName);
        setHasNameChanges(true);
        setHasChanges(true);
    };

    const handleContentChange = (newContent: string) => {
        setDocumentContent(newContent);
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!selectedDocument) return;
        try {
            await handleDocumentUpdate(selectedDocument.id, documentName, documentContent);
            setHasChanges(false);
            setHasNameChanges(false);
        } catch (error) {
            alert("Failed to save document");
        }
    };

    const handleAutoSaveToggle = (enabled: boolean) => {
        setAutoSaveEnabled(enabled);
        localStorage.setItem("markdown-ui-auto-save", enabled.toString());
    };

    const handleHeadingClick = (document: Document, headingId: string) => {
        setSelectedDocument(document);
        setScrollToHeadingId(headingId);
    };

    const handleHeadingScrolled = () => {
        setScrollToHeadingId(null);
    };

    // Auto-save effect
    useEffect(() => {
        if (!selectedDocument || !hasChanges || !autoSaveEnabled) return;
        const contentChanged = documentContent !== selectedDocument.content;
        if (!contentChanged) return;

        const timer = setTimeout(async () => {
            try {
                await handleDocumentUpdate(selectedDocument.id, selectedDocument.name, documentContent);
                if (!hasNameChanges) {
                    setHasChanges(false);
                }
            } catch (error) {
                console.error("Auto-save failed:", error);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [documentContent, hasChanges, autoSaveEnabled, selectedDocument?.id]);

    // Zoom handlers
    const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.1, 3.0));
    const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.1, 0.3));
    const handleResetZoom = () => setZoomLevel(1.0);

    // MCP server toggle
    const handleMcpToggle = async () => {
        setMcpPending(true);
        try {
            if (mcpRunning) {
                await api.stopMcpServer();
                setMcpRunning(false);
            } else {
                await api.startMcpServer();
                setMcpRunning(true);
            }
        } catch (error) {
            console.error("MCP server toggle failed:", error);
            alert(`MCP server error: ${error}`);
        } finally {
            setMcpPending(false);
        }
    };

    // Export handlers
    const handleExportMd = async () => {
        try {
            const success = await api.exportMarkdown(
                documentContent,
                `${documentName || "document"}.md`,
            );
            if (success) {
                console.log("Markdown exported successfully");
            }
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export Markdown");
        }
    };

    const handleExportDocument = async (format: ExportFormat) => {
        if (!selectedDocument) return;
        try {
            const success = await api.exportDocument(
                selectedDocument.id,
                format,
                documentName || "document",
            );
            if (success) {
                console.log(`Document exported as ${format} successfully`);
            }
        } catch (error) {
            console.error("Export failed:", error);
            alert(`Failed to export as ${format.toUpperCase()}`);
        }
    };

    return (
        <div className={`flex flex-col h-screen overflow-hidden ${theme === 'dark' ? 'dark' : ''}`}>
            {/* Unified Header */}
            <div className={`flex items-center gap-4 px-4 py-2 border-b flex-shrink-0 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`}>
                {/* Hamburger Menu */}
                <button
                    className={`w-10 h-10 border-none rounded cursor-pointer flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    onClick={() => {
                        if (sidebarCollapsed) setSidebarWidth(320);
                        setSidebarCollapsed(!sidebarCollapsed);
                    }}
                    title={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                {/* Document Name Input */}
                {selectedDocument ? (
                    <>
                        <input
                            type="text"
                            className={`flex-1 p-2 border rounded text-base font-medium ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                            value={documentName}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder="Document name"
                        />

                        {/* Auto-save checkbox */}
                        <label className={`flex items-center gap-2 cursor-pointer text-sm select-none whitespace-nowrap ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                            <input
                                type="checkbox"
                                checked={autoSaveEnabled}
                                onChange={(e) => handleAutoSaveToggle(e.target.checked)}
                                className="cursor-pointer w-4 h-4"
                            />
                            <span>Auto-save</span>
                        </label>

                        {/* Unsaved indicator */}
                        {hasChanges && (
                            <span className="text-orange-500 text-sm whitespace-nowrap">
                                Unsaved changes
                            </span>
                        )}

                        {/* Save button */}
                        <button
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                            onClick={handleSave}
                            disabled={!hasChanges}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            Save
                        </button>

                        {/* Divider */}
                        <div className={`w-px h-6 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />

                        {/* Zoom Controls */}
                        <ZoomControls
                            zoomLevel={zoomLevel}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onResetZoom={handleResetZoom}
                            onExportMd={handleExportMd}
                            onExportDocument={handleExportDocument}
                        />
                    </>
                ) : (
                    <div className="flex-1" />
                )}

                {/* MCP Server Toggle */}
                <button
                    onClick={handleMcpToggle}
                    disabled={mcpPending}
                    title={mcpRunning ? "MCP server running on :3333 — click to stop" : "Start MCP server on :3333"}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors duration-150 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                        mcpRunning
                            ? theme === 'dark'
                                ? 'border-green-600 text-green-400 hover:bg-green-900/30'
                                : 'border-green-500 text-green-700 hover:bg-green-50'
                            : theme === 'dark'
                                ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                                : 'border-gray-300 text-gray-500 hover:bg-gray-100'
                    }`}
                >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        mcpPending
                            ? 'bg-yellow-400 animate-pulse'
                            : mcpRunning
                                ? 'bg-green-500'
                                : 'bg-gray-400'
                    }`} />
                    MCP
                </button>

                {/* Settings */}
                <button
                    onClick={openSettings}
                    title="Settings"
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                    aria-label="Open settings"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-400">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                </button>

                {/* Theme Toggle */}
                <ThemeToggle />
            </div>

            {/* Main Content Area */}
            <div ref={containerRef} className={`flex flex-1 min-h-0 overflow-hidden ${isDraggingSidebar ? 'select-none' : ''}`}>
                {/* Sidebar */}
                {!sidebarCollapsed && (
                    <>
                        <div
                            style={{ width: sidebarWidth }}
                            className={`flex-shrink-0 overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}
                        >
                            <CollectionsBrowser
                                collections={collections}
                                selectedDocument={selectedDocument}
                                onDocumentSelect={handleDocumentSelect}
                                onDocumentCreate={handleDocumentCreate}
                                onDocumentDelete={handleDocumentDelete}
                                onCollectionCreate={handleCollectionCreate}
                                onCollectionDelete={handleCollectionDelete}
                                onFolderCreate={handleFolderCreate}
                                onFolderDelete={handleFolderDelete}
                                onHeadingClick={handleHeadingClick}
                                mcpAnimatingIds={animatingIds}
                                lastMcpEvents={lastEvents}
                            />
                        </div>
                        {/* Thin resize divider */}
                        <div
                            className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${isDraggingSidebar
                                ? 'bg-blue-500'
                                : theme === 'dark'
                                    ? 'bg-gray-700 hover:bg-blue-500'
                                    : 'bg-gray-300 hover:bg-blue-400'
                                }`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                setIsDraggingSidebar(true);
                            }}
                        />
                    </>
                )}

                {/* Editor/Preview Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white dark:bg-gray-900">
                    {selectedDocument ? (
                        <DocumentEditor
                            content={documentContent}
                            onContentChange={handleContentChange}
                            zoomLevel={zoomLevel}
                            scrollToHeadingId={scrollToHeadingId}
                            onHeadingScrolled={handleHeadingScrolled}
                            mcpFlash={mcpFlash}
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

            {/* Settings Modal */}
            <SettingsModal
                isOpen={settingsOpen}
                onClose={closeSettings}
                theme={theme}
                onThemeChange={(newTheme) => {
                    if (newTheme !== theme) toggleTheme();
                }}
                mcpRunning={mcpRunning}
                mcpPending={mcpPending}
                onMcpToggle={handleMcpToggle}
            />
        </div>
    );
}

export default function App() {
    return (
        <SettingsProvider>
            <AppContent />
        </SettingsProvider>
    );
}
