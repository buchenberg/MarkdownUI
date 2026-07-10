import { useState, useEffect, useCallback, type RefObject } from "react";

const COLLAPSE_THRESHOLD = 240; // Drag below this → sidebar snaps closed
const MIN_WIDTH = 300;          // Minimum width for readability
const MAX_WIDTH_RATIO = 0.5;    // Max width as a fraction of the container
const DEFAULT_WIDTH = 320;      // Width restored when un-collapsing

/**
 * Manages the left-nav sidebar resize + collapse behavior.
 * `containerRef` is the main content area whose width constrains the maximum.
 */
export function useSidebarResize(containerRef: RefObject<HTMLDivElement>) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
    const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingSidebar || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;

            // Snap to collapse if dragged too far left
            if (newWidth < COLLAPSE_THRESHOLD) {
                setSidebarCollapsed(true);
                setIsDraggingSidebar(false);
                return;
            }

            // Constrain width to ensure content remains visible (min 300px, max 50% of container)
            const maxWidth = containerRect.width * MAX_WIDTH_RATIO;
            setSidebarWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, newWidth)));
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
    }, [isDraggingSidebar, containerRef]);

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed((prev) => {
            if (prev) setSidebarWidth(DEFAULT_WIDTH);
            return !prev;
        });
    }, []);

    const startDrag = useCallback(() => setIsDraggingSidebar(true), []);

    return { sidebarCollapsed, sidebarWidth, isDraggingSidebar, toggleSidebar, startDrag };
}
