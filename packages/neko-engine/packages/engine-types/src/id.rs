//! Resource and Stream ID types
//!
//! Deterministic identifiers for resources and ephemeral stream sessions.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use xxhash_rust::xxh64::xxh64;

// ─── Resource ID ─────────────────────────────────────────────────────────────

/// Deterministic resource identifier — generated from canonical file path via xxHash64
///
/// Format: `{prefix}_{hex16}`, e.g., `"vid_a1b2c3d4e5f6a7b8"`
///
/// # Key Properties
/// - **Deterministic**: same path always produces same ID (across restarts)
/// - **Short**: 20 chars max (vs 260+ char paths)
/// - **Self-healing**: frontend caches ID, backend re-derives from source path on miss
///
/// # Example
/// ```
/// use neko_engine_types::{ResourceId, ResourceType};
/// use std::path::Path;
///
/// let id = ResourceId::from_path(Path::new("/path/to/video.mp4"), ResourceType::Video);
/// assert!(id.as_str().starts_with("vid_"));
/// ```
#[derive(Debug, Clone, Hash, Eq, PartialEq, Default, Serialize, Deserialize)]
pub struct ResourceId(String);

impl ResourceId {
    /// Generate deterministic ID from file path
    pub fn from_path(path: &Path, resource_type: ResourceType) -> Self {
        let canonical = Self::canonicalize(path);
        let hash = xxh64(canonical.as_bytes(), 0);
        let prefix = resource_type.prefix();
        Self(format!("{}_{:016x}", prefix, hash))
    }

    /// Create from existing string (e.g., from frontend request)
    pub fn from_string(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    /// Path canonicalization — ensures consistent hashing across platforms
    ///
    /// - Resolves symlinks to real path
    /// - Normalizes path separators to '/'
    /// - Lowercases on case-insensitive filesystems (macOS/Windows)
    fn canonicalize(path: &Path) -> String {
        let abs = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let normalized = abs.to_string_lossy().replace('\\', "/");

        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            normalized.to_lowercase()
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            normalized
        }
    }

    /// Get the resource type prefix
    pub fn prefix(&self) -> &str {
        self.0.split('_').next().unwrap_or("")
    }

    /// Get the full ID string
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Infer resource type from prefix
    pub fn resource_type(&self) -> Option<ResourceType> {
        ResourceType::from_prefix(self.prefix())
    }
}

impl std::fmt::Display for ResourceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// ─── Resource Type ───────────────────────────────────────────────────────────

/// Resource type — determines ID prefix
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceType {
    Video,
    Audio,
    Image,
    Timeline,
    Proxy,
}

impl ResourceType {
    /// Get the prefix string for this resource type
    pub fn prefix(&self) -> &'static str {
        match self {
            Self::Video => "vid",
            Self::Audio => "aud",
            Self::Image => "img",
            Self::Timeline => "tl",
            Self::Proxy => "prx",
        }
    }

    /// Parse resource type from prefix
    pub fn from_prefix(prefix: &str) -> Option<Self> {
        match prefix {
            "vid" => Some(Self::Video),
            "aud" => Some(Self::Audio),
            "img" => Some(Self::Image),
            "tl" => Some(Self::Timeline),
            "prx" => Some(Self::Proxy),
            _ => None,
        }
    }

    /// Infer resource type from file extension
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "mp4" | "mov" | "avi" | "mkv" | "webm" | "m4v" | "wmv" | "flv" => Self::Video,
            "mp3" | "wav" | "aac" | "flac" | "ogg" | "m4a" | "wma" => Self::Audio,
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tiff" | "psd" => Self::Image,
            "jvi" | "nkv" => Self::Timeline,
            _ => Self::Video, // Default to video
        }
    }
}

// ─── Stream ID ───────────────────────────────────────────────────────────────

/// Process-unique stream identifier
///
/// Format: `strm_{session_short}_{counter}`, e.g., `"strm_w01_0042"`
///
/// Unlike `ResourceId` (deterministic from path), `StreamId` is ephemeral:
/// - Generated at stream creation, not persisted
/// - Unique within a process lifetime (atomic counter)
/// - Human-readable for logging and debugging
#[derive(Debug, Clone, Hash, Eq, PartialEq, Default, Serialize, Deserialize)]
pub struct StreamId(String);

static STREAM_COUNTER: AtomicU64 = AtomicU64::new(0);

impl StreamId {
    /// Create a new stream ID within a session
    pub fn new(session_id: &str) -> Self {
        let counter = STREAM_COUNTER.fetch_add(1, Ordering::Relaxed);
        let short = &session_id[..session_id.len().min(8)];
        Self(format!("strm_{}_{:04}", short, counter))
    }

    /// Create from existing string
    pub fn from_string(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    /// Get the full ID string
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for StreamId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// ─── Stream State ────────────────────────────────────────────────────────────

/// Stream lifecycle state machine
///
/// ```text
/// Created → Active → Paused → Active (resume)
///                  → Destroyed (stop/error/timeout)
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamState {
    /// Stream allocated, not yet pushing frames
    #[default]
    Created,
    /// Actively pushing frames
    Active,
    /// Frozen on current frame (paused)
    Paused,
    /// Terminal state, resources released
    Destroyed,
}

impl StreamState {
    /// Validate state transition
    pub fn can_transition_to(&self, target: StreamState) -> bool {
        matches!(
            (*self, target),
            (StreamState::Created, StreamState::Active)
                | (StreamState::Active, StreamState::Paused)
                | (StreamState::Paused, StreamState::Active)
                | (StreamState::Active, StreamState::Active)   // idempotent resume
                | (StreamState::Paused, StreamState::Paused)   // idempotent pause
                | (_, StreamState::Destroyed) // any state can be destroyed
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resource_id_deterministic() {
        let path = Path::new("/tmp/test.mp4");
        let id1 = ResourceId::from_path(path, ResourceType::Video);
        let id2 = ResourceId::from_path(path, ResourceType::Video);
        assert_eq!(id1, id2);
        assert!(id1.as_str().starts_with("vid_"));
    }

    #[test]
    fn test_resource_type_prefix() {
        assert_eq!(ResourceType::Video.prefix(), "vid");
        assert_eq!(ResourceType::Audio.prefix(), "aud");
        assert_eq!(ResourceType::from_prefix("vid"), Some(ResourceType::Video));
    }

    #[test]
    fn test_stream_id_unique() {
        let id1 = StreamId::new("session1");
        let id2 = StreamId::new("session1");
        assert_ne!(id1, id2);
        assert!(id1.as_str().starts_with("strm_"));
    }

    #[test]
    fn test_stream_state_transitions() {
        assert!(StreamState::Created.can_transition_to(StreamState::Active));
        assert!(StreamState::Active.can_transition_to(StreamState::Paused));
        assert!(StreamState::Paused.can_transition_to(StreamState::Active));
        assert!(StreamState::Active.can_transition_to(StreamState::Destroyed));
        assert!(!StreamState::Created.can_transition_to(StreamState::Paused));
    }
}
