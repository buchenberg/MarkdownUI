import { useState, useEffect, useRef } from "react";
import { save } from "@tauri-apps/api/dialog";
import FilesystemBrowser from "./components/FilesystemBrowser";
import DocumentEditor from "./components/DocumentEditor";
import Header from "./components/Header";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useTheme } from "./ThemeContext";
import { useSettings } from "./contexts/SettingsContext";
import { useToast } from "./contexts/ToastContext";
import { useMcpEvents } from "./hooks/useMcpEvents";
import { useSidebarResize } from "./hooks/useSidebarResize";
import * as api from "./api";
import type { ExportFormat, TreeNode } from "./api";

function AppContent() {
    const [scrollToHeadingId, setScrollToHeadingId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { sidebarCollapsed, sidebarWidth, isDraggingSidebar, toggleSidebar, startDrag } = useSidebarResize(containerRef);
    const { theme, toggleTheme } = useTheme();
    const { settingsOpen, closeSettings } = useSettings();
    const { showToast } = useToast();

    // Document editor state
    const [documentName, setDocumentName] = useState("");
    const [documentContent, setDocumentContent] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const [hasNameChanges, setHasNameChanges] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
        const saved = localStorage.getItem("markdown-ui-auto-save");
        return saved ? saved === "true" : false;
    });

    // Workspace roots (filesystem mode)
    const [workspaceRoots, setWorkspaceRoots] = useState<TreeNode[]>([]);
    const [selectedFsDoc, setSelectedFsDoc] = useState<TreeNode | null>(null);

    // MCP server state
    const [mcpRunning, setMcpRunning] = useState(false);
    const [mcpPending, setMcpPending] = useState(false);

    // MCP live update animations
    const [mcpFlash, setMcpFlash] = useState(false);
    const { animatingIds } = useMcpEvents(mcpRunning);

    // When an MCP event touches the currently open document, refresh it
    useEffect(() => {
        if (!selectedFsDoc || !mcpRunning) return;
        if (!animatingIds.has(selectedFsDoc.id)) return;

        api.getEntry(selectedFsDoc.id).then((entry) => {
            if (!entry) {
                setSelectedFsDoc(null);
                return;
            }
            setDocumentContent(entry.content || "");
            setDocumentName(entry.name);
            setHasChanges(false);
            setHasNameChanges(false);
            setMcpFlash(true);
            setTimeout(() => setMcpFlash(false), 2200);
        });
    }, [animatingIds, selectedFsDoc?.id, mcpRunning]);

    useEffect(() => {
        // Check initial MCP server status on mount and load roots
        api.getMcpServerStatus().then(setMcpRunning).catch(() => {});
        fetchWorkspaceRoots();
    }, []);

    const fetchWorkspaceRoots = async () => {
        try {
            const roots = await api.listRoots();
            setWorkspaceRoots(roots);
        } catch (error) {
            console.error("Failed to fetch workspace roots:", error);
        }
    };

    const handleFsDocumentSelect = (fsDoc: TreeNode | null) => {
        setSelectedFsDoc(fsDoc);
        if (fsDoc) {
            setDocumentName(fsDoc.name);
            setDocumentContent(fsDoc.content || "");
            setHasChanges(false);
            setHasNameChanges(false);
        }
    };

    const handleFsDocumentUpdate = async (
        id: string,
        name: string,
        content: string,
    ) => {
        try {
            const updated = await api.updateDoc(id, name, content);
            setSelectedFsDoc(updated);
            return updated;
        } catch (error) {
            console.error("Failed to update filesystem document:", error);
            throw error;
        }
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
        if (!selectedFsDoc) return;
        try {
            await handleFsDocumentUpdate(selectedFsDoc.id, documentName, documentContent);
            setHasChanges(false);
            setHasNameChanges(false);
        } catch {
            showToast("Failed to save document", "error");
        }
    };

    const handleAutoSaveToggle = (enabled: boolean) => {
        setAutoSaveEnabled(enabled);
        localStorage.setItem("markdown-ui-auto-save", enabled.toString());
    };

    const handleFsHeadingClick = async (docId: string, headingId: string) => {
        try {
            const entry = await api.getEntry(docId);
            if (entry) {
                handleFsDocumentSelect(entry);
                setScrollToHeadingId(headingId);
            }
        } catch (err) {
            console.error("Failed to load document for heading:", err);
        }
    };

    const handleHeadingScrolled = () => {
        setScrollToHeadingId(null);
    };

    // Auto-save effect
    useEffect(() => {
        if (!hasChanges || !autoSaveEnabled || !selectedFsDoc) return;

        const contentChanged = documentContent !== (selectedFsDoc?.content || "");
        if (!contentChanged) return;

        const timer = setTimeout(async () => {
            try {
                if (selectedFsDoc) {
                    await handleFsDocumentUpdate(selectedFsDoc.id, selectedFsDoc.name, documentContent);
                }
                if (!hasNameChanges) setHasChanges(false);
            } catch (error) {
                console.error("Auto-save failed:", error);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [documentContent, hasChanges, autoSaveEnabled, selectedFsDoc?.id]);

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
            showToast(`MCP server error: ${error}`, "error");
        } finally {
            setMcpPending(false);
        }
    };

    // Workspace root management
    const handleAddWorkspaceRoot = async () => {
        try {
            const dirPath = await api.pickDirectory();
            if (!dirPath) return;
            const parts = dirPath.replace(/\\/g, "/").split("/");
            const name = parts[parts.length - 1] || dirPath;
            await api.addRoot(name, dirPath);
            await fetchWorkspaceRoots();
        } catch (error) {
            console.error("Failed to add workspace root:", error);
            showToast(`Failed to add workspace root: ${error}`, "error");
        }
    };

    const handleRemoveWorkspaceRoot = async (id: string) => {
        try {
            await api.removeRoot(id);
            await fetchWorkspaceRoots();
        } catch (error) {
            console.error("Failed to remove workspace root:", error);
            showToast(`Failed to remove workspace root: ${error}`, "error");
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
            showToast("Failed to export Markdown", "error");
        }
    };

    const handleExportDocument = async (format: ExportFormat) => {
        if (!selectedFsDoc) return;
        try {
            const formatInfo: Record<ExportFormat, { ext: string; name: string }> = {
                html: { ext: "html", name: "HTML Files" },
                pdf: { ext: "pdf", name: "PDF Files" },
            };
            const { ext, name: filterName } = formatInfo[format];
            const filePath = await save({
                defaultPath: `${documentName || "document"}.${ext}`,
                filters: [{ name: filterName, extensions: [ext] }],
            });
            if (!filePath) return;
            await api.exportDocToFile(selectedFsDoc.id, format, filePath);
        } catch (error) {
            console.error("Export failed:", error);
            showToast(`Failed to export as ${format.toUpperCase()}`, "error");
        }
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <Header
                theme={theme}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={toggleSidebar}
                selectedFsDoc={selectedFsDoc}
                documentName={documentName}
                onNameChange={handleNameChange}
                autoSaveEnabled={autoSaveEnabled}
                onAutoSaveToggle={handleAutoSaveToggle}
                hasChanges={hasChanges}
                onSave={handleSave}
                zoomLevel={zoomLevel}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetZoom={handleResetZoom}
                onExportMd={handleExportMd}
                onExportDocument={handleExportDocument}
                mcpRunning={mcpRunning}
                mcpPending={mcpPending}
                onMcpToggle={handleMcpToggle}
            />

            {/* Main Content Area */}
            <div ref={containerRef} className={`flex flex-1 min-h-0 overflow-hidden ${isDraggingSidebar ? 'select-none' : ''}`}>
                {/* Sidebar */}
                {!sidebarCollapsed && (
                    <>
                        <div
                            style={{ width: sidebarWidth }}
                            className={`flex-shrink-0 overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}
                        >
                            <FilesystemBrowser
                                roots={workspaceRoots}
                                selectedDocId={selectedFsDoc?.id ?? null}
                                onDocumentSelect={handleFsDocumentSelect}
                                onHeadingClick={handleFsHeadingClick}
                                onRootsChanged={fetchWorkspaceRoots}
                                onRemoveWorkspaceRoot={handleRemoveWorkspaceRoot}
                                mcpAnimatingIds={animatingIds}
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
                                startDrag();
                            }}
                        />
                    </>
                )}

                {/* Editor/Preview Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white dark:bg-gray-900">
                    {selectedFsDoc ? (
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
                                Select a document from the sidebar, or add a folder in Settings →
                                Storage to start browsing.
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
                workspaceRoots={workspaceRoots}
                onAddWorkspaceRoot={handleAddWorkspaceRoot}
                onRemoveWorkspaceRoot={handleRemoveWorkspaceRoot}
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
