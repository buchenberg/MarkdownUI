#!/usr/bin/env node
/**
 * MarkdownUI MCP Server
 *
 * Exposes MarkdownUI's SQLite database as MCP tools so any MCP-capable
 * agent (Hermes, VS Code Copilot, Claude Desktop, Cursor) can read and
 * write collections and documents.
 *
 * DB location: %APPDATA%\com.markdownui.app\markdown-ui.db
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import path from "path";
import os from "os";
import fs from "fs";

// ── DB path resolution ──────────────────────────────────────────────────────

function resolveDbPath() {
  // Allow override via env var
  if (process.env.MARKDOWNUI_DB_PATH) {
    return process.env.MARKDOWNUI_DB_PATH;
  }

  // Default Tauri app data location on Windows
  const appData =
    process.env.APPDATA ||
    path.join(os.homedir(), "AppData", "Roaming");
  const dbPath = path.join(appData, "com.markdownui.app", "markdown-ui.db");

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `MarkdownUI database not found at: ${dbPath}\n` +
      `Set MARKDOWNUI_DB_PATH env var to override.`
    );
  }

  return dbPath;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

function openDb() {
  const dbPath = resolveDbPath();
  // readonly: false so we can write; WAL mode for safe concurrent access
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "markdownui",
  version: "1.0.0",
});

// ── Tools ─────────────────────────────────────────────────────────────────────

// list_collections
server.tool(
  "list_collections",
  "List all collections in MarkdownUI",
  {},
  async () => {
    const db = openDb();
    try {
      const rows = db
        .prepare(
          "SELECT id, name, description, created_at, updated_at FROM collections ORDER BY name ASC"
        )
        .all();
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// get_collection
server.tool(
  "get_collection",
  "Get a single collection by ID",
  { id: z.number().int().positive().describe("Collection ID") },
  async ({ id }) => {
    const db = openDb();
    try {
      const row = db
        .prepare(
          "SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?"
        )
        .get(id);
      if (!row) {
        return {
          content: [{ type: "text", text: `Collection ${id} not found.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// create_collection
server.tool(
  "create_collection",
  "Create a new collection",
  {
    name: z.string().min(1).describe("Collection name"),
    description: z.string().optional().describe("Optional description"),
  },
  async ({ name, description }) => {
    const db = openDb();
    try {
      const result = db
        .prepare(
          "INSERT INTO collections (name, description) VALUES (?, ?)"
        )
        .run(name, description ?? null);
      const row = db
        .prepare("SELECT * FROM collections WHERE id = ?")
        .get(result.lastInsertRowid);
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// update_collection
server.tool(
  "update_collection",
  "Update an existing collection's name and/or description",
  {
    id: z.number().int().positive().describe("Collection ID"),
    name: z.string().min(1).describe("New name"),
    description: z.string().optional().describe("New description (omit to clear)"),
  },
  async ({ id, name, description }) => {
    const db = openDb();
    try {
      const result = db
        .prepare(
          "UPDATE collections SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(name, description ?? null, id);
      if (result.changes === 0) {
        return {
          content: [{ type: "text", text: `Collection ${id} not found.` }],
          isError: true,
        };
      }
      const row = db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// delete_collection
server.tool(
  "delete_collection",
  "Delete a collection and all its documents (irreversible)",
  { id: z.number().int().positive().describe("Collection ID") },
  async ({ id }) => {
    const db = openDb();
    try {
      const result = db
        .prepare("DELETE FROM collections WHERE id = ?")
        .run(id);
      if (result.changes === 0) {
        return {
          content: [{ type: "text", text: `Collection ${id} not found.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Collection ${id} deleted.` }],
      };
    } finally {
      db.close();
    }
  }
);

// list_documents
server.tool(
  "list_documents",
  "List all documents in a collection (without content)",
  {
    collection_id: z
      .number()
      .int()
      .positive()
      .describe("Collection ID"),
  },
  async ({ collection_id }) => {
    const db = openDb();
    try {
      const rows = db
        .prepare(
          `SELECT id, collection_id, name,
                  length(content) AS content_length,
                  created_at, updated_at
           FROM documents
           WHERE collection_id = ?
           ORDER BY name ASC`
        )
        .all(collection_id);
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// get_document
server.tool(
  "get_document",
  "Get a document by ID including its full markdown content",
  { id: z.number().int().positive().describe("Document ID") },
  async ({ id }) => {
    const db = openDb();
    try {
      const row = db
        .prepare(
          "SELECT id, collection_id, name, content, created_at, updated_at FROM documents WHERE id = ?"
        )
        .get(id);
      if (!row) {
        return {
          content: [{ type: "text", text: `Document ${id} not found.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// search_documents
server.tool(
  "search_documents",
  "Search documents by name (case-insensitive substring match)",
  {
    query: z.string().min(1).describe("Search term"),
    collection_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optionally restrict search to a specific collection"),
  },
  async ({ query, collection_id }) => {
    const db = openDb();
    try {
      const like = `%${query}%`;
      let rows;
      if (collection_id != null) {
        rows = db
          .prepare(
            `SELECT id, collection_id, name, length(content) AS content_length, created_at, updated_at
             FROM documents
             WHERE collection_id = ? AND name LIKE ?
             ORDER BY name ASC`
          )
          .all(collection_id, like);
      } else {
        rows = db
          .prepare(
            `SELECT id, collection_id, name, length(content) AS content_length, created_at, updated_at
             FROM documents
             WHERE name LIKE ?
             ORDER BY name ASC`
          )
          .all(like);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// create_document
server.tool(
  "create_document",
  "Create a new document in a collection",
  {
    collection_id: z.number().int().positive().describe("Collection ID"),
    name: z.string().min(1).describe("Document name"),
    content: z.string().describe("Markdown content"),
  },
  async ({ collection_id, name, content }) => {
    const db = openDb();
    try {
      // Verify collection exists
      const col = db
        .prepare("SELECT id FROM collections WHERE id = ?")
        .get(collection_id);
      if (!col) {
        return {
          content: [
            {
              type: "text",
              text: `Collection ${collection_id} not found.`,
            },
          ],
          isError: true,
        };
      }
      const result = db
        .prepare(
          "INSERT INTO documents (collection_id, name, content) VALUES (?, ?, ?)"
        )
        .run(collection_id, name, content);
      const row = db
        .prepare("SELECT * FROM documents WHERE id = ?")
        .get(result.lastInsertRowid);
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// update_document
server.tool(
  "update_document",
  "Update a document's name and/or content",
  {
    id: z.number().int().positive().describe("Document ID"),
    name: z.string().min(1).optional().describe("New name (omit to keep current)"),
    content: z.string().optional().describe("New markdown content (omit to keep current)"),
  },
  async ({ id, name, content }) => {
    const db = openDb();
    try {
      const existing = db
        .prepare("SELECT id, name, content FROM documents WHERE id = ?")
        .get(id);
      if (!existing) {
        return {
          content: [{ type: "text", text: `Document ${id} not found.` }],
          isError: true,
        };
      }
      const newName = name ?? existing.name;
      const newContent = content ?? existing.content;
      db.prepare(
        "UPDATE documents SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(newName, newContent, id);
      const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
      return {
        content: [{ type: "text", text: JSON.stringify(row, null, 2) }],
      };
    } finally {
      db.close();
    }
  }
);

// delete_document
server.tool(
  "delete_document",
  "Delete a document by ID (irreversible)",
  { id: z.number().int().positive().describe("Document ID") },
  async ({ id }) => {
    const db = openDb();
    try {
      const result = db
        .prepare("DELETE FROM documents WHERE id = ?")
        .run(id);
      if (result.changes === 0) {
        return {
          content: [{ type: "text", text: `Document ${id} not found.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Document ${id} deleted.` }],
      };
    } finally {
      db.close();
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
