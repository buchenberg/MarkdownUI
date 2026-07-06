// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod converter;
mod mcp_server;
mod storage;
mod filesystem;
mod config;

use converter::{ExportFormat, convert_markdown, check_chrome_available, convert_html_to_pdf};
use storage::TreeNode;
use storage::SearchResult;
use filesystem::FilesystemStorage;
use config::StorageConfig;
use std::sync::{Arc, Mutex, RwLock};
use std::fs;
use tauri::{State, Manager};
use tauri::api::path::app_data_dir;
use tokio::task::JoinHandle;

/// Holds the join-handle of the running axum server, or None when stopped.
struct McpServerState(Mutex<Option<JoinHandle<()>>>);

/// The single filesystem-backed storage backend.
type FsArc = Arc<FilesystemStorage>;
type FsState<'a> = State<'a, FsArc>;

// ── Unified storage commands ─────────────────────────────────────────────────

#[tauri::command]
fn storage_list_roots(backend: FsState) -> Result<Vec<TreeNode>, String> {
    backend.list_roots()
}

#[tauri::command]
fn storage_add_root(backend: FsState, name: String, extra: Option<String>) -> Result<TreeNode, String> {
    backend.add_root(&name, extra.as_deref())
}

#[tauri::command]
fn storage_remove_root(backend: FsState, id: String) -> Result<bool, String> {
    backend.remove_root(&id)
}

#[tauri::command]
fn storage_get_entry(backend: FsState, id: String) -> Result<Option<TreeNode>, String> {
    backend.get_entry(&id)
}

#[tauri::command]
fn storage_list_children(backend: FsState, parent_id: String) -> Result<Vec<TreeNode>, String> {
    backend.list_children(&parent_id)
}

#[tauri::command]
fn storage_create_folder(
    backend: FsState,
    parent_id: String,
    name: String,
) -> Result<TreeNode, String> {
    backend.create_folder(&parent_id, &name)
}

#[tauri::command]
fn storage_create_document(
    backend: FsState,
    parent_id: String,
    name: String,
    content: String,
) -> Result<TreeNode, String> {
    backend.create_document(&parent_id, &name, &content)
}

#[tauri::command]
fn storage_update_document(
    backend: FsState,
    id: String,
    name: String,
    content: String,
) -> Result<TreeNode, String> {
    backend.update_document(&id, &name, &content)
}

#[tauri::command]
fn storage_rename_entry(backend: FsState, id: String, new_name: String) -> Result<TreeNode, String> {
    backend.rename_entry(&id, &new_name)
}

#[tauri::command]
fn storage_delete_entry(backend: FsState, id: String) -> Result<bool, String> {
    backend.delete_entry(&id)
}

#[tauri::command]
fn storage_move_entry(backend: FsState, id: String, new_parent_id: String) -> Result<TreeNode, String> {
    backend.move_entry(&id, &new_parent_id)
}

#[tauri::command]
fn storage_search(backend: FsState, query: String) -> Result<Vec<SearchResult>, String> {
    backend.search(&query)
}

#[tauri::command]
fn storage_export_document(
    backend: FsState,
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
    fs_arc: State<'_, FsArc>,
) -> Result<(), String> {
    // Check if already running — drop the guard before any .await
    {
        let guard = mcp_state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(()); // already running
        }
    } // guard dropped here

    let router = mcp_server::build_router(Arc::clone(&fs_arc), app_handle);

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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get app data directory
            let app_data_dir = app_data_dir(&app.config())
                .ok_or_else(|| "Failed to get app data directory")?;

            // Load or create storage config
            let storage_config = StorageConfig::load(&app_data_dir);
            let config_arc = Arc::new(RwLock::new(storage_config));

            // Single filesystem-backed storage backend
            let backend: FsArc = Arc::new(FilesystemStorage::new(
                config_arc,
                app_data_dir.clone(),
            ));

            // Manage state
            app.manage(backend);                               // FilesystemStorage
            app.manage(McpServerState(Mutex::new(None)));      // MCP server handle

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            storage_export_document,
            check_pdf_available,
            start_mcp_server,
            stop_mcp_server,
            get_mcp_server_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
