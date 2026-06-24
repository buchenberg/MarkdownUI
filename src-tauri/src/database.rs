use rusqlite::{Connection, Result as SqliteResult, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::{Path, PathBuf};

use crate::storage::{StorageBackend, TreeNode, TreeNodeKind};

#[derive(Debug, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: i64,
    pub collection_id: i64,
    pub parent_folder_id: Option<i64>,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: i64,
    pub collection_id: i64,
    pub folder_id: Option<i64>,
    pub name: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: i64,
    pub collection_id: i64,
    pub collection_name: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> SqliteResult<Self> {
        // Ensure app data directory exists
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(format!("Failed to create app data directory: {}", e))
            ))?;
        
        let db_path = app_data_dir.join("markdown-ui.db");
        let conn = Connection::open(&db_path)?;
        
        let db = Database {
            conn: Mutex::new(conn),
        };
        
        db.init()?;
        Ok(db)
    }
    
    fn init(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();

        // Enable WAL mode for concurrent reads (MCP server shares this DB)
        // and enforce foreign keys
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;"
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            rusqlite::params![],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
            )",
            rusqlite::params![],
        )?;
        
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id)",
            rusqlite::params![],
        )?;

        // --- Folders table (nested organization within collections) ---
        conn.execute(
            "CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_id INTEGER NOT NULL,
                parent_folder_id INTEGER,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE CASCADE
            )",
            rusqlite::params![],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_folders_collection ON folders(collection_id)",
            rusqlite::params![],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id)",
            rusqlite::params![],
        )?;

        // Add folder_id to documents (safe migration — silently skips if column exists)
        let _ = conn.execute(
            "ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE",
            rusqlite::params![],
        );
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)",
            rusqlite::params![],
        )?;

        // FTS5 full-text search index on documents
        // Uses external content table so FTS reads directly from 'documents'
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                name, content, content=documents, content_rowid=id
            )",
            rusqlite::params![],
        )?;

        // Triggers to keep FTS index in sync with documents table
        conn.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS documents_fts_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
             END;
             CREATE TRIGGER IF NOT EXISTS documents_fts_ad AFTER DELETE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, name, content) VALUES('delete', old.id, old.name, old.content);
             END;
             CREATE TRIGGER IF NOT EXISTS documents_fts_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, name, content) VALUES('delete', old.id, old.name, old.content);
                INSERT INTO documents_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
             END;"
        )?;

        // Populate FTS index with existing documents (idempotent — 'INSERT OR REPLACE' semantics via rebuild)
        conn.execute(
            "INSERT INTO documents_fts(documents_fts) VALUES('rebuild')",
            rusqlite::params![],
        )?;
        
        // Create default collection if none exists
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM collections",
            rusqlite::params![],
            |row| row.get(0),
        )?;
        
        if count == 0 {
            conn.execute(
                "INSERT INTO collections (name, description) VALUES (?, ?)",
                rusqlite::params!["Default Collection", "Your default collection of documents"],
            )?;
        }
        
        Ok(())
    }
    
    pub fn get_all_collections(&self) -> SqliteResult<Vec<Collection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at, updated_at FROM collections ORDER BY created_at DESC"
        )?;
        
        let collections = stmt.query_map(rusqlite::params![], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<SqliteResult<Vec<_>>>()?;
        
        Ok(collections)
    }
    
    pub fn get_collection(&self, id: i64) -> SqliteResult<Option<Collection>> {
        let conn = self.conn.lock().unwrap();
        Self::get_collection_internal(&conn, id)
    }
    
    fn get_collection_internal(conn: &Connection, id: i64) -> SqliteResult<Option<Collection>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?"
        )?;
        
        let collection = stmt.query_row(rusqlite::params![id], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        }).optional()?;
        
        Ok(collection)
    }
    
    pub fn create_collection(&self, name: String, description: Option<String>) -> SqliteResult<Collection> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO collections (name, description, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            rusqlite::params![name, description],
        )?;
        
        let id = conn.last_insert_rowid();
        Self::get_collection_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }
    
    pub fn update_collection(&self, id: i64, name: String, description: Option<String>) -> SqliteResult<Collection> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE collections SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![name, description, id],
        )?;
        
        Self::get_collection_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }
    
    pub fn delete_collection(&self, id: i64) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();
        let changes = conn.execute("DELETE FROM collections WHERE id = ?", rusqlite::params![id])?;
        Ok(changes > 0)
    }
    
    // ── Documents ────────────────────────────────────────────────────────────
    
    pub fn get_documents_by_collection(&self, collection_id: i64) -> SqliteResult<Vec<Document>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, folder_id, name, content, created_at, updated_at FROM documents WHERE collection_id = ? ORDER BY created_at DESC"
        )?;
        
        let documents = stmt.query_map(rusqlite::params![collection_id], |row| {
            Ok(Document {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                folder_id: row.get(2)?,
                name: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<SqliteResult<Vec<_>>>()?;
        
        Ok(documents)
    }
    
    pub fn get_document(&self, id: i64) -> SqliteResult<Option<Document>> {
        let conn = self.conn.lock().unwrap();
        Self::get_document_internal(&conn, id)
    }
    
    fn get_document_internal(conn: &Connection, id: i64) -> SqliteResult<Option<Document>> {
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, folder_id, name, content, created_at, updated_at FROM documents WHERE id = ?"
        )?;
        
        let document = stmt.query_row(rusqlite::params![id], |row| {
            Ok(Document {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                folder_id: row.get(2)?,
                name: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).optional()?;
        
        Ok(document)
    }
    
    pub fn create_document(&self, collection_id: i64, folder_id: Option<i64>, name: String, content: String) -> SqliteResult<Document> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO documents (collection_id, folder_id, name, content, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
            rusqlite::params![collection_id, folder_id, name, content],
        )?;
        
        let id = conn.last_insert_rowid();
        Self::get_document_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }
    
    pub fn update_document(&self, id: i64, name: String, content: String) -> SqliteResult<Document> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE documents SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![name, content, id],
        )?;
        
        Self::get_document_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }
    
    pub fn delete_document(&self, id: i64) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();
        let changes = conn.execute("DELETE FROM documents WHERE id = ?", rusqlite::params![id])?;
        Ok(changes > 0)
    }

    pub fn move_document(&self, id: i64, folder_id: Option<i64>) -> SqliteResult<Document> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE documents SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![folder_id, id],
        )?;
        Self::get_document_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_documents_by_folder(&self, folder_id: i64) -> SqliteResult<Vec<Document>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, folder_id, name, content, created_at, updated_at FROM documents WHERE folder_id = ? ORDER BY created_at DESC"
        )?;
        let docs = stmt.query_map(rusqlite::params![folder_id], |row| {
            Ok(Document {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                folder_id: row.get(2)?,
                name: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        Ok(docs)
    }

    // ── Folders ──────────────────────────────────────────────────────────────

    pub fn create_folder(&self, collection_id: i64, parent_folder_id: Option<i64>, name: String) -> SqliteResult<Folder> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO folders (collection_id, parent_folder_id, name, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            rusqlite::params![collection_id, parent_folder_id, name],
        )?;
        let id = conn.last_insert_rowid();
        Self::get_folder_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }

    fn get_folder_internal(conn: &Connection, id: i64) -> SqliteResult<Option<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE id = ?"
        )?;
        stmt.query_row(rusqlite::params![id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                parent_folder_id: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }).optional()
    }

    pub fn get_folder(&self, id: i64) -> SqliteResult<Option<Folder>> {
        let conn = self.conn.lock().unwrap();
        Self::get_folder_internal(&conn, id)
    }

    pub fn get_folders_by_collection(&self, collection_id: i64) -> SqliteResult<Vec<Folder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE collection_id = ? ORDER BY name"
        )?;
        let folders = stmt.query_map(rusqlite::params![collection_id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                parent_folder_id: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        Ok(folders)
    }

    pub fn get_folders_by_parent(&self, parent_folder_id: i64) -> SqliteResult<Vec<Folder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, parent_folder_id, name, created_at, updated_at FROM folders WHERE parent_folder_id = ? ORDER BY name"
        )?;
        let folders = stmt.query_map(rusqlite::params![parent_folder_id], |row| {
            Ok(Folder {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                parent_folder_id: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        Ok(folders)
    }

    pub fn update_folder(&self, id: i64, name: String) -> SqliteResult<Folder> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![name, id],
        )?;
        Self::get_folder_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn delete_folder(&self, id: i64) -> SqliteResult<bool> {
        let conn = self.conn.lock().unwrap();
        // CASCADE handles children: sub-folders AND documents inside are deleted automatically.
        // No manual cleanup needed — SQLite enforces the FK constraints.
        let changes = conn.execute("DELETE FROM folders WHERE id = ?", rusqlite::params![id])?;
        Ok(changes > 0)
    }

    pub fn move_folder(&self, id: i64, parent_folder_id: Option<i64>) -> SqliteResult<Folder> {
        let conn = self.conn.lock().unwrap();

        // Guard 1: prevent self-parenting (moving a folder into itself)
        if parent_folder_id == Some(id) {
            return Err(rusqlite::Error::InvalidParameterName(
                "Cannot move a folder into itself".into(),
            ));
        }

        // Guard 2: prevent cycles — walk up from the target parent; if we reach `id`, it's a cycle
        if let Some(mut ancestor_id) = parent_folder_id {
            let mut stmt = conn.prepare("SELECT parent_folder_id FROM folders WHERE id = ?")?;
            loop {
                let parent: Option<Option<i64>> = stmt
                    .query_row(rusqlite::params![ancestor_id], |row| row.get(0))
                    .optional()?;
                match parent {
                    Some(Some(pid)) if pid == id => {
                        return Err(rusqlite::Error::InvalidParameterName(
                            "Cannot move a folder into one of its descendants".into(),
                        ));
                    }
                    Some(Some(pid)) => ancestor_id = pid,
                    _ => break,
                }
            }
        }

        // Guard 3: if moving to a parent folder, ensure same collection
        if let Some(pid) = parent_folder_id {
            let target_coll: Option<i64> = conn
                .query_row(
                    "SELECT collection_id FROM folders WHERE id = ?",
                    rusqlite::params![pid],
                    |row| row.get(0),
                )
                .optional()?;
            let source_coll: Option<i64> = conn
                .query_row(
                    "SELECT collection_id FROM folders WHERE id = ?",
                    rusqlite::params![id],
                    |row| row.get(0),
                )
                .optional()?;
            if let (Some(tc), Some(sc)) = (target_coll, source_coll) {
                if tc != sc {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "Cannot move a folder to a different collection".into(),
                    ));
                }
            }
        }

        conn.execute(
            "UPDATE folders SET parent_folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![parent_folder_id, id],
        )?;
        Self::get_folder_internal(&conn, id)
            .and_then(|opt| opt.ok_or_else(|| rusqlite::Error::QueryReturnedNoRows))
    }

    /// Full-text search across documents by name and content.
    /// Uses the FTS5 index for sub-millisecond lookups regardless of dataset size.
    pub fn search_documents(&self, query: &str) -> SqliteResult<Vec<SearchResult>> {
        let conn = self.conn.lock().unwrap();

        // Escape special FTS5 characters and wrap each term in quotes for exact matching
        let sanitized: String = query
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect();
        let terms: Vec<String> = sanitized
            .split_whitespace()
            .map(|t| format!("\"{}\"", t.replace('"', "")))
            .collect();

        if terms.is_empty() {
            return Ok(Vec::new());
        }

        let fts_query = terms.join(" AND ");
        let mut stmt = conn.prepare(
            "SELECT d.id, d.collection_id, c.name AS collection_name, d.name, d.created_at, d.updated_at
             FROM documents_fts fts
             JOIN documents d ON d.id = fts.rowid
             JOIN collections c ON c.id = d.collection_id
             WHERE documents_fts MATCH ?
             ORDER BY rank
             LIMIT 100"
        )?;

        let results = stmt.query_map(rusqlite::params![fts_query], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                collection_name: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<SqliteResult<Vec<_>>>()?;

        Ok(results)
    }

    /// Recursively export collection contents to a directory on disk.
    pub fn export_collection_contents(&self, collection_id: i64, dir: &Path) -> SqliteResult<()> {
        let folders = self.get_folders_by_collection(collection_id)?;
        let root_folders: Vec<_> = folders.iter().filter(|f| f.parent_folder_id.is_none()).collect();
        let docs = self.get_documents_by_collection(collection_id)?;
        let root_docs: Vec<_> = docs.iter().filter(|d| d.folder_id.is_none()).collect();

        for doc in &root_docs {
            let file_path = dir.join(sanitize_filename(&doc.name, "md"));
            std::fs::write(&file_path, &doc.content)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to write {}: {}", file_path.display(), e)),
                ))?;
        }

        for folder in &root_folders {
            let sub_dir = dir.join(sanitize_filename(&folder.name, ""));
            std::fs::create_dir_all(&sub_dir)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to create {}: {}", sub_dir.display(), e)),
                ))?;
            self.export_folder_contents(folder.id, &sub_dir)?;
        }

        Ok(())
    }

    fn export_folder_contents(&self, folder_id: i64, dir: &Path) -> SqliteResult<()> {
        let child_folders = self.get_folders_by_parent(folder_id)?;
        let docs = self.get_documents_by_folder(folder_id)?;

        for doc in &docs {
            let file_path = dir.join(sanitize_filename(&doc.name, "md"));
            std::fs::write(&file_path, &doc.content)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to write {}: {}", file_path.display(), e)),
                ))?;
        }

        for folder in &child_folders {
            let sub_dir = dir.join(sanitize_filename(&folder.name, ""));
            std::fs::create_dir_all(&sub_dir)
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to create {}: {}", sub_dir.display(), e)),
                ))?;
            self.export_folder_contents(folder.id, &sub_dir)?;
        }

        Ok(())
    }
}

