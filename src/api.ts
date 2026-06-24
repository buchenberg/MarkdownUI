import { invoke } from "@tauri-apps/api/tauri";
import { save, open } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

// ── Legacy types (SQLite backend) ────────────────────────────────────────────

export interface Collection {
    id: number;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface Folder {
    id: number;
    collection_id: number;
    parent_folder_id: number | null;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface Document {
    id: number;
    collection_id: number;
    folder_id: number | null;
    name: string;
    content: string;
    created_at: string;
    updated_at: string;
}

// ── Unified types (StorageBackend trait) ─────────────────────────────────────

export interface TreeNode {
    id: string;
    parent_id: string | null;
    name: string;
    kind: "folder" | "document";
    content?: string;
    created_at: string;
    updated_at: string;
}

export type ExportFormat = "html" | "pdf";

// ── Storage config ──────────────────────────────────────────────────────────

export async function getStorageType(): Promise<"sqlite" | "filesystem"> {
    return invoke<string>("get_storage_type") as Promise<"sqlite" | "filesystem">;
}

export async function setStorageType(type: "sqlite" | "filesystem"): Promise<void> {
    return invoke<void>("set_storage_type", { storageType: type });
}

// ── Unified API (StorageBackend-based) ──────────────────────────────────────

export async function listRoots(): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("storage_list_roots");
}

export async function addRoot(name: string, extra?: string): Promise<TreeNode> {
    return invoke<TreeNode>("storage_add_root", { name, extra: extra ?? null });
}

export async function removeRoot(id: string): Promise<boolean> {
    return invoke<boolean>("storage_remove_root", { id });
}

export async function getEntry(id: string): Promise<TreeNode | null> {
    return invoke<TreeNode | null>("storage_get_entry", { id });
}

export async function listChildren(parentId: string): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("storage_list_children", { parentId });
}

export async function createFolderEntry(
    parentId: string,
    name: string,
): Promise<TreeNode> {
    return invoke<TreeNode>("storage_create_folder", { parentId, name });
}

export async function createDocEntry(
    parentId: string,
    name: string,
    content: string,
): Promise<TreeNode> {
    return invoke<TreeNode>("storage_create_document", { parentId, name, content });
}

export async function updateDoc(
    id: string,
    name: string,
    content: string,
): Promise<TreeNode> {
    return invoke<TreeNode>("storage_update_document", { id, name, content });
}

export async function renameEntry(id: string, newName: string): Promise<TreeNode> {
    return invoke<TreeNode>("storage_rename_entry", { id, newName });
}

export async function deleteEntry(id: string): Promise<boolean> {
    return invoke<boolean>("storage_delete_entry", { id });
}

export async function moveEntry(id: string, newParentId: string): Promise<TreeNode> {
    return invoke<TreeNode>("storage_move_entry", { id, newParentId });
}

export async function searchEntries(query: string): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("storage_search", { query });
}

export async function exportRootToFilesystem(
    rootId: string,
    targetPath: string,
): Promise<void> {
    return invoke<void>("storage_export_root", { rootId, targetPath });
}

export async function exportDocToFile(
    id: string,
    format: ExportFormat,
    outputPath: string,
): Promise<void> {
    return invoke<void>("storage_export_document", { id, format, outputPath });
}

// ── Legacy API (SQLite backend — kept for backward compat) ───────────────────

export async function getCollections(): Promise<Collection[]> {
    return invoke<Collection[]>("get_collections");
}

export async function getCollection(id: number): Promise<Collection | null> {
    return invoke<Collection | null>("get_collection", { id });
}

export async function createCollection(
    name: string,
    description?: string,
): Promise<Collection> {
    return invoke<Collection>("create_collection", {
        name,
        description: description || null,
    });
}

export async function updateCollection(
    id: number,
    name: string,
    description?: string,
): Promise<Collection> {
    return invoke<Collection>("update_collection", {
        id,
        name,
        description: description || null,
    });
}

export async function deleteCollection(id: number): Promise<boolean> {
    return invoke<boolean>("delete_collection", { id });
}

export async function getDocumentsByCollection(
    collectionId: number,
): Promise<Document[]> {
    return invoke<Document[]>("get_documents_by_collection", { collectionId });
}

