use rusqlite::{Connection, Result as SqliteResult, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: i64,
    pub collection_id: i64,
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
    
    pub fn get_documents_by_collection(&self, collection_id: i64) -> SqliteResult<Vec<Document>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, content, created_at, updated_at FROM documents WHERE collection_id = ? ORDER BY created_at DESC"
        )?;
        
        let documents = stmt.query_map(rusqlite::params![collection_id], |row| {
            Ok(Document {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                name: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
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
            "SELECT id, collection_id, name, content, created_at, updated_at FROM documents WHERE id = ?"
        )?;
        
        let document = stmt.query_row(rusqlite::params![id], |row| {
            Ok(Document {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                name: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }).optional()?;
        
        Ok(document)
    }
    
    pub fn create_document(&self, collection_id: i64, name: String, content: String) -> SqliteResult<Document> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO documents (collection_id, name, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            rusqlite::params![collection_id, name, content],
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
}
