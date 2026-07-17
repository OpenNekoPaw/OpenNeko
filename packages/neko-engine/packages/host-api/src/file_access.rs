//! Engine-owned local file access registry.
//!
//! The registry centralizes local path authorization and token lifecycle for
//! binary preview and media access. HTTP routes own the actual byte
//! transport; controllers use this module for token and metadata contracts.

use crate::error::{ApiError, ApiResult};
use neko_engine_types::{FileAccessPurpose, RegisteredFile};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::RwLock,
    time::{Duration, SystemTime},
};
use uuid::Uuid;

pub const FILE_TOKEN_TTL_SECS: u64 = 60 * 60;
const MAX_FILE_TOKENS: usize = 4096;

/// Thread-safe map of opaque file access tokens.
pub struct FileAccessRegistry {
    inner: RwLock<HashMap<String, FileAccessRecord>>,
    allowed_roots: RwLock<Vec<PathBuf>>,
}

impl FileAccessRegistry {
    pub fn new() -> Self {
        let roots = std::env::current_dir().ok().into_iter().collect();
        Self::with_allowed_roots(roots)
    }

    pub fn with_allowed_roots(allowed_roots: Vec<PathBuf>) -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
            allowed_roots: RwLock::new(canonicalize_allowed_roots(allowed_roots)),
        }
    }

    pub fn set_allowed_roots(&self, allowed_roots: Vec<PathBuf>) -> ApiResult<()> {
        let mut guard = self.allowed_roots.write().map_err(|error| {
            ApiError::Internal(format!("File access allowed roots lock poisoned: {error}"))
        })?;
        *guard = canonicalize_allowed_roots(allowed_roots);
        Ok(())
    }

    pub fn register(&self, path: PathBuf, purpose: FileAccessPurpose) -> ApiResult<RegisteredFile> {
        let path = self.authorize_source_path(path)?;
        let token = Uuid::new_v4().to_string();
        self.register_token(token, path, purpose)
    }

    pub fn register_with_token(
        &self,
        token: String,
        path: PathBuf,
        purpose: FileAccessPurpose,
    ) -> ApiResult<RegisteredFile> {
        let path = self.authorize_source_path(path)?;
        self.register_token(token, path, purpose)
    }

    /// Register a file produced by the engine itself.
    ///
    /// This bypasses user allowed-root validation and is only for trusted
    /// artifacts such as generated preview proxies under the engine cache dir.
    pub fn register_trusted_path_with_token(
        &self,
        token: String,
        path: PathBuf,
        purpose: FileAccessPurpose,
    ) -> ApiResult<RegisteredFile> {
        let path = canonical_file_path(path)?;
        self.register_token(token, path, purpose)
    }

    pub fn unregister_token(&self, token: &str) -> ApiResult<()> {
        let mut guard = self.inner.write().map_err(|error| {
            ApiError::Internal(format!("File access registry lock poisoned: {error}"))
        })?;
        guard.remove(token);
        Ok(())
    }

    pub fn lookup_token(&self, token: &str) -> ApiResult<Option<PathBuf>> {
        Ok(self.lookup_record(token)?.map(|record| record.path))
    }

    pub fn lookup_record(&self, token: &str) -> ApiResult<Option<FileAccessRecord>> {
        let mut guard = self.inner.write().map_err(|error| {
            ApiError::Internal(format!("File access registry lock poisoned: {error}"))
        })?;
        prune_expired_tokens(&mut guard);
        Ok(guard.get(token).cloned())
    }

    pub fn stat_token(&self, token: &str) -> ApiResult<Option<RegisteredFile>> {
        Ok(self
            .lookup_record(token)?
            .map(|record| record.to_registered_file()))
    }

    pub fn resolve_path(&self, path: PathBuf) -> ApiResult<PathBuf> {
        self.authorize_source_path(path)
    }

    fn register_token(
        &self,
        token: String,
        path: PathBuf,
        purpose: FileAccessPurpose,
    ) -> ApiResult<RegisteredFile> {
        let metadata = std::fs::metadata(&path).map_err(|error| {
            ApiError::NotFound(format!("File access source not found: {error}"))
        })?;
        let mime_type = mime_for_path(&path);
        let record = FileAccessRecord {
            token: token.clone(),
            path,
            file_size_bytes: metadata.len(),
            mime_type,
            purpose,
            expires_at: Some(SystemTime::now() + Duration::from_secs(FILE_TOKEN_TTL_SECS)),
        };

        let mut guard = self.inner.write().map_err(|error| {
            ApiError::Internal(format!("File access registry lock poisoned: {error}"))
        })?;
        prune_expired_tokens(&mut guard);
        if guard.len() >= MAX_FILE_TOKENS {
            return Err(ApiError::ServiceError(
                "File access token registry is full".to_string(),
            ));
        }
        guard.insert(token, record.clone());
        Ok(record.to_registered_file())
    }

    #[cfg(test)]
    fn insert_test_record(
        &self,
        token: String,
        path: PathBuf,
        purpose: FileAccessPurpose,
        expires_at: Option<SystemTime>,
    ) -> ApiResult<()> {
        let path = canonical_file_path(path)?;
        let metadata = std::fs::metadata(&path).map_err(|error| {
            ApiError::NotFound(format!("File access source not found: {error}"))
        })?;
        let record = FileAccessRecord {
            token: token.clone(),
            path,
            file_size_bytes: metadata.len(),
            mime_type: "application/octet-stream".to_string(),
            purpose,
            expires_at,
        };
        let mut guard = self.inner.write().map_err(|error| {
            ApiError::Internal(format!("File access registry lock poisoned: {error}"))
        })?;
        guard.insert(token, record);
        Ok(())
    }

    #[cfg(test)]
    fn token_count(&self) -> ApiResult<usize> {
        let guard = self.inner.read().map_err(|error| {
            ApiError::Internal(format!("File access registry lock poisoned: {error}"))
        })?;
        Ok(guard.len())
    }

    fn authorize_source_path(&self, path: PathBuf) -> ApiResult<PathBuf> {
        let canonical = canonical_file_path(path)?;
        let allowed_roots = self.allowed_roots.read().map_err(|error| {
            ApiError::Internal(format!("File access allowed roots lock poisoned: {error}"))
        })?;
        if allowed_roots.is_empty()
            || allowed_roots
                .iter()
                .any(|allowed_root| canonical.starts_with(allowed_root))
        {
            return Ok(canonical);
        }
        Err(ApiError::InvalidRequest(format!(
            "File access path outside allowed roots: {:?}",
            canonical
        )))
    }
}

