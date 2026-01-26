import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import TurndownService from "turndown";
import { useTheme } from "../ThemeContext";

interface DocumentPreviewProps {
    content: string;
    zoomLevel?: number;
}

// Mermaid code block component
function MermaidDiagram({ code, theme }: { code: string; theme: 'light' | 'dark' }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!containerRef.current || !code.trim()) return;

        const renderDiagram = async () => {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: theme === 'dark' ? 'dark' : 'default',
                    securityLevel: "loose",
                });

                const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const { svg } = await mermaid.render(id, code);

                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                    setError(null);
                }
            } catch (err: any) {
                setError(err.message || "Failed to render diagram");
                if (containerRef.current) {
                    containerRef.current.innerHTML = "";
                }
            }
        };

        renderDiagram();
    }, [code, theme]);

    if (error) {
        return (
            <div className="mermaid-error">
                <strong>Mermaid Error:</strong> {error}
            </div>
        );
    }

    return <div ref={containerRef} className="mermaid-container" />;
}

const DocumentPreview = forwardRef<HTMLDivElement, DocumentPreviewProps>(
    function DocumentPreview({ content, zoomLevel = 1.0 }, ref) {
        const previewRef = useRef<HTMLDivElement>(null);
        const combinedRef = useCombinedRefs(ref, previewRef);
        const [isDragging, setIsDragging] = useState(false);
        const [startX, setStartX] = useState(0);
        const [startY, setStartY] = useState(0);
        const [scrollLeft, setScrollLeft] = useState(0);
        const [scrollTop, setScrollTop] = useState(0);
        const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
        const { theme } = useTheme();

        // Mouse event handlers for drag scrolling
        const handleMouseDown = useCallback((e: React.MouseEvent) => {
            if (!previewRef.current) return;

            // Only drag on Middle Click (button 1) or Ctrl + Left Click (button 0 + ctrl)
            if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
                setIsDragging(true);
                setStartX(e.pageX);
                setStartY(e.pageY);
                setScrollLeft(previewRef.current.scrollLeft);
                setScrollTop(previewRef.current.scrollTop);

                // Prevent default behavior (like scrolling icon appearance)
                e.preventDefault();
            }
        }, []);

        const handleContextMenu = useCallback((e: React.MouseEvent) => {
            const selection = window.getSelection();
            // Only show context menu if there is a selection
            if (selection && !selection.isCollapsed) {
                e.preventDefault();
                setContextMenu({ x: e.pageX, y: e.pageY });
            }
        }, []);

        const handleCopy = useCallback(async () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                try {
                    const range = selection.getRangeAt(0);
                    const container = document.createElement("div");
                    container.appendChild(range.cloneContents());
                    const html = container.innerHTML;
                    const text = selection.toString();

                    const blobHtml = new Blob([html], { type: "text/html" });
                    const blobText = new Blob([text], { type: "text/plain" });

                    await navigator.clipboard.write([
                        new ClipboardItem({
                            "text/html": blobHtml,
                            "text/plain": blobText,
                        }),
                    ]);
                } catch (err) {
                    console.error("Failed to copy formatted text", err);
                    navigator.clipboard.writeText(selection.toString());
                }
            }
            setContextMenu(null);
        }, []);

        const handleCopyAsMarkdown = useCallback(() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const container = document.createElement("div");
                container.appendChild(range.cloneContents());

                const turndownService = new TurndownService({
                    headingStyle: "atx",
                    codeBlockStyle: "fenced",
                });
                // Configure turndown to keep some elements or format specific ways if needed
                // For now, default GFM-like behavior is usually good

                const markdown = turndownService.turndown(container.innerHTML);
                navigator.clipboard.writeText(markdown);
            }
            setContextMenu(null);
        }, []);

        const handleKeyDown = useCallback(
            (e: React.KeyboardEvent) => {
                // Check for Ctrl+A (or Cmd+A on Mac)
                if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                    if (previewRef.current) {
                        e.preventDefault();
                        const selection = window.getSelection();
                        if (selection) {
                            selection.removeAllRanges();
                            const range = document.createRange();
                            range.selectNodeContents(previewRef.current);
                            selection.addRange(range);
                        }
                    }
                }

                // Clear selection on Escape
                if (e.key === "Escape") {
                    e.preventDefault();
                    window.getSelection()?.removeAllRanges();
                    setContextMenu(null);
                }
            },
            [],
        );

        // Close context menu on global click
        useEffect(() => {
            const handleClick = () => setContextMenu(null);
            document.addEventListener("click", handleClick);
            return () => document.removeEventListener("click", handleClick);
        }, []);

        const handleMouseMove = useCallback(
            (e: MouseEvent) => {
                if (!isDragging || !previewRef.current) return;

                const walkX = (e.pageX - startX) * 2; // Multiply for faster scrolling
                const walkY = (e.pageY - startY) * 2;

                previewRef.current.scrollLeft = scrollLeft - walkX;
                previewRef.current.scrollTop = scrollTop - walkY;
            },
            [isDragging, startX, startY, scrollLeft, scrollTop],
        );

        const handleMouseUp = useCallback(() => {
            setIsDragging(false);
        }, []);

        // Add/remove global mouse event listeners
        useEffect(() => {
            if (isDragging) {
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);

                // Change cursor to grabbing
                if (previewRef.current) {
                    previewRef.current.style.cursor = "grabbing";
                }
            } else {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);

                // Reset cursor
                if (previewRef.current) {
                    previewRef.current.style.cursor = "default";
                }
            }

            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }, [isDragging, handleMouseMove, handleMouseUp]);

        // CRITICAL FIX: Early return must be AFTER all hooks
        if (!content.trim()) {
            return (
                <div
                    ref={combinedRef} // Ensure ref is still attached
                    className={`flex items-center justify-center h-full ${theme === 'dark' ? 'text-gray-400 bg-gray-900' : 'text-gray-500 bg-white'}`}
                >
                    <p>Enter Markdown content in the editor to see the preview</p>
                </div>
            );
        }

        return (
            <div
                ref={combinedRef}
                className={`w-full h-full overflow-auto p-6 outline-none ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}
                onMouseDown={handleMouseDown}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                style={{ cursor: isDragging ? "grabbing" : "default" }}
            >
                {contextMenu && (
                    <div
                        className={`fixed z-[100] rounded-md shadow-lg border py-1 min-w-[160px] ${theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-gray-200'
                            : 'bg-white border-gray-200 text-gray-700'
                            }`}
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className={`w-full text-left px-4 py-2 text-sm hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                                }`}
                            onClick={handleCopy}
                        >
                            Copy
                        </button>
                        <button
                            className={`w-full text-left px-4 py-2 text-sm hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                                }`}
                            onClick={handleCopyAsMarkdown}
                        >
                            Copy as Markdown
                        </button>
                    </div>
                )}
                <div
                    className="markdown-preview"
                    style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: "0 0",
                        transition: "transform 0.2s ease",
                    }}
                >
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                            code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const language = match ? match[1] : "";
                                const codeString = String(children).replace(/\n$/, "");

                                // Handle mermaid code blocks
                                if (language === "mermaid") {
                                    return <MermaidDiagram code={codeString} theme={theme} />;
                                }

                                // Inline code
                                if (!className) {
                                    return <code {...props}>{children}</code>;
                                }

                                // Code blocks with syntax highlighting
                                return (
                                    <SyntaxHighlighter
                                        style={theme === 'dark' ? oneDark : oneLight}
                                        language={language || 'text'}
                                        PreTag="div"
                                        customStyle={{
                                            margin: '1em 0',
                                            borderRadius: '0.375rem',
                                            fontSize: '0.875em',
                                        }}
                                    >
                                        {codeString}
                                    </SyntaxHighlighter>
                                );
                            },
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </div>
            </div>
        );
    },
);

// Helper function to combine forwarded ref with internal ref
function useCombinedRefs<T>(
    ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
    return (element: T) => {
        refs.forEach((ref) => {
            if (!ref) return;

            if (typeof ref === "function") {
                ref(element);
            } else {
                (ref as React.MutableRefObject<T | null>).current = element;
            }
        });
    };
}

export default DocumentPreview;
