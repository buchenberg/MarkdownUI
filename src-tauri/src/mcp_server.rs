//! Embedded MCP (Model Context Protocol) HTTP server for MarkdownUI.
//!
//! Exposes the filesystem-backed document store over a JSON-RPC 2.0 endpoint at
//! `http://localhost:3333/mcp` using the Streamable HTTP transport defined by
//! the MCP spec. The server shares the same `Arc<FilesystemStorage>` that the
//! Tauri commands use.
//!
//! Tools exposed (path/file-centric):
//!   list_roots, list_directory, get_entry, read_file,
//!   create_file, update_file, create_directory,
//!   rename_entry, delete_entry, move_entry, search
//!
//! After each write operation, a Tauri event (`mcp-operation`) is emitted
//! so the frontend can animate the changes in real time.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tower_http::cors::{Any, CorsLayer};

use crate::filesystem::FilesystemStorage;

// ── Shared state ─────────────────────────────────────────────────────────────

/// State shared between the MCP HTTP server and the Tauri event system.
pub struct McpState {
    pub fs: Arc<FilesystemStorage>,
    pub app_handle: AppHandle,
}

// ── JSON-RPC 2.0 wire types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

impl JsonRpcResponse {
    fn ok(id: Option<Value>, result: Value) -> Self {
        Self { jsonrpc: "2.0".into(), id, result: Some(result), error: None }
    }
    fn err(id: Option<Value>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(JsonRpcError { code, message: message.into() }),
        }
    }
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn build_router(fs: Arc<FilesystemStorage>, app_handle: AppHandle) -> Router {
    let state = Arc::new(McpState { fs, app_handle });

    let cors = CorsLayer::new()
        .allow_methods([Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .allow_origin(Any);

    Router::new()
        .route("/mcp", post(handle_mcp))
        .layer(cors)
        .with_state(state)
}

// ── Request handler ───────────────────────────────────────────────────────────

async fn handle_mcp(
    State(state): State<Arc<McpState>>,
    _headers: HeaderMap,
    Json(req): Json<JsonRpcRequest>,
) -> Response {
    if req.jsonrpc != "2.0" {
        return (
            StatusCode::BAD_REQUEST,
            Json(JsonRpcResponse::err(req.id, -32600, "Invalid JSON-RPC version")),
        )
            .into_response();
    }

    let resp = dispatch(state, req.id, &req.method, req.params).await;
    Json(resp).into_response()
}

async fn dispatch(
    state: Arc<McpState>,
    id: Option<Value>,
    method: &str,
    params: Option<Value>,
) -> JsonRpcResponse {
    let p = params.unwrap_or(json!({}));

    match method {
        // ── MCP lifecycle ──────────────────────────────────────────────────
        "initialize" => JsonRpcResponse::ok(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": {
                    "name": "markdownui-mcp",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        ),

        "notifications/initialized" => {
            // fire-and-forget notification — no response body needed
            JsonRpcResponse::ok(id, json!(null))
        }

        "tools/list" => JsonRpcResponse::ok(id, json!({ "tools": tools_manifest() })),

        "tools/call" => handle_tool_call(state, id, p).await,

        _ => JsonRpcResponse::err(id, -32601, format!("Method not found: {method}")),
    }
}

// ── Tool manifest ─────────────────────────────────────────────────────────────

fn tools_manifest() -> Value {
    json!([
        {
            "name": "list_roots",
            "description": "List all registered root folders",
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "list_directory",
            "description": "List the children (folders and .md documents) of a directory",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute path of the directory" } },
                "required": ["path"]
            }
        },
        {
            "name": "get_entry",
            "description": "Get a file (with content) or folder metadata by absolute path",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
            "name": "read_file",
            "description": "Read the markdown content of a .md file",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
            "name": "create_file",
            "description": "Create a new .md document (extension appended automatically if missing)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "parent_path": { "type": "string" },
                    "name": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["parent_path", "name", "content"]
            }
        },
        {
            "name": "update_file",
            "description": "Update a document's content (and rename it if `name` changed)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "name": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "name", "content"]
            }
        },
        {
            "name": "create_directory",
            "description": "Create a new subdirectory inside a parent directory",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "parent_path": { "type": "string" },
                    "name": { "type": "string" }
                },
                "required": ["parent_path", "name"]
            }
        },
        {
            "name": "rename_entry",
            "description": "Rename a file or folder (kept in place)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "new_name": { "type": "string" }
                },
                "required": ["path", "new_name"]
            }
        },
        {
            "name": "delete_entry",
            "description": "Delete a file or folder (recursive for folders)",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
            "name": "move_entry",
            "description": "Move a file or folder into a new parent directory. Only works within the same volume.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "new_parent_path": { "type": "string" }
                },
                "required": ["path", "new_parent_path"]
            }
        },
        {
            "name": "search",
            "description": "Search documents by filename or content across all root folders",
            "inputSchema": {
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }
        }
    ])
}

// ── MCP event payload ──────────────────────────────────────────────────────

