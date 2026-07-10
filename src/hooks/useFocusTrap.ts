import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container while active:
 * - Moves focus into the container on mount
 * - Keeps Tab/Shift+Tab cycling inside the container
 * - Restores focus to the previously focused element on cleanup
 *
 * Pass `active` as false to disable the trap without unmounting.
 */
export function useFocusTrap(
    containerRef: RefObject<HTMLElement>,
    active: boolean,
): void {
    useEffect(() => {
        if (!active || !containerRef.current) return;

        const container = containerRef.current;
        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Move focus into the dialog
        const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const firstFocusable = focusables[0];
        firstFocusable?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const items = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
            if (items.length === 0) return;

            const first = items[0];
            const last = items[items.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        container.addEventListener("keydown", handleKeyDown);

        return () => {
            container.removeEventListener("keydown", handleKeyDown);
            // Restore focus to the element that opened the dialog
            previouslyFocused?.focus();
        };
    }, [active, containerRef]);
}
