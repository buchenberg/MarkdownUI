//! Embedded MCP (Model Context Protocol) HTTP server for MarkdownUI.
//!
//! Exposes all collections and documents over a JSON-RPC 2.0 endpoint at
//! `http://localhost:3333/mcp` using the Streamable HTTP transport defined by
//! the MCP spec.  The server shares the same `Arc<Mutex<Database>>` that the
//! Tauri commands already use, so there is no second DB connection.
//!
//! Tools exposed (matching the Node.js mcp-server reference):
//!   list_collections, get_collection, list_documents, get_document,
//!   create_document, update_document, delete_document,
//!   create_collection, update_collection, delete_collection,
//!   search_documents
//!
//! After each write operation, a Tauri event (`mcp-operation`) is emitted
//! so the frontend can animate the changes in real time.

use std::sync::{Arc, Mutex};

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

use crate::database::Database;

// ── Shared state ─────────────────────────────────────────────────────────────

pub type DbArc = Arc<Mutex<Database>>;

/// State shared between the MCP HTTP server and the Tauri event system.
pub struct McpState {
    pub db: DbArc,
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

pub fn build_router(db: DbArc, app_handle: AppHandle) -> Router {
    let state = Arc::new(McpState { db, app_handle });

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
            "name": "list_collections",
            "description": "List all collections in MarkdownUI",
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "get_collection",
            "description": "Get a single collection by ID",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "number", "description": "Collection ID" } },
                "required": ["id"]
            }
        },
        {
            "name": "create_collection",
            "description": "Create a new collection",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["name"]
            }
        },
        {
            "name": "update_collection",
            "description": "Update an existing collection",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["id", "name"]
            }
        },
        {
            "name": "delete_collection",
            "description": "Delete a collection and all its documents",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "number" } },
                "required": ["id"]
            }
        },
        {
            "name": "list_documents",
            "description": "List all documents in a collection",
            "inputSchema": {
                "type": "object",
                "properties": { "collection_id": { "type": "number" } },
                "required": ["collection_id"]
            }
        },
        {
            "name": "get_document",
            "description": "Get a single document by ID (includes full content)",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "number" } },
                "required": ["id"]
            }
        },
        {
            "name": "create_document",
            "description": "Create a new document in a collection",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "collection_id": { "type": "number" },
                    "name": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["collection_id", "name", "content"]
            }
        },
        {
            "name": "update_document",
            "description": "Update a document's name and/or content",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "number" },
                    "name": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["id", "name", "content"]
            }
        },
        {
            "name": "delete_document",
            "description": "Delete a document by ID",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "number" } },
                "required": ["id"]
            }
        },
        {
            "name": "search_documents",
            "description": "Search documents by name or content across all collections",
            "inputSchema": {
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }
        }
    ])
}

// ── MCP event payload ──────────────────────────────────────────────────────

/// Emitted to the frontend via `app_handle.emit_all("mcp-operation", …)`
/// after each write operation so the UI can animate the change.
#[derive(Debug, Serialize, Clone)]
struct McpEvent {
    operation: String,
    id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    collection_id: Option<i64>,
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
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Helper: emit an event through the main window
    let emit_event = |event: McpEvent| {
        if let Some(window) = state.app_handle.get_window("main") {
            let _ = window.emit("mcp-operation", &event);
        }
    };

