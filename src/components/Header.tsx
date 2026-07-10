import ZoomControls from "./ZoomControls";
import ThemeToggle from "./ThemeToggle";
import { useSettings } from "../contexts/SettingsContext";
import type { ExportFormat, TreeNode } from "../api";

interface HeaderProps {
    theme: 'light' | 'dark';
    sidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    selectedFsDoc: TreeNode | null;
    documentName: string;
    onNameChange: (name: string) => void;
    autoSaveEnabled: boolean;
    onAutoSaveToggle: (enabled: boolean) => void;
    hasChanges: boolean;
    onSave: () => void;
    zoomLevel: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
    onExportMd: () => void;
    onExportDocument: (format: ExportFormat) => void;
    mcpRunning: boolean;
    mcpPending: boolean;
    mcpPort: number;
    onMcpToggle: () => void;
}

export default function Header({
    theme,
    sidebarCollapsed,
    onToggleSidebar,
    selectedFsDoc,
    documentName,
    onNameChange,
    autoSaveEnabled,
    onAutoSaveToggle,
    hasChanges,
    onSave,
    zoomLevel,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onExportMd,
    onExportDocument,
    mcpRunning,
    mcpPending,
    mcpPort,
    onMcpToggle,
}: HeaderProps) {
    const { openSettings } = useSettings();

    return (
        <div className={`flex items-center gap-4 px-4 py-2 border-b flex-shrink-0 ${theme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}`}>
            {/* Hamburger Menu */}
            <button
                className={`w-10 h-10 border-none rounded cursor-pointer flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={onToggleSidebar}
                title={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
                aria-label={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            {/* Document Name Input */}
            {selectedFsDoc ? (
                <>
                    <input
                        type="text"
                        className={`flex-1 p-2 border rounded text-base font-medium ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                        value={documentName}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder="Document name"
                    />

                    {/* Auto-save checkbox */}
                    <label className={`flex items-center gap-2 cursor-pointer text-sm select-none whitespace-nowrap ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'}`}>
                        <input
                            type="checkbox"
                            checked={autoSaveEnabled}
                            onChange={(e) => onAutoSaveToggle(e.target.checked)}
                            className="cursor-pointer w-4 h-4"
                        />
                        <span>Auto-save</span>
                    </label>

                    {/* Unsaved indicator */}
                    {hasChanges && (
                        <span className="text-orange-500 text-sm whitespace-nowrap">
                            Unsaved changes
                        </span>
                    )}

                    {/* Save button */}
                    <button
                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5"
                        onClick={onSave}
                        disabled={!hasChanges}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                        </svg>
                        Save
                    </button>

                    {/* Divider */}
                    <div className={`w-px h-6 ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />

                    {/* Zoom Controls */}
                    <ZoomControls
                        zoomLevel={zoomLevel}
                        onZoomIn={onZoomIn}
                        onZoomOut={onZoomOut}
                        onResetZoom={onResetZoom}
                        onExportMd={onExportMd}
                        onExportDocument={onExportDocument}
                    />
                </>
            ) : (
                <div className="flex-1" />
            )}

            {/* MCP Server Toggle */}
            <button
                onClick={onMcpToggle}
                disabled={mcpPending}
                title={mcpRunning ? `MCP server running on :${mcpPort} — click to stop` : `Start MCP server on :${mcpPort}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors duration-150 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                    mcpRunning
                        ? theme === 'dark'
                            ? 'border-green-600 text-green-400 hover:bg-green-900/30'
                            : 'border-green-500 text-green-700 hover:bg-green-50'
                        : theme === 'dark'
                            ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                            : 'border-gray-300 text-gray-500 hover:bg-gray-100'
                }`}
            >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    mcpPending
                        ? 'bg-yellow-400 animate-pulse'
                        : mcpRunning
                            ? 'bg-green-500'
                            : 'bg-gray-400'
                }`} />
                MCP
            </button>

            {/* Settings */}
            <button
                onClick={openSettings}
                title="Settings"
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label="Open settings"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-gray-400">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
            </button>

            {/* Theme Toggle */}
            <ThemeToggle />
        </div>
    );
}
