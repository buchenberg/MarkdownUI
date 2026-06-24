import { useEffect, useState } from 'react';
import SegmentedToggle from './SegmentedToggle';
import SettingsRow from './SettingsRow';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onThemeChange: (theme: 'light' | 'dark') => void;
    mcpRunning: boolean;
    mcpPending: boolean;
    onMcpToggle: () => Promise<void>;
    storageType: 'sqlite' | 'filesystem';
    storagePending: boolean;
    onStorageTypeChange: (type: 'sqlite' | 'filesystem') => Promise<void>;
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
    storageType,
    storagePending,
    onStorageTypeChange,
}: SettingsModalProps) {
    const [activeCategory, setActiveCategory] = useState<CategoryId>('general');

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
                className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[700px] h-[480px] mx-4 flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Full-width title bar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
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
                                                            ? 'Running on :3333'
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
                                        Storage Type
                                    </h3>
                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                                        <SettingsRow label="Backend" icon={
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                            </svg>
                                        }>
                                            <SegmentedToggle
                                                options={[
                                                    { value: 'sqlite', label: 'SQLite' },
                                                    { value: 'filesystem', label: 'Filesystem' },
                                                ]}
                                                value={storageType}
                                                onChange={async (newType: string) => {
                                                    if (newType === storageType) return;
                                                    const confirmed = confirm(
                                                        `Switch storage to ${newType}?\n\nThis requires restarting the application. Unsaved changes will be lost.`,
                                                    );
                                                    if (confirmed) {
                                                        await onStorageTypeChange(newType as 'sqlite' | 'filesystem');
                                                    }
                                                }}
                                            />
                                        </SettingsRow>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                                            {storageType === 'sqlite'
                                                ? 'Documents are stored in a SQLite database in the app data directory.'
                                                : 'Documents are browsed and edited directly on the filesystem.'}
                                        </p>
                                        {storagePending && (
                                            <p className="text-xs text-yellow-500 mt-1">Saving...</p>
                                        )}
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