impl Default for FileAccessRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Debug)]
pub struct FileAccessRecord {
    pub token: String,
    pub path: PathBuf,
    pub file_size_bytes: u64,
    pub mime_type: String,
    pub purpose: FileAccessPurpose,
    expires_at: Option<SystemTime>,
}

impl FileAccessRecord {
    pub fn to_registered_file(&self) -> RegisteredFile {
        RegisteredFile {
            token: self.token.clone(),
            file_size_bytes: self.file_size_bytes,
            mime_type: self.mime_type.clone(),
            purpose: self.purpose.clone(),
            range_url: file_url(&self.token),
        }
    }
}

pub fn file_url(token: &str) -> String {
    format!("/v1/files/{token}")
}

pub fn mime_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4".to_string(),
        Some("mov") => "video/quicktime".to_string(),
        Some("mkv") => "video/x-matroska".to_string(),
        Some("webm") => "video/webm".to_string(),
        Some("mp3") => "audio/mpeg".to_string(),
        Some("wav") => "audio/wav".to_string(),
        Some("flac") => "audio/flac".to_string(),
        Some("aac") => "audio/aac".to_string(),
        Some("ogg") => "audio/ogg".to_string(),
        Some("jpg") | Some("jpeg") => "image/jpeg".to_string(),
        Some("png") => "image/png".to_string(),
        Some("hdr") => "image/vnd.radiance".to_string(),
        Some("exr") => "image/x-exr".to_string(),
        Some("gif") => "image/gif".to_string(),
        Some("svg") => "image/svg+xml".to_string(),
        Some("webp") => "image/webp".to_string(),
        Some("ttf") => "font/ttf".to_string(),
        Some("otf") => "font/otf".to_string(),
        Some("woff") => "font/woff".to_string(),
        Some("woff2") => "font/woff2".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

fn canonical_file_path(path: PathBuf) -> ApiResult<PathBuf> {
    let canonical = path
        .canonicalize()
        .map_err(|error| ApiError::NotFound(format!("File access path rejected: {error}")))?;
    if !canonical.is_file() {
        return Err(ApiError::InvalidRequest(format!(
            "File access path is not a file: {:?}",
            canonical
        )));
    }
    Ok(canonical)
}

fn canonicalize_allowed_roots(allowed_roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut canonical_roots: Vec<PathBuf> = allowed_roots
        .into_iter()
        .filter_map(|path| match path.canonicalize() {
            Ok(canonical) => Some(canonical),
            Err(error) => {
                tracing::warn!(
                    "Ignoring invalid file access allowed root {:?}: {}",
                    path,
                    error
                );
                None
            }
        })
        .collect();
    if canonical_roots.is_empty() {
        if let Ok(current_dir) = std::env::current_dir().and_then(|path| path.canonicalize()) {
            canonical_roots.push(current_dir);
        }
    }
    canonical_roots
}

