use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
    #[serde(default = "default_mcp_port")]
    pub mcp_port: u16,
}

fn default_mcp_port() -> u16 {
    3333
}

impl Default for StorageConfig {
    fn default() -> Self {
        StorageConfig {
            workspaces: Vec::new(),
            mcp_port: 3333,
        }
    }
}

impl StorageConfig {
    pub fn load(app_data_dir: &Path) -> Self {
        let config_path = app_data_dir.join("storage_config.json");
        match std::fs::read_to_string(&config_path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => StorageConfig::default(),
        }
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let config_path = app_data_dir.join("storage_config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&config_path, json)
            .map_err(|e| format!("Failed to write config: {}", e))
    }

    pub fn add_workspace(&mut self, name: &str, path: PathBuf) {
        self.workspaces.push(WorkspaceEntry {
            name: name.to_string(),
            path,
        });
    }

    /// Remove a workspace root whose path matches the given path.
    /// Returns true if a workspace was removed.
    pub fn remove_workspace_by_path(&mut self, path: &Path) -> bool {
        let before = self.workspaces.len();
        self.workspaces.retain(|w| !w.path.as_path().eq(path));
        self.workspaces.len() != before
    }
}
