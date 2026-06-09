import { invoke } from "@tauri-apps/api/tauri";
import { save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

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

// Collections API
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

// Documents API
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

// Markdown Export API
export async function exportMarkdown(
    markdownContent: string,
    defaultName: string,
): Promise<boolean> {
    try {
        // Show save dialog
        const filePath = await save({
            defaultPath: defaultName,
            filters: [
                {
                    name: "Markdown Files",
                    extensions: ["md"],
                },
            ],
        });

        if (!filePath) {
            // User cancelled the dialog
            return false;
        }

        // Write the Markdown content to the selected file
        await writeTextFile(filePath, markdownContent);
        return true;
    } catch (error) {
        console.error("Export failed:", error);
        throw error;
    }
}

// Document Export API
export type ExportFormat = "html" | "pdf";

// ── Folder API ────────────────────────────────────────────────────────────────

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

// ── MCP Server API ────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
    return invoke<void>("start_mcp_server");
}

export async function stopMcpServer(): Promise<void> {
    return invoke<void>("stop_mcp_server");
}

export async function getMcpServerStatus(): Promise<boolean> {
    return invoke<boolean>("get_mcp_server_status");
}

// ─────────────────────────────────────────────────────────────────────────────

// Check if PDF export is available (Chrome installed)
export async function checkPdfAvailable(): Promise<boolean> {
    try {
        return await invoke<boolean>("check_pdf_available");
    } catch {
        return false;
    }
}

export async function exportDocument(
    documentId: number,
    format: ExportFormat,
    defaultName: string,
): Promise<boolean> {
    try {
        // Map format to file extension and filter name
        const formatInfo: Record<ExportFormat, { ext: string; name: string }> = {
            html: { ext: "html", name: "HTML Files" },
            pdf: { ext: "pdf", name: "PDF Files" },
        };

        const { ext, name: filterName } = formatInfo[format];

        // Show save dialog
        const filePath = await save({
            defaultPath: `${defaultName}.${ext}`,
            filters: [
                {
                    name: filterName,
                    extensions: [ext],
                },
            ],
        });

        if (!filePath) {
            // User cancelled the dialog
            return false;
        }

        // Call Tauri backend to convert and save
        await invoke("export_document", {
            documentId,
            format,
            outputPath: filePath,
        });

        return true;
    } catch (error) {
        console.error("Export failed:", error);
        throw error;
    }
}