/// Emitted to the frontend via `app_handle.emit("mcp-operation", …)`
/// after each write operation so the UI can animate the change.
#[derive(Debug, Serialize, Clone)]
struct McpEvent {
    operation: String,
    id: String,
    name: String,
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async fn handle_tool_call(state: Arc<McpState>, id: Option<Value>, params: Value) -> JsonRpcResponse {
    let name = match params.get("name").and_then(Value::as_str) {
        Some(n) => n.to_owned(),
        None => return JsonRpcResponse::err(id, -32602, "Missing tool name"),
    };
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    let result = tokio::task::spawn_blocking(move || run_tool(state, &name, args))
        .await
        .unwrap_or_else(|e| Err(format!("Task panicked: {e}")));

    match result {
        Ok(content) => JsonRpcResponse::ok(
            id,
            json!({ "content": [{ "type": "text", "text": content }] }),
        ),
        Err(msg) => JsonRpcResponse::err(id, -32000, msg),
    }
}

/// Runs synchronously (called via spawn_blocking so it won't block the async runtime).
fn run_tool(state: Arc<McpState>, name: &str, args: Value) -> Result<String, String> {
    let fs = &state.fs;

    // Helper: emit an event through the main window
    let emit_event = |event: McpEvent| {
        if let Some(window) = state.app_handle.get_window("main") {
            let _ = window.emit("mcp-operation", &event);
        }
    };

    match name {
        "list_roots" => {
            let roots = fs.list_roots()?;
            Ok(serde_json::to_string_pretty(&roots).unwrap())
        }

        "list_directory" => {
            let path = get_str(&args, "path")?;
            let children = fs.list_children(&path)?;
            Ok(serde_json::to_string_pretty(&children).unwrap())
        }

        "get_entry" => {
            let path = get_str(&args, "path")?;
            match fs.get_entry(&path)? {
                Some(entry) => Ok(serde_json::to_string_pretty(&entry).unwrap()),
                None => Err(format!("Entry not found: {path}")),
            }
        }

        "read_file" => {
            let path = get_str(&args, "path")?;
            match fs.get_entry(&path)? {
                Some(entry) => match entry.content {
                    Some(c) => Ok(c),
                    None => Err(format!("Not a readable file: {path}")),
                },
                None => Err(format!("File not found: {path}")),
            }
        }

        "create_file" => {
            let parent_path = get_str(&args, "parent_path")?;
            let file_name = get_str(&args, "name")?;
            let content = get_str(&args, "content")?;
            let doc = fs.create_document(&parent_path, &file_name, &content)?;
            let result = serde_json::to_string_pretty(&doc).unwrap();
            emit_event(McpEvent {
                operation: "create_file".into(),
                id: doc.id.clone(),
                name: doc.name.clone(),
            });
            Ok(result)
        }

        "update_file" => {
            let path = get_str(&args, "path")?;
            let file_name = get_str(&args, "name")?;
            let content = get_str(&args, "content")?;
            let doc = fs.update_document(&path, &file_name, &content)?;
            let result = serde_json::to_string_pretty(&doc).unwrap();
            emit_event(McpEvent {
                operation: "update_file".into(),
                id: doc.id.clone(),
                name: doc.name.clone(),
            });
            Ok(result)
        }

        "create_directory" => {
            let parent_path = get_str(&args, "parent_path")?;
            let dir_name = get_str(&args, "name")?;
            let folder = fs.create_folder(&parent_path, &dir_name)?;
            let result = serde_json::to_string_pretty(&folder).unwrap();
            emit_event(McpEvent {
                operation: "create_directory".into(),
                id: folder.id.clone(),
                name: folder.name.clone(),
            });
            Ok(result)
        }

        "rename_entry" => {
            let path = get_str(&args, "path")?;
            let new_name = get_str(&args, "new_name")?;
            let entry = fs.rename_entry(&path, &new_name)?;
            let result = serde_json::to_string_pretty(&entry).unwrap();
            emit_event(McpEvent {
                operation: "rename_entry".into(),
                id: entry.id.clone(),
                name: entry.name.clone(),
            });
            Ok(result)
        }

        "delete_entry" => {
            let path = get_str(&args, "path")?;
            let ok = fs.delete_entry(&path)?;
            emit_event(McpEvent {
                operation: "delete_entry".into(),
                id: path,
                name: String::new(),
            });
            Ok(format!("{{\"deleted\": {ok}}}"))
        }

        "move_entry" => {
            let path = get_str(&args, "path")?;
            let new_parent_path = get_str(&args, "new_parent_path")?;
            let entry = fs.move_entry(&path, &new_parent_path)?;
            let result = serde_json::to_string_pretty(&entry).unwrap();
            emit_event(McpEvent {
                operation: "move_entry".into(),
                id: entry.id.clone(),
                name: entry.name.clone(),
            });
            Ok(result)
        }

        "search" => {
            let query = get_str(&args, "query")?;
            let results = fs.search(&query)?;
            Ok(serde_json::to_string_pretty(&results).unwrap())
        }

        other => Err(format!("Unknown tool: {other}")),
    }
}

// ── Argument helpers ──────────────────────────────────────────────────────────

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| format!("Missing or invalid argument: {key}"))
}
