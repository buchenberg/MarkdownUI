import { invoke } from "@tauri-apps/api/tauri";
import { save, open } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TreeNode {
    id: string;
    parent_id: string | null;
    name: string;
    kind: "folder" | "document";
    content?: string;
    created_at: string;
    updated_at: string;
}

export interface SearchResult {
    id: string;
    name: string;
    parent_id: string | null;
    kind: "folder" | "document";
    created_at: string;
    updated_at: string;
    matched_line: string;
}

export type ExportFormat = "html" | "pdf";

// ── Filesystem storage API ───────────────────────────────────────────────────

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

export async function searchEntries(query: string): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("storage_search", { query });
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportDocToFile(
    id: string,
    format: ExportFormat,
    outputPath: string,
): Promise<void> {
    return invoke<void>("storage_export_document", { id, format, outputPath });
}

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

export async function getMcpPort(): Promise<number> {
    return invoke<number>("get_mcp_port");
}

export async function setMcpPort(port: number): Promise<void> {
    return invoke<void>("set_mcp_port", { port });
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
