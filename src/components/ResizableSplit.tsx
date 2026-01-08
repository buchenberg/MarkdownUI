import { useState, useRef, useEffect } from "react";

interface ResizableSplitProps {
    left: React.ReactNode;
    right: React.ReactNode;
    initialLeftWidth?: number; // Percentage (0-100)
}

type PaneVisibility = "both" | "left" | "right";

export default function ResizableSplit({
    left,
    right,
    initialLeftWidth = 50,
}: ResizableSplitProps) {
    const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const [paneVisibility, setPaneVisibility] = useState<PaneVisibility>("both");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const newLeftWidth =
                ((e.clientX - containerRect.left) / containerRect.width) * 100;

            // Constrain between 20% and 80%
            const constrainedWidth = Math.max(20, Math.min(80, newLeftWidth));
            setLeftWidth(constrainedWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isDragging]);

    const toggleLeftPane = () => {
        if (paneVisibility === "left") {
            // If only left is visible, show both
            setPaneVisibility("both");
        } else if (paneVisibility === "both") {
            // If both are visible, hide left (show only right)
            setPaneVisibility("right");
        } else if (paneVisibility === "right") {
            // If only right is visible, show both
            setPaneVisibility("both");
        }
    };

    const toggleRightPane = () => {
        if (paneVisibility === "right") {
            // If only right is visible, show both
            setPaneVisibility("both");
        } else if (paneVisibility === "both") {
            // If both are visible, hide right (show only left)
            setPaneVisibility("left");
        } else if (paneVisibility === "left") {
            // If only left is visible, show both
            setPaneVisibility("both");
        }
    };

    return (
        <div className="flex h-full" ref={containerRef}>
            <div
                className={`h-full relative overflow-hidden ${paneVisibility === "right" ? "hidden" : ""}`}
                style={{ width: paneVisibility === "left" ? "100%" : `${leftWidth}%` }}
            >
                {left}
            </div>
            {paneVisibility === "both" && (
                <div
                    className="w-4 bg-gray-300 dark:bg-gray-700 cursor-col-resize relative hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col gap-2 opacity-70 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                                className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors shadow-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLeftPane();
                                }}
                                title="Hide Left Pane"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors shadow-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRightPane();
                                }}
                                title="Hide Right Pane"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {paneVisibility === "left" && (
                <div className="w-4 bg-gray-300 dark:bg-gray-700 cursor-col-resize relative hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors group">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button
                            className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors shadow-sm opacity-70 group-hover:opacity-100 transition-opacity duration-200"
                            onClick={toggleRightPane}
                            title="Show Right Pane"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
            {paneVisibility === "right" && (
                <div className="w-4 bg-gray-300 dark:bg-gray-700 cursor-col-resize relative hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors group">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button
                            className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors shadow-sm opacity-70 group-hover:opacity-100 transition-opacity duration-200"
                            onClick={toggleLeftPane}
                            title="Show Left Pane"
                        >
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
            <div
                className={`h-full overflow-hidden ${paneVisibility === "left" ? "hidden" : ""}`}
                style={{
                    width: paneVisibility === "right" ? "100%" : `${100 - leftWidth}%`,
                }}
            >
                {right}
            </div>
        </div>
    );
}
