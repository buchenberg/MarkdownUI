use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use crate::config::StorageConfig;
use crate::storage::{SearchResult, TreeNode, TreeNodeKind};

pub struct FilesystemStorage {
    config: Arc<RwLock<StorageConfig>>,
    config_dir: PathBuf,
}

impl FilesystemStorage {
    pub fn new(config: Arc<RwLock<StorageConfig>>, config_dir: PathBuf) -> Self {
        FilesystemStorage { config, config_dir }
    }

    fn workspaces(&self) -> Vec<(String, PathBuf)> {
        self.config
            .read()
            .map(|cfg| {
                cfg.workspaces
                    .iter()
                    .map(|w| (w.name.clone(), w.path.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn is_hidden(entry: &fs::DirEntry) -> bool {
        entry
            .file_name()
            .to_str()
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
    }

    fn fmt_timestamp(t: SystemTime) -> String {
        use std::time::UNIX_EPOCH;
        let dur = t.duration_since(UNIX_EPOCH).unwrap_or_default();
        let secs = dur.as_secs();
        let days = secs / 86400;
        let time_secs = secs % 86400;
        let hours = time_secs / 3600;
        let mins = (time_secs % 3600) / 60;
        let secs_rem = time_secs % 60;
        let (y, m, d) = civil_from_days(days as i64 + 719468);
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            y, m, d, hours, mins, secs_rem
        )
    }

    fn metadata_to_timestamps(meta: &fs::Metadata) -> (String, String) {
        let created = meta
            .created()
            .map(Self::fmt_timestamp)
            .unwrap_or_else(|_| String::new());
        let modified = meta
            .modified()
            .map(Self::fmt_timestamp)
            .unwrap_or_else(|_| String::new());
        (created, modified)
    }

    fn entry_to_treenode(
        entry: &fs::DirEntry,
        parent_id: &str,
    ) -> Result<Option<TreeNode>, String> {
        let file_type = entry.file_type().map_err(|e| format!("I/O error: {}", e))?;
        let path = entry.path();
        let meta = entry.metadata().map_err(|e| format!("I/O error: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            Ok(Some(TreeNode {
                id: path.to_string_lossy().to_string(),
                parent_id: Some(parent_id.to_string()),
                name,
                kind: TreeNodeKind::Folder,
                content: None,
                created_at,
                updated_at,
            }))
        } else if file_type.is_file() {
            let raw_name = entry.file_name().to_string_lossy().to_string();
            if raw_name.ends_with(".md") {
                let name = strip_md_suffix(&raw_name);
                Ok(Some(TreeNode {
                    id: path.to_string_lossy().to_string(),
                    parent_id: Some(parent_id.to_string()),
                    name,
                    kind: TreeNodeKind::Document,
                    content: None,
                    created_at,
                    updated_at,
                }))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    /// Build a root TreeNode (parent_id = None) from a path + name, with best-effort timestamps.
    fn root_node(name: &str, path: &Path) -> TreeNode {
        let (created_at, updated_at) = match fs::metadata(path) {
            Ok(meta) => Self::metadata_to_timestamps(&meta),
            Err(_) => (String::new(), String::new()),
        };
        TreeNode {
            id: path.to_string_lossy().to_string(),
            parent_id: None,
            name: name.to_string(),
            kind: TreeNodeKind::Folder,
            content: None,
            created_at,
            updated_at,
        }
    }

    pub fn list_roots(&self) -> Result<Vec<TreeNode>, String> {
        Ok(self
            .workspaces()
            .into_iter()
            .map(|(name, path)| Self::root_node(&name, &path))
            .collect())
    }

    pub fn add_root(&self, name: &str, extra: Option<&str>) -> Result<TreeNode, String> {
        let path = match extra {
            Some(p) if !p.is_empty() => PathBuf::from(p),
            _ => {
                return Err(
                    "Filesystem mode requires a directory path (extra parameter)".into(),
                )
            }
        };

        if !path.is_dir() {
            return Err(format!("Path is not a directory: {}", path.display()));
        }

        {
            let mut cfg = self.config.write().map_err(|e| e.to_string())?;
            cfg.add_workspace(name, path.clone());
            cfg.save(&self.config_dir)?;
        }

        Ok(Self::root_node(name, &path))
    }

    pub fn remove_root(&self, id: &str) -> Result<bool, String> {
        let path = PathBuf::from(id);

        let mut cfg = self.config.write().map_err(|e| e.to_string())?;
        if !cfg.remove_workspace_by_path(&path) {
            return Err(format!("Workspace root not found: {}", id));
        }
        cfg.save(&self.config_dir)?;
        Ok(true)
    }

    pub fn get_entry(&self, id: &str) -> Result<Option<TreeNode>, String> {
        let path = PathBuf::from(id);
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => return Ok(None),
        };

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let parent_id = path
            .parent()
            .map(|p| p.to_string_lossy().to_string());
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);

        // A registered root directory has no parent in the tree.
        let parent_id = if self.is_registered_root(&path) {
            None
        } else {
            parent_id
        };

        if meta.is_dir() {
            Ok(Some(TreeNode {
                id: path.to_string_lossy().to_string(),
                parent_id,
                name,
                kind: TreeNodeKind::Folder,
                content: None,
                created_at,
                updated_at,
            }))
        } else {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
            let display_name = if name.ends_with(".md") {
                strip_md_suffix(&name)
            } else {
                name
            };
            Ok(Some(TreeNode {
                id: path.to_string_lossy().to_string(),
                parent_id,
                name: display_name,
                kind: TreeNodeKind::Document,
                content: Some(content),
                created_at,
                updated_at,
            }))
        }
    }

    /// True if `path` matches a registered workspace root (used to clear parent_id for roots).
    fn is_registered_root(&self, path: &Path) -> bool {
        self.workspaces()
            .iter()
            .any(|(_, p)| p.as_path().eq(path))
    }

    pub fn list_children(&self, parent_id: &str) -> Result<Vec<TreeNode>, String> {
        let dir_path = PathBuf::from(parent_id);

        if !dir_path.is_dir() {
            return Err(format!("Not a directory: {}", dir_path.display()));
        }

        let mut children: Vec<TreeNode> = Vec::new();

        let entries = fs::read_dir(&dir_path)
            .map_err(|e| format!("Failed to read directory {}: {}", dir_path.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("I/O error: {}", e))?;
            if Self::is_hidden(&entry) {
                continue;
            }
            if let Some(node) = Self::entry_to_treenode(&entry, parent_id)? {
                children.push(node);
            }
        }

        children.sort_by(|a, b| {
            a.kind
                .cmp(&b.kind)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(children)
    }

    pub fn create_folder(&self, parent_id: &str, name: &str) -> Result<TreeNode, String> {
        let parent_path = PathBuf::from(parent_id);
        let new_path = parent_path.join(name);

        fs::create_dir(&new_path)
            .map_err(|e| format!("Failed to create directory {}: {}", new_path.display(), e))?;

        let meta = fs::metadata(&new_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);

        Ok(TreeNode {
            id: new_path.to_string_lossy().to_string(),
            parent_id: Some(parent_id.to_string()),
            name: name.to_string(),
            kind: TreeNodeKind::Folder,
            content: None,
            created_at,
            updated_at,
        })
    }

    pub fn create_document(
        &self,
        parent_id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String> {
        let parent_path = PathBuf::from(parent_id);
        let filename = ensure_md_extension(name);
        let new_path = parent_path.join(&filename);

        fs::write(&new_path, content)
            .map_err(|e| format!("Failed to write {}: {}", new_path.display(), e))?;

        let meta = fs::metadata(&new_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);
        let display_name = strip_md_suffix(&filename);

        Ok(TreeNode {
            id: new_path.to_string_lossy().to_string(),
            parent_id: Some(parent_id.to_string()),
            name: display_name,
            kind: TreeNodeKind::Document,
            content: Some(content.to_string()),
            created_at,
            updated_at,
        })
    }

    pub fn update_document(
        &self,
        id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String> {
        let old_path = PathBuf::from(id);
        if !old_path.is_file() {
            return Err(format!("Not a file: {}", old_path.display()));
        }

        let new_filename = ensure_md_extension(name);

        let new_path = if let Some(parent) = old_path.parent() {
            parent.join(&new_filename)
        } else {
            PathBuf::from(&new_filename)
        };

        if new_path != old_path {
            fs::rename(&old_path, &new_path).map_err(|e| {
                format!(
                    "Failed to rename {} to {}: {}",
                    old_path.display(),
                    new_path.display(),
                    e
                )
            })?;
        }

        fs::write(&new_path, content)
            .map_err(|e| format!("Failed to write {}: {}", new_path.display(), e))?;

        let meta = fs::metadata(&new_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);
        let display_name = name.to_string();

        Ok(TreeNode {
            id: new_path.to_string_lossy().to_string(),
            parent_id: new_path
                .parent()
                .map(|p| p.to_string_lossy().to_string()),
            name: display_name,
            kind: TreeNodeKind::Document,
            content: Some(content.to_string()),
            created_at,
            updated_at,
        })
    }

    pub fn rename_entry(&self, id: &str, new_name: &str) -> Result<TreeNode, String> {
        let old_path = PathBuf::from(id);

        let (_is_dir, is_file) = if let Ok(meta) = fs::metadata(&old_path) {
            (meta.is_dir(), meta.is_file())
        } else {
            return Err(format!("Entry not found: {}", old_path.display()));
        };

        let new_path = if let Some(parent) = old_path.parent() {
            if is_file {
                let filename = ensure_md_extension(new_name);
                parent.join(&filename)
            } else {
                parent.join(new_name)
            }
        } else {
            return Err("Cannot rename root entry".into());
        };

        fs::rename(&old_path, &new_path).map_err(|e| {
            format!(
                "Failed to rename {} to {}: {}",
                old_path.display(),
                new_path.display(),
                e
            )
        })?;

        let meta = fs::metadata(&new_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);

        Ok(TreeNode {
            id: new_path.to_string_lossy().to_string(),
            parent_id: new_path
                .parent()
                .map(|p| p.to_string_lossy().to_string()),
            name: new_name.to_string(),
            kind: if meta.is_dir() {
                TreeNodeKind::Folder
            } else {
                TreeNodeKind::Document
            },
            content: None,
            created_at,
            updated_at,
        })
    }

    pub fn delete_entry(&self, id: &str) -> Result<bool, String> {
        let path = PathBuf::from(id);

        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => return Ok(false),
        };

        if meta.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to remove directory: {}", e))?;
        } else {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove file: {}", e))?;
        }

        Ok(true)
    }

    /// Move an entry to a new parent directory. Uses `fs::rename`, which only works
    /// within the same volume/filesystem. Cross-volume moves will surface the OS error.
    pub fn move_entry(&self, id: &str, new_parent_id: &str) -> Result<TreeNode, String> {
        let old_path = PathBuf::from(id);

        let is_dir = fs::metadata(&old_path)
            .map(|m| m.is_dir())
            .unwrap_or(false);

        let dest_dir = PathBuf::from(new_parent_id);
        let file_name = old_path
            .file_name()
            .ok_or_else(|| format!("Invalid source path: {}", old_path.display()))?;
        let new_path = dest_dir.join(file_name);

        fs::rename(&old_path, &new_path).map_err(|e| {
            format!(
                "Failed to move {} to {}: {}",
                old_path.display(),
                new_path.display(),
                e
            )
        })?;

        let meta = fs::metadata(&new_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        let (created_at, updated_at) = Self::metadata_to_timestamps(&meta);
        let name = new_path
            .file_name()
            .map(|n| strip_md_suffix(&n.to_string_lossy()))
            .unwrap_or_default();

        Ok(TreeNode {
            id: new_path.to_string_lossy().to_string(),
            parent_id: Some(new_parent_id.to_string()),
            name,
            kind: if is_dir {
                TreeNodeKind::Folder
            } else {
                TreeNodeKind::Document
            },
            content: None,
            created_at,
            updated_at,
        })
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let lower_query = query.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for (_name, root_path) in self.workspaces().into_iter() {
            if !root_path.is_dir() {
                continue;
            }
            let root_id = root_path.to_string_lossy().to_string();
            walk_for_search(&root_path, &root_id, &lower_query, &mut results)?;
        }

        Ok(results)
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Strip the `.md` suffix from a filename, returning the bare name.
fn strip_md_suffix(name: &str) -> String {
    name.strip_suffix(".md").unwrap_or(name).to_string()
}

/// If `name` doesn't already end with `.md`, append the extension.
fn ensure_md_extension(name: &str) -> String {
    if name.ends_with(".md") {
        name.to_string()
    } else {
        format!("{}.md", name)
    }
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    (y, m, d)
}

fn extract_matched_line(content: &str, query: &str) -> String {
    for line in content.lines() {
        if line.to_lowercase().contains(query) {
            let trimmed = line.trim();
            if trimmed.len() > 120 {
                let mut end = 120;
                while !trimmed.is_char_boundary(end) {
                    end -= 1;
                }
                return trimmed[..end].to_string();
            }
            return trimmed.to_string();
        }
    }
    // Fallback: first non-empty line
    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if trimmed.len() > 120 {
                let mut end = 120;
                while !trimmed.is_char_boundary(end) {
                    end -= 1;
                }
                return trimmed[..end].to_string();
            }
            return trimmed.to_string();
        }
    }
    "(empty)".to_string()
}

const MAX_SEARCH_RESULTS: usize = 50;

fn walk_for_search(
    dir: &Path,
    parent_id: &str,
    query: &str,
    results: &mut Vec<SearchResult>,
) -> Result<(), String> {
    if results.len() >= MAX_SEARCH_RESULTS {
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries {
        if results.len() >= MAX_SEARCH_RESULTS {
            return Ok(());
        }

        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            let child_id = path.to_string_lossy().to_string();
            walk_for_search(&path, &child_id, query, results)?;
        } else if file_type.is_file() {
            let lower_name = file_name.to_lowercase();
            let name_match = lower_name.contains(query);

            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let content_match = !name_match && content.to_lowercase().contains(query);

            if name_match || content_match {
                if file_name.ends_with(".md") {
                    let meta = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let (created_at, updated_at) =
                        FilesystemStorage::metadata_to_timestamps(&meta);
                    let name = strip_md_suffix(&file_name);
                    let matched_line = if name_match && !content_match {
                        extract_matched_line(&content, query)
                    } else {
                        extract_matched_line(&content, query)
                    };
                    results.push(SearchResult {
                        id: path.to_string_lossy().to_string(),
                        parent_id: Some(parent_id.to_string()),
                        name,
                        kind: TreeNodeKind::Document,
                        created_at,
                        updated_at,
                        matched_line,
                    });
                }
            }
        }
    }

    Ok(())
}
