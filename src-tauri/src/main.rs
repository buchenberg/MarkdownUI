// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod converter;
mod mcp_server;
mod storage;
mod filesystem;
mod config;

use database::Database;
use converter::{ExportFormat, convert_markdown, check_chrome_available, convert_html_to_pdf};
use mcp_server::DbArc;
use storage::{StorageBackend, TreeNode};
use filesystem::FilesystemStorage;
use config::StorageConfig;
use std::sync::{Arc, Mutex, RwLock};
use std::fs;
use std::path::PathBuf;
use serde_json::{json, Value};
use tauri::{State, Manager};
use tauri::api::path::app_data_dir;
use tokio::task::JoinHandle;

/// Holds the join-handle of the running axum server, or None when stopped.
struct McpServerState(Mutex<Option<JoinHandle<()>>>);

type DbState<'a> = State<'a, DbArc>;

/// Holds the application configuration, accessible from both Tauri commands and MCP server.
type ConfigState<'a> = State<'a, Arc<RwLock<StorageConfig>>>;

// ── Storage type commands ─────────────────────────────────────────────────────

#[tauri::command]
fn get_storage_type(config: ConfigState) -> Result<String, String> {
    let cfg = config.read().map_err(|e| e.to_string())?;
    Ok(cfg.storage_type.clone())
}

#[tauri::command]
fn set_storage_type(config: ConfigState, app_data_dir: State<'_, AppDataDir>, storage_type: String) -> Result<(), String> {
    let mut cfg = config.write().map_err(|e| e.to_string())?;
    if storage_type != "sqlite" && storage_type != "filesystem" {
        return Err(format!("Invalid storage type: {}. Must be 'sqlite' or 'filesystem'.", storage_type));
    }
    cfg.set_storage_type(&storage_type);
    cfg.save(&app_data_dir.0)?;
    Ok(())
}

// Storage path is determined at startup and stored in state
struct AppDataDir(pub PathBuf);

/// The active storage backend, initialized based on config at startup.
type BackendArc = Arc<dyn StorageBackend>;
type BackendState<'a> = State<'a, BackendArc>;

// ── Unified storage commands (trait-based) ────────────────────────────────────

#[tauri::command]
fn storage_list_roots(backend: BackendState) -> Result<Vec<TreeNode>, String> {
    backend.list_roots()
}

#[tauri::command]
fn storage_add_root(backend: BackendState, name: String, extra: Option<String>) -> Result<TreeNode, String> {
    backend.add_root(&name, extra.as_deref())
}

#[tauri::command]
fn storage_remove_root(backend: BackendState, id: String) -> Result<bool, String> {
    backend.remove_root(&id)
}

#[tauri::command]
fn storage_get_entry(backend: BackendState, id: String) -> Result<Option<TreeNode>, String> {
    backend.get_entry(&id)
}

#[tauri::command]
fn storage_list_children(backend: BackendState, parent_id: String) -> Result<Vec<TreeNode>, String> {
    backend.list_children(&parent_id)
}

#[tauri::command]
fn storage_create_folder(
    backend: BackendState,
    parent_id: String,
    name: String,
) -> Result<TreeNode, String> {
    backend.create_folder(&parent_id, &name)
}

#[tauri::command]
fn storage_create_document(
    backend: BackendState,
    parent_id: String,
    name: String,
    content: String,
) -> Result<TreeNode, String> {
    backend.create_document(&parent_id, &name, &content)
}

#[tauri::command]
fn storage_update_document(
    backend: BackendState,
    id: String,
    name: String,
    content: String,
) -> Result<TreeNode, String> {
    backend.update_document(&id, &name, &content)
}

#[tauri::command]
fn storage_rename_entry(backend: BackendState, id: String, new_name: String) -> Result<TreeNode, String> {
    backend.rename_entry(&id, &new_name)
}

#[tauri::command]
fn storage_delete_entry(backend: BackendState, id: String) -> Result<bool, String> {
    backend.delete_entry(&id)
}

#[tauri::command]
fn storage_move_entry(backend: BackendState, id: String, new_parent_id: String) -> Result<TreeNode, String> {
    backend.move_entry(&id, &new_parent_id)
}

#[tauri::command]
fn storage_search(backend: BackendState, query: String) -> Result<Vec<TreeNode>, String> {
    backend.search(&query)
}