/// Convert a name to a filesystem-safe filename, appending extension if provided.
fn sanitize_filename(name: &str, ext: &str) -> String {
    let safe: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = safe.trim();
    if trimmed.is_empty() {
        return format!("untitled.{}", ext);
    }
    if ext.is_empty() {
        trimmed.to_string()
    } else {
        format!("{}.{}", trimmed, ext)
    }
}

// ── ID helpers ────────────────────────────────────────────────────────────────

fn col_id(id: i64) -> String { format!("col:{}", id) }
fn fld_id(id: i64) -> String { format!("fld:{}", id) }
fn doc_id(id: i64) -> String { format!("doc:{}", id) }

fn parse_prefixed_id(id: &str) -> Option<(char, i64)> {
    let (prefix, num) = id.split_once(':')?;
    Some((prefix.chars().next()?, num.parse().ok()?))
}

fn require_prefix(id: &str, expected: char) -> Result<i64, String> {
    let (prefix, n) = parse_prefixed_id(id)
        .ok_or_else(|| format!("Invalid ID format: {}", id))?;
    if prefix != expected {
        return Err(format!("Expected {} ID, got {}: {}", expected, prefix, id));
    }
    Ok(n)
}

// ── StorageBackend trait implementation ────────────────────────────────────────

impl StorageBackend for Database {
    fn list_roots(&self) -> Result<Vec<TreeNode>, String> {
        let collections = self.get_all_collections().map_err(|e| e.to_string())?;
        collections
            .into_iter()
            .map(|c| {
                Ok(TreeNode {
                    id: col_id(c.id),
                    parent_id: None,
                    name: c.name,
                    kind: TreeNodeKind::Folder,
                    content: None,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                })
            })
            .collect()
    }

