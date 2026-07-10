import { useEffect, useState, useRef } from 'react';
import SegmentedToggle from './SegmentedToggle';
import SettingsRow from './SettingsRow';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { TreeNode } from '../api';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onThemeChange: (theme: 'light' | 'dark') => void;
    mcpRunning: boolean;
    mcpPending: boolean;
    onMcpToggle: () => Promise<void>;
    mcpPort: number;
    onMcpPortChange: (port: number) => Promise<void>;
    workspaceRoots: TreeNode[];
    onAddWorkspaceRoot: () => Promise<void>;
    onRemoveWorkspaceRoot: (id: string) => Promise<void>;
}

type CategoryId = 'general' | 'mcp-server' | 'storage';

interface Category {
    id: CategoryId;
    label: string;
    icon: React.ReactNode;
}

const CATEGORIES: Category[] = [
    {
        id: 'general',
        label: 'General',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
        ),
    },
    {
        id: 'mcp-server',
        label: 'MCP Server',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
    },
    {
        id: 'storage',
        label: 'Storage',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
        ),
    },
];

const sunIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
    </svg>
);

const moonIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const themeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

export default function SettingsModal({
    isOpen,
    onClose,
    theme,
    onThemeChange,
    mcpRunning,
    mcpPending,
    onMcpToggle,
    mcpPort,
    onMcpPortChange,
    workspaceRoots,
    onAddWorkspaceRoot,
    onRemoveWorkspaceRoot,
}: SettingsModalProps) {
    const [activeCategory, setActiveCategory] = useState<CategoryId>('general');
    const [localMcpPort, setLocalMcpPort] = useState(mcpPort);
    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef, isOpen);

    useEffect(() => {
        setLocalMcpPort(mcpPort);
    }, [mcpPort, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) setActiveCategory('general');
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[700px] h-[480px] mx-4 flex flex-col overflow-hidden outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Full-width title bar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <span id="settings-modal-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        Settings
                    </span>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Close settings"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Two-column body */}
                <div className="flex flex-1 min-h-0">
                    {/* Left Nav */}
                    <nav className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
                        <div className="py-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(cat.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                                        activeCategory === cat.id
                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <span className="flex-shrink-0">{cat.icon}</span>
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </nav>

                    {/* Right Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {activeCategory === 'general' && (
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                    General
                                </h2>
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                        Appearance
                                    </h3>
                                    <SettingsRow label="Theme" icon={themeIcon}>
                                        <SegmentedToggle
                                            options={[
                                                { value: 'light', label: 'Light', icon: sunIcon },
                                                { value: 'dark', label: 'Dark', icon: moonIcon },
                                            ]}
                                            value={theme}
                                            onChange={onThemeChange}
                                        />
                                    </SettingsRow>
                                </div>
                            </div>
                        )}

                        {activeCategory === 'mcp-server' && (
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                    MCP Server
                                </h2>
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                        Server
                                    </h3>
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                                    mcpPending
                                                        ? 'bg-yellow-400 animate-pulse'
                                                        : mcpRunning
                                                            ? 'bg-green-500'
                                                            : 'bg-gray-400'
                                                }`} />
                                                <div>
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        MCP Server
                                                    </span>
                                                    <span className="block text-xs text-gray-400 dark:text-gray-500">
                                                        {mcpRunning
                                                            ? `Running on :${localMcpPort}`
                                                            : mcpPending
                                                                ? 'Starting...'
                                                                : 'Stopped'}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={onMcpToggle}
                                                disabled={mcpPending}
                                                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    mcpRunning
                                                        ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                                                        : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                                                }`}
                                            >
                                                {mcpPending ? 'Toggling...' : mcpRunning ? 'Stop' : 'Start'}
                                            </button>
                                        </div>
                                    </div>

                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                        Configuration
                                    </h3>
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                                        <div className="flex items-center gap-4">
                                            <label className="text-sm text-gray-700 dark:text-gray-300">
                                                Port:
                                            </label>
                                            <input
                                                type="number"
                                                min="1024"
                                                max="65535"
                                                value={localMcpPort}
                                                onChange={(e) => setLocalMcpPort(parseInt(e.target.value) || 3333)}
                                                onBlur={() => {
                                                    const port = Math.max(1024, Math.min(65535, localMcpPort));
                                                    if (port !== mcpPort) {
                                                        onMcpPortChange(port);
                                                    }
                                                }}
                                                className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                (1024-65535)
                                            </span>
                                        </div>
                                        {mcpRunning && (
                                            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                                                Stop the server before changing the port.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeCategory === 'storage' && (
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                    Storage
                                </h2>
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                        Root Folders
                                    </h3>
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                            MarkdownUI browses and edits files directly on the
                                            filesystem. Add a folder here to browse it in the sidebar.
                                        </p>
                                        {workspaceRoots.length === 0 && (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                                                No workspace roots configured. Add a folder to browse.
                                            </p>
                                        )}
                                        <div className="space-y-1.5 mb-2">
                                            {workspaceRoots.map((root) => (
                                                <div
                                                    key={root.id}
                                                    className="flex items-center justify-between gap-2 text-xs"
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500 flex-shrink-0">
                                                            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                                                        </svg>
                                                        <span className="truncate text-gray-700 dark:text-gray-300" title={root.id}>
                                                            {root.name}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => onRemoveWorkspaceRoot(root.id)}
                                                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors flex-shrink-0"
                                                        title="Remove root"
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <line x1="18" y1="6" x2="6" y2="18" />
                                                            <line x1="6" y1="6" x2="18" y2="18" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={onAddWorkspaceRoot}
                                            className="w-full px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                        >
                                            + Add Root Folder
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