#[tauri::command]
fn storage_export_root(
    backend: BackendState,
    root_id: String,
    target_path: String,
) -> Result<(), String> {
    backend.export_root_to_filesystem(&root_id, &PathBuf::from(target_path))
}

#[tauri::command]
fn storage_export_document(
    backend: BackendState,
    id: String,
    format: String,
    output_path: String,
) -> Result<(), String> {
    let entry = backend.get_entry(&id)?
        .ok_or_else(|| format!("Entry not found: {}", id))?;
    let content = entry.content.ok_or_else(|| "Entry is not a document".to_string())?;

    let export_format = ExportFormat::from_str(&format)?;
    match export_format {
        ExportFormat::Html => {
            let output_bytes = convert_markdown(&content, &export_format)?;
            fs::write(&output_path, output_bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
        ExportFormat::Pdf => {
            let html_bytes = convert_markdown(&content, &ExportFormat::Html)?;
            let html = String::from_utf8_lossy(&html_bytes).to_string();
            // We need an async context for chromiumoxide; spawn a blocking task
            let pdf_bytes = tokio::runtime::Handle::current()
                .block_on(convert_html_to_pdf(&html))?;
            fs::write(&output_path, pdf_bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }
    Ok(())
}

// Collections commands
#[tauri::command]
fn get_collections(db: DbState) -> Result<Vec<database::Collection>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_all_collections().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_collection(db: DbState, id: i64) -> Result<Option<database::Collection>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_collection(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_collection(
    db: DbState,
    name: String,
    description: Option<String>,
) -> Result<database::Collection, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.create_collection(name, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_collection(
    db: DbState,
    id: i64,
    name: String,
    description: Option<String>,
) -> Result<database::Collection, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.update_collection(id, name, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_collection(db: DbState, id: i64) -> Result<bool, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.delete_collection(id).map_err(|e| e.to_string())
}

// Documents commands
#[tauri::command]
fn get_documents_by_collection(db: DbState, collection_id: i64) -> Result<Vec<database::Document>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_documents_by_collection(collection_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_document(db: DbState, id: i64) -> Result<Option<database::Document>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_document(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_document(
    db: DbState,
    collectionId: i64,
    folderId: Option<i64>,
    name: String,
    content: String,
) -> Result<database::Document, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.create_document(collectionId, folderId, name, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_document(
    db: DbState,
    id: i64,
    name: String,
    content: String,
) -> Result<database::Document, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.update_document(id, name, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_document(db: DbState, id: i64) -> Result<bool, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.delete_document(id).map_err(|e| e.to_string())
}

// ── Folder commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn create_folder(
    db: DbState,
    collectionId: i64,
    parentFolderId: Option<i64>,
    name: String,
) -> Result<database::Folder, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.create_folder(collectionId, parentFolderId, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_folders_by_collection(db: DbState, collectionId: i64) -> Result<Vec<database::Folder>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_folders_by_collection(collectionId).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_folder(db: DbState, id: i64, name: String) -> Result<database::Folder, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.update_folder(id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_folder(db: DbState, id: i64) -> Result<bool, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.delete_folder(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_documents_by_folder(db: DbState, folderId: i64) -> Result<Vec<database::Document>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_documents_by_folder(folderId).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_document(db: DbState, id: i64, folderId: Option<i64>) -> Result<database::Document, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.move_document(id, folderId).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_folder(db: DbState, id: i64) -> Result<Option<database::Folder>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.get_folder(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_folder(db: DbState, id: i64, parentFolderId: Option<i64>) -> Result<database::Folder, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.move_folder(id, parentFolderId).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_folder_contents(db: DbState, folderId: i64) -> Result<Value, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let folders = db.get_folders_by_parent(folderId).map_err(|e| e.to_string())?;
    let docs = db.get_documents_by_folder(folderId).map_err(|e| e.to_string())?;
    let slim_docs: Vec<Value> = docs.iter().map(|d| json!({
        "id": d.id,
        "collection_id": d.collection_id,
        "folder_id": d.folder_id,
        "name": d.name,
        "created_at": d.created_at,
        "updated_at": d.updated_at,
    })).collect();
    Ok(json!({ "folders": folders, "documents": slim_docs }))
}

/// Check if PDF export is available (Chrome installed)
#[tauri::command]
fn check_pdf_available() -> Result<bool, String> {
    check_chrome_available().map(|_| true)
}

// ── MCP server commands ───────────────────────────────────────────────────────

#[tauri::command]
async fn start_mcp_server(
    app_handle: tauri::AppHandle,
    mcp_state: State<'_, McpServerState>,
    db_arc: State<'_, DbArc>,
) -> Result<(), String> {
    // Check if already running — drop the guard before any .await
    {
        let guard = mcp_state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(()); // already running
        }
    } // guard dropped here

    let router = mcp_server::build_router(Arc::clone(&db_arc), app_handle);

    // Async bind happens with no mutex held
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3333")
        .await
        .map_err(|e| format!("Failed to bind MCP port 3333: {e}"))?;

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    // Re-lock to store the handle
    let mut guard = mcp_state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(handle);
    Ok(())
}

#[tauri::command]
fn stop_mcp_server(mcp_state: State<'_, McpServerState>) -> Result<(), String> {
    let mut handle_guard = mcp_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = handle_guard.take() {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
fn get_mcp_server_status(mcp_state: State<'_, McpServerState>) -> Result<bool, String> {
    let handle_guard = mcp_state.0.lock().map_err(|e| e.to_string())?;
    Ok(handle_guard.is_some())
}

/// Export a document to the specified format (html, pdf)
#[tauri::command]
async fn export_document(
    db: DbState<'_>,
    document_id: i64,
    format: String,
    output_path: String,
) -> Result<(), String> {
    // Get document from database
    let document = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.get_document(document_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Document {} not found", document_id))?
    };
    
    // Parse format
    let export_format = ExportFormat::from_str(&format)?;
    
    // Convert and write based on format
    match export_format {
        ExportFormat::Html => {
            let output_bytes = convert_markdown(&document.content, &export_format)?;
            fs::write(&output_path, output_bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
        ExportFormat::Pdf => {
            // First convert to HTML, then to PDF
            let html_bytes = convert_markdown(&document.content, &ExportFormat::Html)?;
            let html = String::from_utf8_lossy(&html_bytes).to_string();
            let pdf_bytes = convert_html_to_pdf(&html).await?;
            fs::write(&output_path, pdf_bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get app data directory
            let app_data_dir = app_data_dir(&app.config())
                .ok_or_else(|| "Failed to get app data directory")?;
            
            // Load or create storage config
            let storage_config = StorageConfig::load(&app_data_dir);
            let config_arc = Arc::new(RwLock::new(storage_config.clone()));
            
            // Build the active storage backend based on config
            let backend: BackendArc = match storage_config.storage_type.as_str() {
                "filesystem" => {
                    Arc::new(FilesystemStorage::new(
                        Arc::clone(&config_arc),
                        app_data_dir.clone(),
                    ))
                }
                _ => {
                    // SQLite mode: use the shared database instance
                    Arc::new(Database::new(app_data_dir.clone())
                        .map_err(|e| format!("Failed to initialize database: {}", e))?)
                }
            };

            // We also keep a DbArc for the MCP server (which still uses Database directly).
            // In SQLite mode this opens a second WAL connection to the same file, which is fine.
            let db_arc: DbArc = Arc::new(Mutex::new(
                Database::new(app_data_dir.clone())
                    .map_err(|e| format!("Failed to initialize MCP database: {}", e))?,
            ));

            // Manage state
            app.manage(backend);                               // StorageBackend (unified commands)
            app.manage(config_arc);                            // StorageConfig
            app.manage(AppDataDir(app_data_dir));               // Config directory path
            app.manage(db_arc);                                // MCP server database
            app.manage(McpServerState(Mutex::new(None)));     // MCP server handle
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_storage_type,
            set_storage_type,
            storage_list_roots,
            storage_add_root,
            storage_remove_root,
            storage_get_entry,
            storage_list_children,
            storage_create_folder,
            storage_create_document,
            storage_update_document,
            storage_rename_entry,
            storage_delete_entry,
            storage_move_entry,
            storage_search,
            storage_export_root,
            storage_export_document,
            get_collections,
            get_collection,
            create_collection,
            update_collection,
            delete_collection,
            get_documents_by_collection,
            get_document,
            create_document,
            update_document,
            delete_document,
            create_folder,
            get_folders_by_collection,
            update_folder,
            delete_folder,
            get_documents_by_folder,
            move_document,
            get_folder,
            move_folder,
            list_folder_contents,
            check_pdf_available,
            export_document,
            start_mcp_server,
            stop_mcp_server,
            get_mcp_server_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
