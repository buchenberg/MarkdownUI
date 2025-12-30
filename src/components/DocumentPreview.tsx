import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import mermaid from "mermaid";
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
        const { theme } = useTheme();

        if (!content.trim()) {
            return (
                <div className={`flex items-center justify-center h-full ${theme === 'dark' ? 'text-gray-400 bg-gray-900' : 'text-gray-500 bg-white'}`}>
                    <p>Enter Markdown content in the editor to see the preview</p>
                </div>
            );
        }

        // Mouse event handlers for drag scrolling
        const handleMouseDown = useCallback((e: React.MouseEvent) => {
            if (!previewRef.current) return;

            setIsDragging(true);
            setStartX(e.pageX);
            setStartY(e.pageY);
            setScrollLeft(previewRef.current.scrollLeft);
            setScrollTop(previewRef.current.scrollTop);

            // Prevent text selection while dragging
            e.preventDefault();
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

        return (
            <div
                ref={combinedRef}
                className={`w-full h-full overflow-auto p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}
                onMouseDown={handleMouseDown}
                style={{ cursor: isDragging ? "grabbing" : "default" }}
            >
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

                                // Code blocks with syntax highlighting (basic)
                                return (
                                    <pre>
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    </pre>
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
