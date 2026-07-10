import { useEffect, useRef, useState, useCallback, forwardRef, useMemo, createContext, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import mermaid from "mermaid";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import TurndownService from "turndown";
import { useTheme } from "../ThemeContext";
import { slugify } from "../utils/slugify";

interface DocumentPreviewProps {
    content: string;
    zoomLevel?: number;
    onNavigateToLine?: (line: number) => void;
    scrollToHeadingId?: string | null;
    onHeadingScrolled?: () => void;
}

// Context shares heading-slug data + callbacks with the hoisted HeadingRenderer,
// avoiding the anti-pattern of defining a component inside the render body.
interface HeadingContextValue {
    headingSlugsByLine: Map<number, string>;
    onNavigateToLine?: (line: number) => void;
    theme: 'light' | 'dark';
}
const HeadingContext = createContext<HeadingContextValue | null>(null);

// Sanitization schema: extends the safe GitHub-style default to allow `class`
// attributes (used for legitimate markdown styling), while still stripping
// <script>, event handlers (onclick, etc.), and javascript: URLs.
const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
    },
};

function HeadingRenderer({ children, node }: any) {
    const ctx = useContext(HeadingContext);
    if (!ctx) return null;
    const line = node?.position?.start?.line;
    const Tag = (node?.tagName as keyof JSX.IntrinsicElements) || 'h1';
    const headingId = line ? ctx.headingSlugsByLine.get(line) : undefined;

    return (
        <Tag id={headingId} className="group relative flex items-center">
            <span className="flex-1">{children}</span>
            {line && ctx.onNavigateToLine && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        ctx.onNavigateToLine!(line);
                    }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 rounded-md ${ctx.theme === 'dark'
                        ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                        : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
                        }`}
                    title="Go to source"
                    aria-label="Go to source"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
            )}
        </Tag>
    );
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

                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
    function DocumentPreview({ content, zoomLevel = 1.0, onNavigateToLine, scrollToHeadingId, onHeadingScrolled }, ref) {
        const previewRef = useRef<HTMLDivElement>(null);
        const combinedRef = useCombinedRefs(ref, previewRef);

        // Pre-compute heading slug → line number mapping so HeadingRenderer can assign stable IDs
        const headingSlugsByLine = useMemo(() => {
            const result = new Map<number, string>();
            const slugCounts = new Map<string, number>();
            let lineNum = 0;
            for (const line of content.split('\n')) {
                lineNum++;
                const match = line.match(/^(#{1,6})\s+(.+)/);
                if (match) {
                    const text = match[2].trim();
                    let id = slugify(text);
                    const count = slugCounts.get(id) ?? 0;
                    slugCounts.set(id, count + 1);
                    if (count > 0) id = `${id}-${count}`;
                    result.set(lineNum, id);
                }
            }
            return result;
        }, [content]);
        const [isDragging, setIsDragging] = useState(false);
        const [startX, setStartX] = useState(0);
        const [startY, setStartY] = useState(0);
        const [scrollLeft, setScrollLeft] = useState(0);
        const [scrollTop, setScrollTop] = useState(0);
        const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
        const { theme } = useTheme();

        // Convert :::mermaid blocks to ```mermaid for consistent processing
        // Memoized so it only recomputes when content changes (not on every render)
        const processedContent = useMemo(() => content
            .split('\n')
            .map((line) => {
                // Convert opening :::mermaid to ```mermaid
                if (/^:::mermaid\s*$/.test(line)) {
                    return '```mermaid';
                }
                // Convert closing ::: to ``` (only when inside a :::mermaid block)
                if (/^:::\s*$/.test(line)) {
                    return '```';
                }
                return line;
            })
            .join('\n'), [content]);

        // Memoize ReactMarkdown component overrides so renderers aren't redefined each render
        const markdownComponents = useMemo(() => ({
            // Inline code only. Block code (fenced/indented) is rendered by `pre`
            // below — react-markdown wraps every code block in <pre>, never inline,
            // so `pre` is the reliable place to distinguish block vs inline.
            code({ node, className, children, ...props }: any) {
                return <code className={className} {...props}>{children}</code>;
            },
            h1: HeadingRenderer,
            h2: HeadingRenderer,
            h3: HeadingRenderer,
            h4: HeadingRenderer,
            h5: HeadingRenderer,
            h6: HeadingRenderer,
            // Fenced/indented code blocks. Unqualified fences (no language) render
            // as a plain "text" block via the syntax highlighter.
            pre({ children }: any) {
                const child = Array.isArray(children) ? children[0] : children;
                const className: string = child?.props?.className || "";
                const match = /language-(\w+)/.exec(className);
                const language = match ? match[1] : "text";
                const rawChildren = child?.props?.children;
                const codeString = (Array.isArray(rawChildren)
                    ? rawChildren.join("")
                    : String(rawChildren ?? "")
                )
                    .replace(/^\n/, "")
                    .replace(/\n$/, "");

                // Handle mermaid code blocks
                if (language === "mermaid") {
                    return <MermaidDiagram code={codeString} theme={theme} />;
                }

                return (
                    <SyntaxHighlighter
                        style={theme === 'dark' ? oneDark : oneLight}
                        language={language}
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
        }), [theme]);

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
                // Use clientX/clientY since the menu uses position: fixed (viewport-relative)
                setContextMenu({ x: e.clientX, y: e.clientY });
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
                            // Select inner content div to avoid issues with context menu DOM insertion
                            const content = previewRef.current.querySelector('.markdown-preview');
                            if (content) {
                                range.selectNodeContents(content);
                                selection.addRange(range);
                            }
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

        // Scroll to heading when scrollToHeadingId changes
        useEffect(() => {
            if (!scrollToHeadingId) return;
            const id = scrollToHeadingId;
            requestAnimationFrame(() => {
                if (!previewRef.current) return;
                const el = previewRef.current.querySelector(`#${CSS.escape(id)}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    onHeadingScrolled?.();
                }
            });
        }, [scrollToHeadingId, content]);

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
                        className={`fixed z-[100] rounded-md shadow-lg border py-1 min-w-[160px] select-none ${theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-gray-200'
                            : 'bg-white border-gray-200 text-gray-700'
                            }`}
                        style={{
                            left: Math.min(contextMenu.x, window.innerWidth - 180),
                            top: Math.min(contextMenu.y, window.innerHeight - 100),
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className={`w-full text-left px-4 py-2 text-sm ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                                }`}
                            onClick={handleCopy}
                        >
                            Copy
                        </button>
                        <button
                            className={`w-full text-left px-4 py-2 text-sm ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                                }`}
                            onClick={handleCopyAsMarkdown}
                        >
                            Copy as Markdown
                        </button>
                    </div>
                )}
                <HeadingContext.Provider value={{ headingSlugsByLine, onNavigateToLine, theme }}>
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
                            rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                            components={markdownComponents}
                        >
                            {processedContent}
                        </ReactMarkdown>
                    </div>
                </HeadingContext.Provider>
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
