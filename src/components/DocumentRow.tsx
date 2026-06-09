import { useState } from "react";
import type { Document } from "../api";
import { slugify } from "../utils/slugify";

interface Heading {
    text: string;
    level: number;
    id: string;
}

function parseHeadings(content: string): Heading[] {
    const counts = new Map<string, number>();
    return content.split("\n").reduce<Heading[]>((acc, line) => {
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            const text = match[2].trim();
            let id = slugify(text);
            const count = counts.get(id) ?? 0;
            counts.set(id, count + 1);
            if (count > 0) id = `${id}-${count}`;
            acc.push({ level: match[1].length, text, id });
        }
        return acc;
    }, []);
}

interface DocumentRowProps {
    doc: Document;
    selectedDocument: Document | null;
    /** Base indent in px for the document row (title level) */
    indentBase: number;
    isDeleteConfirming: boolean;
    onSelect: () => void;
    onHeadingClick: (doc: Document, headingId: string) => void;
    onRequestDelete: () => void;
    onCancelDelete: () => void;
    onConfirmDelete: () => void;
    mcpAnimatingIds?: Set<number>;
}

export default function DocumentRow({
    doc,
    selectedDocument,
    indentBase,
    isDeleteConfirming,
    onSelect,
    onHeadingClick,
    onRequestDelete,
    onCancelDelete,
    onConfirmDelete,
    mcpAnimatingIds,
}: DocumentRowProps) {
    const [expanded, setExpanded] = useState(false);
    const isSelected = selectedDocument?.id === doc.id;
    const headings = expanded ? parseHeadings(doc.content) : [];

    const headingBase = indentBase + 16; // 1em in from document title

    return (
        <div>
            {/* ── Document row ── */}
            <div
                className={`group flex items-center gap-0.5 py-0.5 pr-1 cursor-pointer select-none ${
                    isSelected
                        ? "bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        : "hover:bg-gray-200 dark:hover:bg-gray-700"
                } ${
                    mcpAnimatingIds?.has(doc.id) ? "mcp-animate-pulse" : ""
                }`}
                style={{ paddingLeft: `${indentBase}px` }}
            >
                {/* Chevron (toggles heading TOC) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((prev) => !prev);
                    }}
                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-transform duration-100 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ${
                        expanded ? "" : "-rotate-90"
                    }`}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                </button>

                {/* File icon */}
                <span
                    className={`flex-shrink-0 ${
                        isSelected
                            ? "text-blue-500 dark:text-blue-400"
                            : "text-gray-400 dark:text-gray-500"
                    }`}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                </span>

                {/* Name */}
                <div
                    className="flex-1 flex items-center min-w-0 cursor-pointer"
                    onClick={onSelect}
                >
                    <span
                        className={`text-sm truncate ml-0.5 ${
                            isSelected
                                ? "text-blue-700 dark:text-blue-300 font-medium"
                                : "text-gray-700 dark:text-gray-300"
                        }`}
                    >
                        {doc.name}
                    </span>
                </div>

                {/* Hover: delete */}
                <div
                    className="hidden group-hover:flex items-center flex-shrink-0 ml-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        title="Delete Document"
                        onClick={onRequestDelete}
                        className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Heading TOC ── */}
            {expanded && headings.length > 0 && (
                <div>
                    {headings.map((heading, i) => (
                        <div
                            key={i}
                            style={{ paddingLeft: `${headingBase + (heading.level - 1) * 10}px` }}
                            className="flex items-center py-0.5 pr-2 cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-700"
                            onClick={() => onHeadingClick(doc, heading.id)}
                        >
                            <span
                                className={`text-xs truncate ${
                                    heading.level === 1
                                        ? "text-gray-600 dark:text-gray-300"
                                        : "text-gray-500 dark:text-gray-400"
                                }`}
                            >
                                {heading.text}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Delete confirmation ── */}
            {isDeleteConfirming && (
                <div
                    style={{ paddingLeft: `${indentBase}px` }}
                    className="pr-2 py-1 bg-red-50 dark:bg-red-900/20 border-t border-b border-red-200 dark:border-red-800"
                >
                    <p className="text-xs text-red-700 dark:text-red-300 mb-1">
                        Delete "{doc.name}"? This cannot be undone.
                    </p>
                    <div className="flex gap-1.5">
                        <button
                            onClick={onConfirmDelete}
                            className="px-2 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        >
                            Delete
                        </button>
                        <button
                            onClick={onCancelDelete}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
