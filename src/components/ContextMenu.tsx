import { useLayoutEffect, useRef, useCallback, useState } from "react";

export interface ContextMenuItem {
    label: string;
    onClick: () => void;
    danger?: boolean;
    separator?: boolean;
}

interface ContextMenuProps {
    items: ContextMenuItem[];
    position: { x: number; y: number };
    onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x, y: position.y });

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const adjusted = { x: position.x, y: position.y };
            if (position.x + rect.width > window.innerWidth) {
                adjusted.x = window.innerWidth - rect.width - 8;
            }
            if (position.y + rect.height > window.innerHeight) {
                adjusted.y = window.innerHeight - rect.height - 8;
            }
            setAdjustedPosition(adjusted);
        }
    }, [position, items]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    const handleItemClick = useCallback((item: ContextMenuItem) => {
        item.onClick();
        onClose();
    }, [onClose]);

    if (items.length === 0) return null;

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] rounded-md shadow-lg border py-1 min-w-[180px] select-none bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"
            style={{
                left: adjustedPosition.x,
                top: adjustedPosition.y,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {items.map((item, i) => (
                <div key={i}>
                    {item.separator && i > 0 && (
                        <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                    )}
                    <button
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            item.danger
                                ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                : ""
                        }`}
                        onClick={() => handleItemClick(item)}
                    >
                        {item.label}
                    </button>
                </div>
            ))}
        </div>
    );
}