    fn add_root(&self, name: &str, extra: Option<&str>) -> Result<TreeNode, String> {
        let c = self
            .create_collection(name.to_string(), extra.map(|s| s.to_string()))
            .map_err(|e| e.to_string())?;
        Ok(TreeNode {
            id: col_id(c.id),
            parent_id: None,
            name: c.name,
            kind: TreeNodeKind::Folder,
            content: None,
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
    }

    fn remove_root(&self, id: &str) -> Result<bool, String> {
        let n = require_prefix(id, 'c')?;
        self.delete_collection(n).map_err(|e| e.to_string())
    }

    fn get_entry(&self, id: &str) -> Result<Option<TreeNode>, String> {
        let (prefix, n) = match parse_prefixed_id(id) {
            Some(p) => p,
            None => return Ok(None),
        };
        match prefix {
            'c' => self
                .get_collection(n)
                .map_err(|e| e.to_string())
                .map(|opt| {
                    opt.map(|c| TreeNode {
                        id: col_id(c.id),
                        parent_id: None,
                        name: c.name,
                        kind: TreeNodeKind::Folder,
                        content: None,
                        created_at: c.created_at,
                        updated_at: c.updated_at,
                    })
                }),
            'f' => self
                .get_folder(n)
                .map_err(|e| e.to_string())
                .map(|opt| {
                    opt.map(|f| TreeNode {
                        id: fld_id(f.id),
                        parent_id: f.parent_folder_id.map(|pid| fld_id(pid)),
                        name: f.name,
                        kind: TreeNodeKind::Folder,
                        content: None,
                        created_at: f.created_at,
                        updated_at: f.updated_at,
                    })
                }),
            'd' => self
                .get_document(n)
                .map_err(|e| e.to_string())
                .map(|opt| {
                    opt.map(|d| TreeNode {
                        id: doc_id(d.id),
                        parent_id: d.folder_id.map(|fid| fld_id(fid)),
                        name: d.name,
                        kind: TreeNodeKind::Document,
                        content: Some(d.content),
                        created_at: d.created_at,
                        updated_at: d.updated_at,
                    })
                }),
            _ => Ok(None),
        }
    }

    fn list_children(&self, parent_id: &str) -> Result<Vec<TreeNode>, String> {
        let (prefix, n) = parse_prefixed_id(parent_id)
            .ok_or_else(|| format!("Invalid parent ID: {}", parent_id))?;

        let mut results: Vec<TreeNode> = Vec::new();

        match prefix {
            'c' => {
                let folders = self
                    .get_folders_by_collection(n)
                    .map_err(|e| e.to_string())?;
                let root_folders: Vec<_> = folders.into_iter().filter(|f| f.parent_folder_id.is_none()).collect();
                for f in root_folders {
                    results.push(TreeNode {
                        id: fld_id(f.id),
                        parent_id: Some(col_id(n)),
                        name: f.name,
                        kind: TreeNodeKind::Folder,
                        content: None,
                        created_at: f.created_at,
                        updated_at: f.updated_at,
                    });
                }
                let docs = self
                    .get_documents_by_collection(n)
                    .map_err(|e| e.to_string())?;
                for d in docs.into_iter().filter(|d| d.folder_id.is_none()) {
                    results.push(TreeNode {
                        id: doc_id(d.id),
                        parent_id: Some(col_id(n)),
                        name: d.name,
                        kind: TreeNodeKind::Document,
                        content: None,
                        created_at: d.created_at,
                        updated_at: d.updated_at,
                    });
                }
            }
            'f' => {
                let child_folders = self
                    .get_folders_by_parent(n)
                    .map_err(|e| e.to_string())?;
                for f in child_folders {
                    results.push(TreeNode {
                        id: fld_id(f.id),
                        parent_id: Some(fld_id(n)),
                        name: f.name,
                        kind: TreeNodeKind::Folder,
                        content: None,
                        created_at: f.created_at,
                        updated_at: f.updated_at,
                    });
                }
                let docs = self
                    .get_documents_by_folder(n)
                    .map_err(|e| e.to_string())?;
                for d in docs {
                    results.push(TreeNode {
                        id: doc_id(d.id),
                        parent_id: Some(fld_id(n)),
                        name: d.name,
                        kind: TreeNodeKind::Document,
                        content: None,
                        created_at: d.created_at,
                        updated_at: d.updated_at,
                    });
                }
            }
            'd' => {
                // documents have no children
            }
            _ => return Err(format!("Unknown ID prefix: {}", parent_id)),
        }

        results.sort_by(|a, b| {
            a.kind
                .cmp(&b.kind)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(results)
    }

    fn create_folder(&self, parent_id: &str, name: &str) -> Result<TreeNode, String> {
        let (prefix, n) = parse_prefixed_id(parent_id)
            .ok_or_else(|| format!("Invalid parent ID: {}", parent_id))?;

        let (collection_id, parent_folder_id) = match prefix {
            'c' => (n, None),
            'f' => {
                let folder = self
                    .get_folder(n)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("Folder not found: {}", parent_id))?;
                (folder.collection_id, Some(n))
            }
            _ => return Err(format!("Cannot create folder under a document: {}", parent_id)),
        };

        let f = self
            .create_folder(collection_id, parent_folder_id, name.to_string())
            .map_err(|e| e.to_string())?;
        Ok(TreeNode {
            id: fld_id(f.id),
            parent_id: f.parent_folder_id.map(|pid| fld_id(pid)),
            name: f.name,
            kind: TreeNodeKind::Folder,
            content: None,
            created_at: f.created_at,
            updated_at: f.updated_at,
        })
    }

    fn create_document(
        &self,
        parent_id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String> {
        let (prefix, n) = parse_prefixed_id(parent_id)
            .ok_or_else(|| format!("Invalid parent ID: {}", parent_id))?;

        let (collection_id, folder_id) = match prefix {
            'c' => (n, None),
            'f' => {
                let folder = self
                    .get_folder(n)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("Folder not found: {}", parent_id))?;
                (folder.collection_id, Some(n))
            }
            _ => return Err(format!("Cannot create document under a document: {}", parent_id)),
        };

        let d = self
            .create_document(collection_id, folder_id, name.to_string(), content.to_string())
            .map_err(|e| e.to_string())?;
        Ok(TreeNode {
            id: doc_id(d.id),
            parent_id: d.folder_id.map(|fid| fld_id(fid)),
            name: d.name,
            kind: TreeNodeKind::Document,
            content: Some(d.content),
            created_at: d.created_at,
            updated_at: d.updated_at,
        })
    }

    fn update_document(
        &self,
        id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String> {
        let n = require_prefix(id, 'd')?;
        let d = self
            .update_document(n, name.to_string(), content.to_string())
            .map_err(|e| e.to_string())?;
        Ok(TreeNode {
            id: doc_id(d.id),
            parent_id: d.folder_id.map(|fid| fld_id(fid)),
            name: d.name,
            kind: TreeNodeKind::Document,
            content: Some(d.content),
            created_at: d.created_at,
            updated_at: d.updated_at,
        })
    }

    fn rename_entry(&self, id: &str, new_name: &str) -> Result<TreeNode, String> {
        let (prefix, n) = parse_prefixed_id(id)
            .ok_or_else(|| format!("Invalid ID: {}", id))?;
        match prefix {
            'c' => {
                let existing = self
                    .get_collection(n)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("Collection not found: {}", id))?;
                let c = self
                    .update_collection(n, new_name.to_string(), existing.description)
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: col_id(c.id),
                    parent_id: None,
                    name: c.name,
                    kind: TreeNodeKind::Folder,
                    content: None,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                })
            }
            'f' => {
                let f = self
                    .update_folder(n, new_name.to_string())
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: fld_id(f.id),
                    parent_id: f.parent_folder_id.map(|pid| fld_id(pid)),
                    name: f.name,
                    kind: TreeNodeKind::Folder,
                    content: None,
                    created_at: f.created_at,
                    updated_at: f.updated_at,
                })
            }
            'd' => {
                let existing = self
                    .get_document(n)
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| format!("Document not found: {}", id))?;
                let d = self
                    .update_document(n, new_name.to_string(), existing.content)
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: doc_id(d.id),
                    parent_id: d.folder_id.map(|fid| fld_id(fid)),
                    name: d.name,
                    kind: TreeNodeKind::Document,
                    content: Some(d.content),
                    created_at: d.created_at,
                    updated_at: d.updated_at,
                })
            }
            _ => Err(format!("Unknown ID prefix: {}", id)),
        }
    }

    fn delete_entry(&self, id: &str) -> Result<bool, String> {
        let (prefix, n) = parse_prefixed_id(id)
            .ok_or_else(|| format!("Invalid ID: {}", id))?;
        match prefix {
            'c' => self.delete_collection(n).map_err(|e| e.to_string()),
            'f' => self.delete_folder(n).map_err(|e| e.to_string()),
            'd' => self.delete_document(n).map_err(|e| e.to_string()),
            _ => Err(format!("Unknown ID prefix: {}", id)),
        }
    }

    fn move_entry(&self, id: &str, new_parent_id: &str) -> Result<TreeNode, String> {
        let (src_prefix, src_n) = parse_prefixed_id(id)
            .ok_or_else(|| format!("Invalid source ID: {}", id))?;
        let (dst_prefix, dst_n) = parse_prefixed_id(new_parent_id)
            .ok_or_else(|| format!("Invalid destination ID: {}", new_parent_id))?;

        match (src_prefix, dst_prefix) {
            ('d', 'f') => {
                let d = self
                    .move_document(src_n, Some(dst_n))
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: doc_id(d.id),
                    parent_id: d.folder_id.map(|fid| fld_id(fid)),
                    name: d.name,
                    kind: TreeNodeKind::Document,
                    content: None,
                    created_at: d.created_at,
                    updated_at: d.updated_at,
                })
            }
            ('d', 'c') => {
                let d = self
                    .move_document(src_n, None)
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: doc_id(d.id),
                    parent_id: Some(col_id(dst_n)),
                    name: d.name,
                    kind: TreeNodeKind::Document,
                    content: None,
                    created_at: d.created_at,
                    updated_at: d.updated_at,
                })
            }
            ('f', 'f') => {
                let f = self
                    .move_folder(src_n, Some(dst_n))
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: fld_id(f.id),
                    parent_id: f.parent_folder_id.map(|pid| fld_id(pid)),
                    name: f.name,
                    kind: TreeNodeKind::Folder,
                    content: None,
                    created_at: f.created_at,
                    updated_at: f.updated_at,
                })
            }
            ('f', 'c') => {
                let f = self
                    .move_folder(src_n, None)
                    .map_err(|e| e.to_string())?;
                Ok(TreeNode {
                    id: fld_id(f.id),
                    parent_id: Some(col_id(dst_n)),
                    name: f.name,
                    kind: TreeNodeKind::Folder,
                    content: None,
                    created_at: f.created_at,
                    updated_at: f.updated_at,
                })
            }
            _ => Err(format!(
                "Cannot move {} to {} ({}, {})",
                id, new_parent_id, src_prefix, dst_prefix
            )),
        }
    }

    fn search(&self, query: &str) -> Result<Vec<TreeNode>, String> {
        let results = self.search_documents(query).map_err(|e| e.to_string())?;
        results
            .into_iter()
            .map(|r| {
                Ok(TreeNode {
                    id: doc_id(r.id),
                    parent_id: None, // search results don't carry folder context
                    name: r.name,
                    kind: TreeNodeKind::Document,
                    content: None,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
            })
            .collect()
    }

    fn export_root_to_filesystem(&self, root_id: &str, target_path: &Path) -> Result<(), String> {
        let n = require_prefix(root_id, 'c')?;
        let collection = self
            .get_collection(n)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Collection not found: {}", root_id))?;

        let root_dir = target_path.join(&collection.name);
        std::fs::create_dir_all(&root_dir)
            .map_err(|e| format!("Failed to create directory {}: {}", root_dir.display(), e))?;

        self.export_collection_contents(n, &root_dir)
            .map_err(|e| e.to_string())
    }
}
