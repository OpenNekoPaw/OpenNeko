//! Resource handle types

use neko_engine_types::{ResourceId, ResourceType};
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Resource handle with metadata — stored in ResourceRegistry
#[derive(Debug, Clone)]
pub struct ResourceHandle {
    /// Deterministic resource ID
    pub id: ResourceId,
    /// Resource type
    pub resource_type: ResourceType,
    /// Source file path
    pub source_path: PathBuf,
    /// Creation timestamp
    pub created_at: Instant,
    /// Last accessed timestamp (for LRU eviction)
    pub last_accessed: Instant,
}

impl ResourceHandle {
    /// Create a new resource handle
    pub fn new(path: &Path, resource_type: ResourceType) -> Self {
        let id = ResourceId::from_path(path, resource_type);
        let now = Instant::now();
        Self {
            id,
            resource_type,
            source_path: path.to_path_buf(),
            created_at: now,
            last_accessed: now,
        }
    }

    /// Create from existing ID and path
    pub fn from_id(id: ResourceId, resource_type: ResourceType, path: PathBuf) -> Self {
        let now = Instant::now();
        Self {
            id,
            resource_type,
            source_path: path,
            created_at: now,
            last_accessed: now,
        }
    }

    /// Touch the resource (update last_accessed for LRU tracking)
    pub fn touch(&mut self) {
        self.last_accessed = Instant::now();
    }

    /// Get the source path
    pub fn source_path(&self) -> &Path {
        &self.source_path
    }

    /// Get the resource ID as string
    pub fn id_str(&self) -> &str {
        self.id.as_str()
    }

    /// Check if the source file exists
    pub fn exists(&self) -> bool {
        self.source_path.exists()
    }

    /// Get file extension
    pub fn extension(&self) -> Option<&str> {
        self.source_path.extension().and_then(|e| e.to_str())
    }

    /// Get file name
    pub fn file_name(&self) -> Option<&str> {
        self.source_path.file_name().and_then(|n| n.to_str())
    }

    /// Get age since creation
    pub fn age(&self) -> std::time::Duration {
        self.created_at.elapsed()
    }
}

/// Infer resource type from file path
pub fn infer_resource_type(path: &Path) -> ResourceType {
    path.extension()
        .and_then(|e| e.to_str())
        .map(ResourceType::from_extension)
        .unwrap_or(ResourceType::Video)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_handle_creation() {
        let path = Path::new("/tmp/test.mp4");
        let handle = ResourceHandle::new(path, ResourceType::Video);

        assert_eq!(handle.resource_type, ResourceType::Video);
        assert!(handle.id_str().starts_with("vid_"));
    }

    #[test]
    fn test_infer_resource_type() {
        assert_eq!(
            infer_resource_type(Path::new("video.mp4")),
            ResourceType::Video
        );
        assert_eq!(
            infer_resource_type(Path::new("audio.mp3")),
            ResourceType::Audio
        );
        assert_eq!(
            infer_resource_type(Path::new("image.png")),
            ResourceType::Image
        );
        assert_eq!(
            infer_resource_type(Path::new("project.nkv")),
            ResourceType::Timeline
        );
    }
}
