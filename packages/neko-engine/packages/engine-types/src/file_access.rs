//! Engine-owned file access DTOs.
//!
//! These types describe file sources and opaque engine tokens. They are pure
//! wire contracts; host-api owns path resolution, authorization, and I/O.

use serde::{Deserialize, Serialize};

/// Why a file is being registered with the engine.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileAccessPurpose {
    #[default]
    Preview,
    MediaDecode,
    Subtitle,
    Other,
}

/// A source reference consumed by engine actions.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSourceRef {
    pub token: Option<String>,
    pub path: Option<String>,
    pub asset_id: Option<String>,
}

impl FileSourceRef {
    pub fn path(path: impl Into<String>) -> Self {
        Self {
            path: Some(path.into()),
            ..Self::default()
        }
    }

    pub fn token(token: impl Into<String>) -> Self {
        Self {
            token: Some(token.into()),
            ..Self::default()
        }
    }
}

/// Register a local file with engine file access.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterFileRequest {
    pub source: Option<String>,
    pub file_path: Option<String>,
    pub path: Option<String>,
    pub purpose: Option<FileAccessPurpose>,
    pub ttl_ms: Option<u64>,
    pub mime_hint: Option<String>,
}

impl RegisterFileRequest {
    pub fn local_path(&self) -> Option<&str> {
        self.file_path
            .as_deref()
            .or(self.source.as_deref())
            .or(self.path.as_deref())
    }

    pub fn purpose(&self) -> FileAccessPurpose {
        self.purpose.clone().unwrap_or_default()
    }
}

/// Metadata returned after registering a file token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredFile {
    pub token: String,
    pub file_size_bytes: u64,
    pub mime_type: String,
    pub purpose: FileAccessPurpose,
    pub range_url: String,
}

/// Register/unregister response shape used by compatibility callers.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTokenResponse {
    pub token: String,
}

/// A bounded byte range using inclusive offsets.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileByteRange {
    pub start: u64,
    pub end: u64,
}

/// Stable error categories for file access clients.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileAccessErrorCode {
    NotFound,
    OutsideAllowedRoots,
    InvalidRange,
    UnsupportedSource,
    RegistryFull,
    Internal,
}
