use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum TreeNodeKind {
    Folder,
    Document,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub kind: TreeNodeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub trait StorageBackend: Send + Sync + 'static {
    fn list_roots(&self) -> Result<Vec<TreeNode>, String>;

    fn add_root(&self, name: &str, extra: Option<&str>) -> Result<TreeNode, String>;

    fn remove_root(&self, id: &str) -> Result<bool, String>;

    fn get_entry(&self, id: &str) -> Result<Option<TreeNode>, String>;

    fn list_children(&self, parent_id: &str) -> Result<Vec<TreeNode>, String>;

    fn create_folder(&self, parent_id: &str, name: &str) -> Result<TreeNode, String>;

    fn create_document(
        &self,
        parent_id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String>;

    fn update_document(
        &self,
        id: &str,
        name: &str,
        content: &str,
    ) -> Result<TreeNode, String>;

    fn rename_entry(&self, id: &str, new_name: &str) -> Result<TreeNode, String>;

    fn delete_entry(&self, id: &str) -> Result<bool, String>;

    fn move_entry(&self, id: &str, new_parent_id: &str) -> Result<TreeNode, String>;

    fn search(&self, query: &str) -> Result<Vec<TreeNode>, String>;

    fn export_root_to_filesystem(&self, root_id: &str, target_path: &Path) -> Result<(), String>;
}
