import { create } from 'zustand';
import type { Collection, Document, Folder, TreeNode } from '../api';

interface AppState {
    // Editor State
    selectedDocument: Document | null;
    documentName: string;
    documentContent: string;
    hasChanges: boolean;
    hasNameChanges: boolean;
    zoomLevel: number;
    autoSaveEnabled: boolean;
    
    // UI State
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    isDraggingSidebar: boolean;
    scrollToHeadingId: string | null;

    // Data Cache (SQLite)
    collections: Collection[];
    documentsByCollection: Map<number, Document[]>;
    foldersByCollection: Map<number, Folder[]>;
    documentsByFolder: Map<number, Document[]>;

    // Data Cache (Filesystem)
    storageType: "sqlite" | "filesystem";
    storagePending: boolean;
    workspaceRoots: TreeNode[];
    selectedFsDoc: TreeNode | null;

    // MCP State
    mcpRunning: boolean;
    mcpPending: boolean;
    mcpFlash: boolean;

    // Actions
    setSelectedDocument: (doc: Document | null) => void;
    setDocumentName: (name: string) => void;
    setDocumentContent: (content: string) => void;
    setHasChanges: (has: boolean) => void;
    setHasNameChanges: (has: boolean) => void;
    setZoomLevel: (level: number) => void;
    setAutoSaveEnabled: (enabled: boolean) => void;

    setSidebarCollapsed: (collapsed: boolean) => void;
    setSidebarWidth: (width: number) => void;
    setIsDraggingSidebar: (isDragging: boolean) => void;
    setScrollToHeadingId: (id: string | null) => void;

    setCollections: (collections: Collection[]) => void;
    setDocumentsByCollection: (map: Map<number, Document[]> | ((prev: Map<number, Document[]>) => Map<number, Document[]>)) => void;
    setFoldersByCollection: (map: Map<number, Folder[]> | ((prev: Map<number, Folder[]>) => Map<number, Folder[]>)) => void;
    setDocumentsByFolder: (map: Map<number, Document[]> | ((prev: Map<number, Document[]>) => Map<number, Document[]>)) => void;
    
    setStorageType: (type: "sqlite" | "filesystem") => void;
    setStoragePending: (pending: boolean) => void;
    setWorkspaceRoots: (roots: TreeNode[]) => void;
    setSelectedFsDoc: (doc: TreeNode | null) => void;

    setMcpRunning: (running: boolean) => void;
    setMcpPending: (pending: boolean) => void;
    setMcpFlash: (flash: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
    selectedDocument: null,
    documentName: "",
    documentContent: "",
    hasChanges: false,
    hasNameChanges: false,
    zoomLevel: 1.0,
    autoSaveEnabled: localStorage.getItem("markdown-ui-auto-save") === "true",

    sidebarCollapsed: false,
    sidebarWidth: 320,
    isDraggingSidebar: false,
    scrollToHeadingId: null,

    collections: [],
    documentsByCollection: new Map(),
    foldersByCollection: new Map(),
    documentsByFolder: new Map(),

    storageType: "sqlite",
    storagePending: false,
    workspaceRoots: [],
    selectedFsDoc: null,

    mcpRunning: false,
    mcpPending: false,
    mcpFlash: false,

    setSelectedDocument: (doc) => set({ selectedDocument: doc }),
    setDocumentName: (name) => set({ documentName: name }),
    setDocumentContent: (content) => set({ documentContent: content }),
    setHasChanges: (has) => set({ hasChanges: has }),
    setHasNameChanges: (has) => set({ hasNameChanges: has }),
    setZoomLevel: (level) => set({ zoomLevel: level }),
    setAutoSaveEnabled: (enabled) => {
        localStorage.setItem("markdown-ui-auto-save", enabled ? "true" : "false");
        set({ autoSaveEnabled: enabled });
    },

    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    setIsDraggingSidebar: (isDragging) => set({ isDraggingSidebar: isDragging }),
    setScrollToHeadingId: (id) => set({ scrollToHeadingId: id }),

    setCollections: (collections) => set({ collections }),
    setDocumentsByCollection: (updater) => set((state) => ({
        documentsByCollection: typeof updater === 'function' ? updater(state.documentsByCollection) : updater
    })),
    setFoldersByCollection: (updater) => set((state) => ({
        foldersByCollection: typeof updater === 'function' ? updater(state.foldersByCollection) : updater
    })),
    setDocumentsByFolder: (updater) => set((state) => ({
        documentsByFolder: typeof updater === 'function' ? updater(state.documentsByFolder) : updater
    })),

    setStorageType: (type) => set({ storageType: type }),
    setStoragePending: (pending) => set({ storagePending: pending }),
    setWorkspaceRoots: (roots) => set({ workspaceRoots: roots }),
    setSelectedFsDoc: (doc) => set({ selectedFsDoc: doc }),

    setMcpRunning: (running) => set({ mcpRunning: running }),
    setMcpPending: (pending) => set({ mcpPending: pending }),
    setMcpFlash: (flash) => set({ mcpFlash: flash }),
}));
