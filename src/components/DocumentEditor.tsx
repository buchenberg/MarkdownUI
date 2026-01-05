import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import DocumentPreview from "./DocumentPreview";
import ResizableSplit from "./ResizableSplit";
import ZoomControls from "./ZoomControls";
import { Document } from "../App";
import { useTheme } from "../ThemeContext";
import * as api from "../api";
import type { ExportFormat } from "../api";

interface DocumentEditorProps {
    document: Document;
    onUpdate: (id: number, name: string, content: string) => Promise<Document>;
    onSave: (id: number, name: string, content: string) => Promise<Document>;
}

export default function DocumentEditor({
    document,
    onUpdate,
    onSave,
}: DocumentEditorProps) {
    const [name, setName] = useState(document.name);
    const [content, setContent] = useState(document.content);
    const [hasChanges, setHasChanges] = useState(false);
    const [hasNameChanges, setHasNameChanges] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const previewRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
        // Load auto-save preference from localStorage, default to false
        const saved = localStorage.getItem("markdown-ui-auto-save");
        return saved ? saved === "true" : false;
    });

    const editorRef = useRef<any>(null);

    // Handle Monaco Editor mount
    const handleEditorMount = (editor: any) => {
        editorRef.current = editor;
    };

    // Trigger layout refresh when zoom level changes
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.layout();
        }
    }, [zoomLevel]);

    useEffect(() => {
        setName(document.name);
        setContent(document.content);
        setHasChanges(false);
        setHasNameChanges(false);
    }, [document.id]);

    // Zoom control handlers
    const handleZoomIn = () => {
        setZoomLevel((prev) => Math.min(prev + 0.1, 3.0));
    };

    const handleZoomOut = () => {
        setZoomLevel((prev) => Math.max(prev - 0.1, 0.3));
    };

    const handleResetZoom = () => {
        setZoomLevel(1.0);
    };

    const handleExportMd = async () => {
        try {
            // Use Tauri file dialog to choose save location for Markdown source
            const success = await api.exportMarkdown(
                content,
                `${name || "document"}.md`,
            );

            if (success) {
                // Optional: Show success message
                console.log("Markdown exported successfully");
            }
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export Markdown");
        }
    };

    const handleExportDocument = async (format: ExportFormat) => {
        try {
            const success = await api.exportDocument(
                document.id,
                format,
                name || "document",
            );

            if (success) {
                console.log(`Document exported as ${format} successfully`);
            }
        } catch (error) {
            console.error("Export failed:", error);
            alert(`Failed to export as ${format.toUpperCase()}`);
        }
    };

    const handleContentChange = (newContent: string) => {
        setContent(newContent);
        setHasChanges(true);
    };

    const handleNameChange = (newName: string) => {
        setName(newName);
        setHasNameChanges(true);
        setHasChanges(true);
    };

    const handleSave = async () => {
        try {
            await onSave(document.id, name, content);
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

    const handleAutoSave = async () => {
        // Auto-save content only (name changes require manual save)
        // Use the original document name for auto-save since name changes aren't auto-saved
        try {
            await onUpdate(document.id, document.name, content);
            // Only clear hasChanges if there are no name changes
            if (!hasNameChanges) {
                setHasChanges(false);
            }
        } catch (error) {
            console.error("Auto-save failed:", error);
        }
    };

    // Auto-save content changes only (not name) after 2 seconds of inactivity
    // Only if auto-save is enabled
    useEffect(() => {
        if (!hasChanges || !autoSaveEnabled) return;
        // Only auto-save if content has changed (not just name)
        const contentChanged = content !== document.content;
        if (!contentChanged) return;

        const timer = setTimeout(() => {
            handleAutoSave();
        }, 2000);
        return () => clearTimeout(timer);
    }, [
        content,
        hasChanges,
        autoSaveEnabled,
        document.id,
        document.name,
        document.content,
    ]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0">
                <ResizableSplit
                    left={
                        <div className="h-full flex flex-col bg-gray-900 overflow-hidden">
                            <div className={`flex justify-between items-center p-4 border-b flex-shrink-0 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`}>
                                <input
                                    type="text"
                                    className={`flex-1 p-2 border rounded text-base font-medium mr-4 max-w-xs ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                                    value={name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    placeholder="Document name"
                                />
                                <div className="flex items-center gap-4 flex-wrap">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none hover:text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={autoSaveEnabled}
                                            onChange={(e) => handleAutoSaveToggle(e.target.checked)}
                                            className="cursor-pointer w-4 h-4"
                                        />
                                        <span>Auto-save</span>
                                    </label>
                                    {hasChanges && (
                                        <span className="text-orange-500 text-sm">
                                            Unsaved changes
                                        </span>
                                    )}
                                    <button
                                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        onClick={handleSave}
                                        disabled={!hasChanges}
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <Editor
                                    height="100%"
                                    language="markdown"
                                    theme="vs-dark"
                                    value={content}
                                    onChange={(value) => handleContentChange(value || "")}
                                    onMount={handleEditorMount}
                                    options={{
                                        automaticLayout: true,
                                        fontSize: 14,
                                        lineNumbers: "on",
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        wordWrap: "on",
                                        scrollbar: {
                                            vertical: "auto",
                                            horizontal: "auto",
                                            useShadows: false,
                                            verticalScrollbarSize: 10,
                                            horizontalScrollbarSize: 10,
                                            alwaysConsumeMouseWheel: false,
                                        },
                                        overviewRulerLanes: 0,
                                        lineDecorationsWidth: 10,
                                        scrollBeyondLastColumn: 5,
                                    }}
                                />
                            </div>
                        </div>
                    }
                    right={
                        <div className={`h-full flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
                            <div className={`flex justify-end items-center p-4 border-b flex-shrink-0 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-50'}`}>
                                <ZoomControls
                                    zoomLevel={zoomLevel}
                                    onZoomIn={handleZoomIn}
                                    onZoomOut={handleZoomOut}
                                    onResetZoom={handleResetZoom}
                                    onExportMd={handleExportMd}
                                    onExportDocument={handleExportDocument}
                                />
                            </div>
                            <div className="flex-1 overflow-auto">
                                <DocumentPreview
                                    content={content}
                                    zoomLevel={zoomLevel}
                                    ref={previewRef}
                                />
                            </div>
                        </div>
                    }
                    initialLeftWidth={50}
                />
            </div>
        </div>
    );
}
