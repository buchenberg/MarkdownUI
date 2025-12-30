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

export interface Document {
    id: number;
    collection_id: number;
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
    name: string,
    content: string,
): Promise<Document> {
    return invoke<Document>("create_document", { collectionId, name, content });
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
