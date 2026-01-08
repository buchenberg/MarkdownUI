// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod converter;

use database::Database;
use converter::{ExportFormat, convert_markdown, check_chrome_available, convert_html_to_pdf};
use std::sync::Mutex;
use std::fs;
use tauri::{State, Manager};
use tauri::api::path::app_data_dir;

type DbState<'a> = State<'a, Mutex<Database>>;

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
    collection_id: i64,
    name: String,
    content: String,
) -> Result<database::Document, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.create_document(collection_id, name, content).map_err(|e| e.to_string())
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

/// Check if PDF export is available (Chrome installed)
#[tauri::command]
fn check_pdf_available() -> Result<bool, String> {
    check_chrome_available().map(|_| true)
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
            
            // Initialize database
            let database = Database::new(app_data_dir)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            
            app.manage(Mutex::new(database));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            check_pdf_available,
            export_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