fn prune_expired_tokens(tokens: &mut HashMap<String, FileAccessRecord>) {
    let now = SystemTime::now();
    tokens.retain(|_, record| record.expires_at.is_none_or(|expires_at| expires_at > now));
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn registry_register_lookup_unregister_token() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        std::fs::write(&file_path, b"media").expect("write preview");
        let registry = FileAccessRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);

        let registered = registry
            .register(file_path.clone(), FileAccessPurpose::Preview)
            .expect("register token");
        assert_eq!(registered.file_size_bytes, 5);
        assert_eq!(registered.mime_type, "video/mp4");
        assert_eq!(
            registry
                .lookup_token(&registered.token)
                .expect("lookup token"),
            Some(file_path.canonicalize().expect("canonical file"))
        );

        registry
            .unregister_token(&registered.token)
            .expect("unregister token");
        assert_eq!(
            registry
                .lookup_token(&registered.token)
                .expect("lookup removed token"),
            None
        );
    }

    #[test]
    fn registry_rejects_path_outside_allowed_roots() {
        let allowed = tempdir().expect("allowed tempdir");
        let outside = tempdir().expect("outside tempdir");
        let outside_file = outside.path().join("secret.txt");
        std::fs::write(&outside_file, b"secret").expect("write outside file");

        let registry = FileAccessRegistry::with_allowed_roots(vec![allowed.path().to_path_buf()]);

        assert!(matches!(
            registry
                .register(outside_file, FileAccessPurpose::Preview)
                .expect_err("outside root rejected"),
            ApiError::InvalidRequest(_)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn registry_rejects_symlink_escape() {
        let allowed = tempdir().expect("allowed tempdir");
        let outside = tempdir().expect("outside tempdir");
        let outside_file = outside.path().join("secret.txt");
        std::fs::write(&outside_file, b"secret").expect("write outside file");
        let symlink = allowed.path().join("linked-secret.txt");
        std::os::unix::fs::symlink(&outside_file, &symlink).expect("create symlink");

        let registry = FileAccessRegistry::with_allowed_roots(vec![allowed.path().to_path_buf()]);

        assert!(matches!(
            registry
                .register(symlink, FileAccessPurpose::Preview)
                .expect_err("symlink escape rejected"),
            ApiError::InvalidRequest(_)
        ));
    }

    #[test]
    fn registry_prunes_expired_tokens_on_lookup_and_register() {
        let dir = tempdir().expect("tempdir");
        let expired_path = dir.path().join("expired.bin");
        let fresh_path = dir.path().join("fresh.bin");
        std::fs::write(&expired_path, b"old").expect("write expired");
        std::fs::write(&fresh_path, b"new").expect("write fresh");
        let registry = FileAccessRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        registry
            .insert_test_record(
                "expired".to_string(),
                expired_path.clone(),
                FileAccessPurpose::Other,
                Some(SystemTime::now() - Duration::from_secs(1)),
            )
            .expect("insert expired");

        assert_eq!(
            registry.lookup_token("expired").expect("lookup expired"),
            None
        );
        assert_eq!(registry.token_count().expect("token count"), 0);

        registry
            .insert_test_record(
                "expired-again".to_string(),
                expired_path,
                FileAccessPurpose::Other,
                Some(SystemTime::now() - Duration::from_secs(1)),
            )
            .expect("insert expired again");
        let fresh = registry
            .register(fresh_path, FileAccessPurpose::Preview)
            .expect("register fresh");
        assert!(registry
            .lookup_token(&fresh.token)
            .expect("lookup fresh")
            .is_some());
        assert_eq!(registry.token_count().expect("token count"), 1);
    }

    #[test]
    fn registry_rejects_new_tokens_when_capacity_is_full() {
        let dir = tempdir().expect("tempdir");
        let existing_path = dir.path().join("existing.bin");
        let new_path = dir.path().join("new.bin");
        std::fs::write(&existing_path, b"existing").expect("write existing");
        std::fs::write(&new_path, b"new").expect("write new");
        let registry = FileAccessRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);

        for index in 0..MAX_FILE_TOKENS {
            registry
                .insert_test_record(
                    format!("token-{index}"),
                    existing_path.clone(),
                    FileAccessPurpose::Other,
                    Some(SystemTime::now() + Duration::from_secs(FILE_TOKEN_TTL_SECS)),
                )
                .expect("insert token");
        }

        assert!(matches!(
            registry
                .register(new_path, FileAccessPurpose::Preview)
                .expect_err("capacity rejected"),
            ApiError::ServiceError(message) if message.contains("registry is full")
        ));
        assert_eq!(
            registry.token_count().expect("token count"),
            MAX_FILE_TOKENS
        );
    }
}
