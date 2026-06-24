use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    #[serde(default = "default_storage_type")]
    pub storage_type: String,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceEntry>,
}

fn default_storage_type() -> String {
    "sqlite".to_string()
}

impl Default for StorageConfig {
    fn default() -> Self {
        StorageConfig {
            storage_type: "sqlite".to_string(),
            workspaces: Vec::new(),
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

    pub fn set_storage_type(&mut self, storage_type: &str) {
        self.storage_type = storage_type.to_string();
    }

    pub fn add_workspace(&mut self, name: &str, path: PathBuf) {
        self.workspaces.push(WorkspaceEntry {
            name: name.to_string(),
            path,
        });
    }

    pub fn remove_workspace(&mut self, index: usize) -> bool {
        if index < self.workspaces.len() {
            self.workspaces.remove(index);
            true
        } else {
            false
        }
    }
}