export async function getDocument(id: number): Promise<Document | null> {
    return invoke<Document | null>("get_document", { id });
}

export async function createDocument(
    collectionId: number,
    folderId: number | null,
    name: string,
    content: string,
): Promise<Document> {
    return invoke<Document>("create_document", { collectionId, folderId, name, content });
}

export async function updateDocument(
    id: number,
    name: string,
    content: string,
): Promise<Document> {
    return invoke<Document>("update_document", { id, name, content });
}

export async function deleteDocument(id: number): Promise<boolean> {
    return invoke<boolean>("delete_document", { id });
}

export async function createFolder(
    collectionId: number,
    parentFolderId: number | null,
    name: string,
): Promise<Folder> {
    return invoke<Folder>("create_folder", { collectionId, parentFolderId, name });
}

export async function getFoldersByCollection(collectionId: number): Promise<Folder[]> {
    return invoke<Folder[]>("get_folders_by_collection", { collectionId });
}

export async function updateFolder(id: number, name: string): Promise<Folder> {
    return invoke<Folder>("update_folder", { id, name });
}

export async function deleteFolder(id: number): Promise<boolean> {
    return invoke<boolean>("delete_folder", { id });
}

export async function getDocumentsByFolder(folderId: number): Promise<Document[]> {
    return invoke<Document[]>("get_documents_by_folder", { folderId });
}

export async function moveDocument(id: number, folderId: number | null): Promise<Document> {
    return invoke<Document>("move_document", { id, folderId });
}

export async function getFolder(id: number): Promise<Folder | null> {
    return invoke<Folder | null>("get_folder", { id });
}

export async function moveFolder(id: number, parentFolderId: number | null): Promise<Folder> {
    return invoke<Folder>("move_folder", { id, parentFolderId });
}

export async function listFolderContents(folderId: number): Promise<{ folders: Folder[]; documents: Document[] }> {
    return invoke<{ folders: Folder[]; documents: Document[] }>("list_folder_contents", { folderId });
}

// ── Markdown Export ──────────────────────────────────────────────────────────

export async function exportMarkdown(
    markdownContent: string,
    defaultName: string,
): Promise<boolean> {
    try {
        const filePath = await save({
            defaultPath: defaultName,
            filters: [{ name: "Markdown Files", extensions: ["md"] }],
        });
        if (!filePath) return false;
        await writeTextFile(filePath, markdownContent);
        return true;
    } catch (error) {
        console.error("Export failed:", error);
        throw error;
    }
}

// ── Document Export (legacy) ─────────────────────────────────────────────────

export async function exportDocument(
    documentId: number,
    format: ExportFormat,
    defaultName: string,
): Promise<boolean> {
    try {
        const formatInfo: Record<ExportFormat, { ext: string; name: string }> = {
            html: { ext: "html", name: "HTML Files" },
            pdf: { ext: "pdf", name: "PDF Files" },
        };
        const { ext, name: filterName } = formatInfo[format];
        const filePath = await save({
            defaultPath: `${defaultName}.${ext}`,
            filters: [{ name: filterName, extensions: [ext] }],
        });
        if (!filePath) return false;
        await invoke("export_document", { documentId, format, outputPath: filePath });
        return true;
    } catch (error) {
        console.error("Export failed:", error);
        throw error;
    }
}

// ── MCP Server ──────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
    return invoke<void>("start_mcp_server");
}

export async function stopMcpServer(): Promise<void> {
    return invoke<void>("stop_mcp_server");
}

export async function getMcpServerStatus(): Promise<boolean> {
    return invoke<boolean>("get_mcp_server_status");
}

// ── PDF availability ─────────────────────────────────────────────────────────

export async function checkPdfAvailable(): Promise<boolean> {
    try {
        return await invoke<boolean>("check_pdf_available");
    } catch {
        return false;
    }
}

// ── Folder picker ────────────────────────────────────────────────────────────

export async function pickDirectory(): Promise<string | null> {
    const selected = await open({ directory: true, multiple: false });
    if (Array.isArray(selected)) return selected[0] ?? null;
    return selected ?? null;
}