    match name {
        "list_collections" => {
            let cols = db.get_all_collections().map_err(|e| e.to_string())?;
            Ok(serde_json::to_string_pretty(&cols).unwrap())
        }

        "get_collection" => {
            let id = get_i64(&args, "id")?;
            match db.get_collection(id).map_err(|e| e.to_string())? {
                Some(c) => Ok(serde_json::to_string_pretty(&c).unwrap()),
                None => Err(format!("Collection {id} not found")),
            }
        }

        "create_collection" => {
            let name = get_str(&args, "name")?;
            let description = args.get("description").and_then(Value::as_str).map(String::from);
            let col = db.create_collection(name, description).map_err(|e| e.to_string())?;
            let result = serde_json::to_string_pretty(&col).unwrap();
            emit_event(McpEvent {
                operation: "create_collection".into(),
                id: col.id,
                collection_id: None,
                name: col.name.clone(),
            });
            Ok(result)
        }

        "update_collection" => {
            let id = get_i64(&args, "id")?;
            let name = get_str(&args, "name")?;
            let description = args.get("description").and_then(Value::as_str).map(String::from);
            let col = db.update_collection(id, name, description).map_err(|e| e.to_string())?;
            let result = serde_json::to_string_pretty(&col).unwrap();
            emit_event(McpEvent {
                operation: "update_collection".into(),
                id: col.id,
                collection_id: None,
                name: col.name.clone(),
            });
            Ok(result)
        }

        "delete_collection" => {
            let id = get_i64(&args, "id")?;
            // Capture name before deletion
            let name = db.get_collection(id)
                .map_err(|e| e.to_string())?
                .map(|c| c.name)
                .unwrap_or_default();
            let ok = db.delete_collection(id).map_err(|e| e.to_string())?;
            emit_event(McpEvent {
                operation: "delete_collection".into(),
                id,
                collection_id: None,
                name,
            });
            Ok(format!("{{\"deleted\": {ok}}}"))
        }

        "list_documents" => {
            let collection_id = get_i64(&args, "collection_id")?;
            let docs = db
                .get_documents_by_collection(collection_id)
                .map_err(|e| e.to_string())?;
            // Omit content to keep list responses compact
            let slim: Vec<Value> = docs
                .iter()
                .map(|d| json!({
                    "id": d.id,
                    "collection_id": d.collection_id,
                    "name": d.name,
                    "created_at": d.created_at,
                    "updated_at": d.updated_at,
                }))
                .collect();
            Ok(serde_json::to_string_pretty(&slim).unwrap())
        }

        "get_document" => {
            let id = get_i64(&args, "id")?;
            match db.get_document(id).map_err(|e| e.to_string())? {
                Some(d) => Ok(serde_json::to_string_pretty(&d).unwrap()),
                None => Err(format!("Document {id} not found")),
            }
        }

        "create_document" => {
            let collection_id = get_i64(&args, "collection_id")?;
            let name = get_str(&args, "name")?;
            let content = get_str(&args, "content")?;
            let doc = db
                .create_document(collection_id, name, content)
                .map_err(|e| e.to_string())?;
            let result = serde_json::to_string_pretty(&doc).unwrap();
            emit_event(McpEvent {
                operation: "create_document".into(),
                id: doc.id,
                collection_id: Some(doc.collection_id),
                name: doc.name.clone(),
            });
            Ok(result)
        }

        "update_document" => {
            let id = get_i64(&args, "id")?;
            let name = get_str(&args, "name")?;
            let content = get_str(&args, "content")?;
            let doc = db.update_document(id, name, content).map_err(|e| e.to_string())?;
            let result = serde_json::to_string_pretty(&doc).unwrap();
            emit_event(McpEvent {
                operation: "update_document".into(),
                id: doc.id,
                collection_id: Some(doc.collection_id),
                name: doc.name.clone(),
            });
            Ok(result)
        }

        "delete_document" => {
            let id = get_i64(&args, "id")?;
            // Capture collection_id and name before deletion
            let doc_info = db.get_document(id).map_err(|e| e.to_string())?;
            let collection_id = doc_info.as_ref().map(|d| d.collection_id);
            let name = doc_info.map(|d| d.name).unwrap_or_default();
            let ok = db.delete_document(id).map_err(|e| e.to_string())?;
            emit_event(McpEvent {
                operation: "delete_document".into(),
                id,
                collection_id,
                name,
            });
            Ok(format!("{{\"deleted\": {ok}}}"))
        }

        "search_documents" => {
            let query = get_str(&args, "query")?;
            let results = db.search_documents(&query).map_err(|e| e.to_string())?;
            Ok(serde_json::to_string_pretty(&results).unwrap())
        }

        other => Err(format!("Unknown tool: {other}")),
    }
}

// ── Argument helpers ──────────────────────────────────────────────────────────

fn get_i64(args: &Value, key: &str) -> Result<i64, String> {
    args.get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("Missing or invalid argument: {key}"))
}

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| format!("Missing or invalid argument: {key}"))
}
