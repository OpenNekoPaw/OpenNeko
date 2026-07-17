//! JVI project data loader.
//!
//! Loads .nkv project files into raw project DTOs. Conversion into kernel
//! timeline/export models belongs to engine-kernel.

use std::fs;
use std::path::Path;

use crate::error::{MediaError as Error, Result};

use super::types::ProjectData;

/// Loader for raw JVI/NKV project data.
pub struct JviProjectLoader;

impl JviProjectLoader {
    /// Create a new JVI project loader.
    pub fn new() -> Self {
        Self
    }

    /// Load a .nkv file as raw project DTOs.
    pub fn load(&self, path: &Path) -> Result<ProjectData> {
        let content = fs::read_to_string(path).map_err(|e| {
            Error::Other(format!(
                "Failed to read JVI file '{}': {}",
                path.display(),
                e
            ))
        })?;

        self.load_from_json(&content)
    }

    /// Load raw project DTOs from JSON.
    pub fn load_from_json(&self, json: &str) -> Result<ProjectData> {
        serde_json::from_str(json)
            .map_err(|e| Error::Other(format!("Failed to parse JVI JSON: {}", e)))
    }
}

impl Default for JviProjectLoader {
    fn default() -> Self {
        Self::new()
    }
}

/// Load a JVI/NKV file as raw project DTOs.
pub fn load_project(path: &Path) -> Result<ProjectData> {
    JviProjectLoader::new().load(path)
}

/// Load raw project DTOs from a JSON string.
pub fn load_project_from_json(json: &str) -> Result<ProjectData> {
    JviProjectLoader::new().load_from_json(json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_from_json() {
        let json = r#"{
            "version": "1.0",
            "name": "test",
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "tracks": [
                {
                    "id": "track-1",
                    "name": "Main Track",
                    "type": "media",
                    "elements": [],
                    "muted": false
                }
            ]
        }"#;

        let loader = JviProjectLoader::new();
        let result = loader.load_from_json(json);

        assert!(result.is_ok());
        let project = result.unwrap();
        assert_eq!(project.resolution.width, 1920);
        assert_eq!(project.resolution.height, 1080);
        assert_eq!(project.fps, 30.0);
        assert_eq!(project.tracks.len(), 1);
    }

    #[test]
    fn test_load_from_file() {
        use std::io::Write;

        let json = r#"{
            "version": "1.0",
            "name": "test",
            "resolution": { "width": 1280, "height": 720 },
            "fps": 60,
            "tracks": []
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json.as_bytes()).unwrap();

        let loader = JviProjectLoader::new();
        let result = loader.load(temp_file.path());

        assert!(result.is_ok());
        let project = result.unwrap();
        assert_eq!(project.resolution.width, 1280);
        assert_eq!(project.resolution.height, 720);
        assert_eq!(project.fps, 60.0);
    }
}
