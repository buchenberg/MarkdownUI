import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import DocumentPreview from "./DocumentPreview";
import ResizableSplit from "./ResizableSplit";
import { useTheme } from "../ThemeContext";

interface DocumentEditorProps {
    content: string;
    onContentChange: (content: string) => void;
    zoomLevel: number;
}

export default function DocumentEditor({
    content,
    onContentChange,
    zoomLevel,
}: DocumentEditorProps) {
    const previewRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();
    const editorRef = useRef<any>(null);

    // Define custom theme before Monaco editor mounts
    const handleEditorBeforeMount = (monaco: any) => {
        // Define custom dark blue theme matching the app UI
        monaco.editor.defineTheme('midnight-blue', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
                { token: 'keyword', foreground: '93c5fd' },
                { token: 'string', foreground: 'a5d6a7' },
                { token: 'number', foreground: 'f9a825' },
                { token: 'type', foreground: '4dd0e1' },
            ],
            colors: {
                'editor.background': '#0f172a',
                'editor.foreground': '#e2e8f0',
                'editor.lineHighlightBackground': '#1e293b',
                'editor.selectionBackground': '#334155',
                'editorCursor.foreground': '#60a5fa',
                'editorLineNumber.foreground': '#64748b',
                'editorLineNumber.activeForeground': '#94a3b8',
                'editor.inactiveSelectionBackground': '#1e293b',
                'editorIndentGuide.background': '#334155',
                'editorWhitespace.foreground': '#334155',
                'scrollbarSlider.background': '#334155',
                'scrollbarSlider.hoverBackground': '#475569',
                'scrollbarSlider.activeBackground': '#64748b',
            }
        });
    };

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

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0">
                <ResizableSplit
                    left={
                        <div className={`h-full flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
                            <div className="flex-1 overflow-hidden">
                                <Editor
                                    height="100%"
                                    language="markdown"
                                    theme={theme === 'dark' ? 'midnight-blue' : 'vs'}
                                    value={content}
                                    onChange={(value) => onContentChange(value || "")}
                                    beforeMount={handleEditorBeforeMount}
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
