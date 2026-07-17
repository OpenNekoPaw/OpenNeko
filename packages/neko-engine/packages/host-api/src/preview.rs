//! Preview registry and JSON wire contracts shared by ActionRouter and HTTP transport.

use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use neko_engine_types::FileAccessPurpose;
use neko_runtime_media::{
    default_panorama_view_state, generate_preview_variant as generate_runtime_variant,
    generated_proxy_needed, infer_dynamic_range, infer_projection, is_exr_path, is_hdr_path,
    probe_dimensions, read_sidecar, write_sidecar_update, ImageVariantFormat, ImageVariantRequest,
    ImageVariantRole, PanoramaCoverageAngle, PanoramaViewState, PreviewDimensions,
    PreviewDynamicRange, PreviewProjectionMetadata, PreviewProjectionType,
    ProjectionInferenceInput,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const MAX_PREVIEW_ASSETS: usize = 1024;

pub use crate::file_access::mime_for_path;

pub use neko_runtime_media::{
    PanoramaViewMode as RuntimePanoramaViewMode, PreviewProjectionType as RuntimeProjectionType,
};

/// Thread-safe map of opaque tokens and preview asset manifests.
pub struct PreviewFileRegistry {
    files: Arc<FileAccessRegistry>,
    assets: RwLock<HashMap<String, PreviewAssetRecord>>,
}

impl PreviewFileRegistry {
    pub fn new() -> Self {
        let roots = std::env::current_dir().ok().into_iter().collect();
        Self::with_allowed_roots(roots)
    }

    pub fn with_allowed_roots(allowed_roots: Vec<PathBuf>) -> Self {
        Self {
            files: Arc::new(FileAccessRegistry::with_allowed_roots(allowed_roots)),
            assets: RwLock::new(HashMap::new()),
        }
    }

    pub fn from_file_access(files: Arc<FileAccessRegistry>) -> Self {
        Self {
            files,
            assets: RwLock::new(HashMap::new()),
        }
    }

    pub fn file_access(&self) -> &Arc<FileAccessRegistry> {
        &self.files
    }

    pub fn set_allowed_roots(&self, allowed_roots: Vec<PathBuf>) -> ApiResult<()> {
        self.files.set_allowed_roots(allowed_roots)
    }

    /// Register a path and return a fresh UUID token.
    pub fn register(&self, path: PathBuf) -> ApiResult<String> {
        Ok(self.files.register(path, FileAccessPurpose::Preview)?.token)
    }

    /// Remove a previously registered token. No-op if unknown.
    pub fn unregister_token(&self, token: &str) -> ApiResult<()> {
        self.files.unregister_token(token)
    }

    pub fn register_asset(&self, body: RegisterPreviewAssetRequest) -> ApiResult<PreviewManifest> {
        let asset_id = Uuid::new_v4().to_string();
        let path = self.files.resolve_path(PathBuf::from(&body.source))?;
        let token = self.register_token(asset_id.clone(), path.clone())?;
        let mut manifest = build_preview_manifest(&asset_id, &token, &path, &body)?;
        let initial_proxy = generate_initial_proxy(&asset_id, &path, &manifest);
        let mut variant_tokens = Vec::new();
        let mut generated_variant_paths = Vec::new();
        if let Some(generated) = &initial_proxy {
            if let Some((token, path)) = &generated.token_registration {
                self.register_generated_token(token.clone(), path.clone())?;
                variant_tokens.push(token.clone());
                generated_variant_paths.push(path.clone());
            }
            if matches!(manifest.status, PreviewManifestStatus::RequiresProxy) {
                manifest.source_url = generated.variant.url.clone();
            }
            manifest.variants.push(generated.variant.clone());
        }

        let record = PreviewAssetRecord {
            path,
            token: token.clone(),
            manifest: manifest.clone(),
            variant_tokens,
            generated_variant_paths,
        };
        let mut guard = self.assets.write().map_err(|error| {
            ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
        })?;
        if guard.len() >= MAX_PREVIEW_ASSETS {
            drop(guard);
            self.unregister_token(&token)?;
            for token in &record.variant_tokens {
                self.unregister_token(token)?;
            }
            for path in &record.generated_variant_paths {
                cleanup_generated_file(path);
            }
            return Err(ApiError::ServiceError(
                "Preview asset registry is full".to_string(),
            ));
        }
        guard.insert(asset_id, record);
        Ok(manifest)
    }

    pub fn lookup_asset(&self, asset_id: &str) -> ApiResult<Option<PreviewManifest>> {
        let guard = self.assets.read().map_err(|error| {
            ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
        })?;
        Ok(guard.get(asset_id).map(|record| record.manifest.clone()))
    }

    pub fn request_variant(
        &self,
        asset_id: &str,
        body: PreviewVariantRequest,
    ) -> ApiResult<PreviewVariant> {
        let record = self
            .lookup_asset_record(asset_id)?
            .ok_or_else(|| ApiError::NotFound(format!("Preview asset not found: {asset_id}")))?;

        let build_result = build_preview_variant(&record, &body)?;
        if let Some((token, path)) = build_result.token_registration.clone() {
            self.register_asset_generated_variant(asset_id, token, path)?;
        }
        Ok(build_result.variant)
    }

    pub fn update_asset_metadata(
        &self,
        asset_id: &str,
        body: UpdatePreviewAssetMetadataRequest,
    ) -> ApiResult<PreviewManifest> {
        let mut guard = self.assets.write().map_err(|error| {
            ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
        })?;
        let Some(record) = guard.get_mut(asset_id) else {
            return Err(ApiError::NotFound(format!(
                "Preview asset not found: {asset_id}"
            )));
        };
        write_sidecar_update(
            &record.path,
            body.projection_type.clone(),
            body.default_view_state.clone(),
            body.coverage_angle.clone(),
        )
        .map_err(|error| ApiError::Internal(error.to_string()))?;
        let existing_variants: Vec<PreviewVariant> = record
            .manifest
            .variants
            .iter()
            .filter(|variant| {
                !matches!(
                    variant.role,
                    PreviewVariantRole::Source | PreviewVariantRole::Unsupported
                )
            })
            .cloned()
            .collect();
        let mut manifest = build_preview_manifest(
            &record.manifest.asset_id,
            &record.token,
            &record.path,
            &RegisterPreviewAssetRequest {
                source: record.path.to_string_lossy().to_string(),
                kind: Some(record.manifest.kind.clone()),
                expected_projection: None,
                explicit_open: None,
            },
        )?;
        if matches!(manifest.status, PreviewManifestStatus::RequiresProxy) {
            manifest.source_url = existing_variants
                .iter()
                .find(|variant| matches!(variant.role, PreviewVariantRole::Proxy))
                .and_then(|variant| variant.url.clone());
        }
        manifest.variants.extend(existing_variants);
        record.manifest = manifest;
        Ok(record.manifest.clone())
    }

    pub fn unregister_asset(&self, asset_id_or_token: &str) -> ApiResult<()> {
        let record = {
            let mut guard = self.assets.write().map_err(|error| {
                ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
            })?;
            if let Some(record) = guard.remove(asset_id_or_token) {
                Some(record)
            } else {
                let matching_asset_id = guard.iter().find_map(|(asset_id, record)| {
                    if record.token == asset_id_or_token
                        || record
                            .variant_tokens
                            .iter()
                            .any(|token| token == asset_id_or_token)
                    {
                        Some(asset_id.clone())
                    } else {
                        None
                    }
                });
                matching_asset_id.and_then(|asset_id| guard.remove(&asset_id))
            }
        };

        if let Some(record) = record {
            self.unregister_token(&record.token)?;
            for token in record.variant_tokens {
                self.unregister_token(&token)?;
            }
            for path in record.generated_variant_paths {
                cleanup_generated_file(&path);
            }
        } else {
            self.unregister_token(asset_id_or_token)?;
        }
        Ok(())
    }

    pub fn lookup_token(&self, token: &str) -> ApiResult<Option<PathBuf>> {
        self.files.lookup_token(token)
    }

    fn register_token(&self, token: String, path: PathBuf) -> ApiResult<String> {
        Ok(self
            .files
            .register_with_token(token, path, FileAccessPurpose::Preview)?
            .token)
    }

    fn register_generated_token(&self, token: String, path: PathBuf) -> ApiResult<String> {
        Ok(self
            .files
            .register_trusted_path_with_token(token, path, FileAccessPurpose::Preview)?
            .token)
    }

    fn lookup_asset_record(&self, asset_id: &str) -> ApiResult<Option<PreviewAssetRecord>> {
        let guard = self.assets.read().map_err(|error| {
            ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
        })?;
        Ok(guard.get(asset_id).cloned())
    }

    fn register_asset_generated_variant(
        &self,
        asset_id: &str,
        token: String,
        path: PathBuf,
    ) -> ApiResult<()> {
        self.register_generated_token(token.clone(), path.clone())?;
        let mut guard = self.assets.write().map_err(|error| {
            let _ = self.unregister_token(&token);
            cleanup_generated_file(&path);
            ApiError::Internal(format!("Preview asset registry lock poisoned: {error}"))
        })?;
        let Some(record) = guard.get_mut(asset_id) else {
            self.unregister_token(&token)?;
            cleanup_generated_file(&path);
            return Err(ApiError::NotFound(format!(
                "Preview asset not found: {asset_id}"
            )));
        };
        if record.token == token {
            return Ok(());
        }
        if !record.variant_tokens.iter().any(|item| item == &token) {
            record.variant_tokens.push(token);
        }
        if !record
            .generated_variant_paths
            .iter()
            .any(|item| item == &path)
        {
            record.generated_variant_paths.push(path);
        }
        Ok(())
    }
}

impl Default for PreviewFileRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod registry_tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn preview_registry_delegates_token_lookup_to_file_access_registry() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        fs::write(&file_path, b"media").expect("write preview");
        let files = Arc::new(FileAccessRegistry::with_allowed_roots(vec![dir
            .path()
            .to_path_buf()]));
        let registry = PreviewFileRegistry::from_file_access(files.clone());

        let token = registry
            .register(file_path.clone())
            .expect("register token");

        assert_eq!(
            registry.lookup_token(&token).expect("preview lookup"),
            files.lookup_token(&token).expect("file lookup")
        );
        registry
            .unregister_token(&token)
            .expect("unregister preview token");
        assert_eq!(files.lookup_token(&token).expect("lookup removed"), None);
    }
}

#[derive(Clone)]
struct PreviewAssetRecord {
    path: PathBuf,
    token: String,
    manifest: PreviewManifest,
    variant_tokens: Vec<String>,
    generated_variant_paths: Vec<PathBuf>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub file_path: String,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub token: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPreviewAssetRequest {
    pub source: String,
    pub kind: Option<PreviewAssetKind>,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewVariantRequest {
    pub role: PreviewVariantRole,
    pub view_state: Option<PanoramaViewState>,
    pub projection_type: Option<PreviewProjectionType>,
    pub coverage_angle: Option<PanoramaCoverageAngle>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub format: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreviewAssetMetadataRequest {
    pub projection_type: Option<PreviewProjectionType>,
    pub coverage_angle: Option<PanoramaCoverageAngle>,
    pub default_view_state: Option<PanoramaViewState>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewManifest {
    pub manifest_version: u8,
    pub asset_id: String,
    pub token: String,
    pub kind: PreviewAssetKind,
    pub status: PreviewManifestStatus,
    pub source_name: String,
    pub source_url: Option<String>,
    pub projection: PreviewProjectionMetadata,
    pub media: PreviewMediaMetadata,
    pub default_view_state: Option<PanoramaViewState>,
    pub variants: Vec<PreviewVariant>,
    pub error: Option<PreviewErrorState>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewAssetKind {
    Image,
    Video,
    Audio,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewManifestStatus {
    Ready,
    RequiresProxy,
    StreamRequired,
    Unsupported,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewVariantRole {
    Source,
    Proxy,
    Thumbnail,
    FovCrop,
    Tile,
    Stream,
    Screenshot,
    Unsupported,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCodecMetadata {
    pub container: Option<String>,
    pub image_format: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub pixel_format: Option<String>,
    pub color_space: Option<String>,
    pub duration_secs: Option<f64>,
    pub fps: Option<f64>,
    pub has_audio: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewMediaMetadata {
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: u64,
    pub mime_type: String,
    pub dynamic_range: PreviewDynamicRange,
    pub bit_depth: Option<u8>,
    pub codec: Option<PreviewCodecMetadata>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewErrorState {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
}

impl PreviewErrorState {
    pub fn gpu_busy(retry_after: Duration) -> Self {
        Self {
            code: "gpu-busy".to_string(),
            message: "GPU preview provider is busy; retry shortly".to_string(),
            recoverable: true,
            retry_after_ms: Some(retry_after.as_millis().try_into().unwrap_or(u64::MAX)),
        }
    }

    pub fn is_gpu_busy(&self) -> bool {
        self.code == "gpu-busy"
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewVariant {
    pub id: String,
    pub asset_id: String,
    pub role: PreviewVariantRole,
    pub url: Option<String>,
    pub token: Option<String>,
    pub mime_type: Option<String>,
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: Option<u64>,
    pub tile_template: Option<serde_json::Value>,
    pub stream: Option<serde_json::Value>,
    pub view_state: Option<PanoramaViewState>,
    pub error: Option<PreviewErrorState>,
}

pub fn preview_file_url(token: &str) -> String {
    format!("/v1/preview/file/{token}")
}

fn build_preview_manifest(
    asset_id: &str,
    token: &str,
    path: &Path,
    request: &RegisterPreviewAssetRequest,
) -> ApiResult<PreviewManifest> {
    let metadata = fs::metadata(path).map_err(|error| {
        ApiError::NotFound(format!("Preview source not found {:?}: {error}", path))
    })?;
    let file_size = metadata.len();
    let mime_type = mime_for_path(path);
    let kind = request
        .kind
        .clone()
        .unwrap_or_else(|| infer_asset_kind(path, &mime_type));
    let source_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("preview-asset")
        .to_string();
    let projection = probe_projection(path, request);
    let dimensions = probe_dimensions(path);
    let dynamic_range = infer_dynamic_range(path);
    let status = preview_manifest_status(path, &kind, file_size);
    let error = manifest_error(path, &status);
    let source_url = if matches!(status, PreviewManifestStatus::Ready) {
        Some(preview_file_url(token))
    } else {
        None
    };
    let source_variant = PreviewVariant {
        id: format!("{asset_id}:source"),
        asset_id: asset_id.to_string(),
        role: if matches!(status, PreviewManifestStatus::Unsupported) {
            PreviewVariantRole::Unsupported
        } else {
            PreviewVariantRole::Source
        },
        url: source_url.clone(),
        token: Some(token.to_string()),
        mime_type: Some(mime_type.clone()),
        dimensions: dimensions.clone(),
        file_size_bytes: Some(file_size),
        tile_template: None,
        stream: None,
        view_state: None,
        error: error.clone(),
    };

    Ok(PreviewManifest {
        manifest_version: 1,
        asset_id: asset_id.to_string(),
        token: token.to_string(),
        kind,
        status,
        source_name,
        source_url,
        projection,
        media: PreviewMediaMetadata {
            dimensions,
            file_size_bytes: file_size,
            mime_type,
            dynamic_range,
            bit_depth: None,
            codec: Some(PreviewCodecMetadata {
                container: path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| extension.to_ascii_lowercase()),
                image_format: image_format_for_path(path),
                video_codec: None,
                audio_codec: None,
                pixel_format: None,
                color_space: None,
                duration_secs: None,
                fps: None,
                has_audio: None,
            }),
        },
        default_view_state: read_sidecar(path)
            .and_then(|sidecar| sidecar.default_view_state)
            .or_else(|| Some(default_panorama_view_state())),
        variants: vec![source_variant],
        error,
        created_at: unix_timestamp_string(),
        expires_at: None,
    })
}

fn build_preview_variant(
    record: &PreviewAssetRecord,
    request: &PreviewVariantRequest,
) -> ApiResult<PreviewVariantBuildResult> {
    if matches!(request.role, PreviewVariantRole::Source) {
        let variant = record
            .manifest
            .variants
            .iter()
            .find(|variant| matches!(variant.role, PreviewVariantRole::Source))
            .cloned()
            .unwrap_or_else(|| PreviewVariant {
                id: format!("{}:source", record.manifest.asset_id),
                asset_id: record.manifest.asset_id.clone(),
                role: PreviewVariantRole::Source,
                url: record.manifest.source_url.clone(),
                token: Some(record.token.clone()),
                mime_type: Some(record.manifest.media.mime_type.clone()),
                dimensions: record.manifest.media.dimensions.clone(),
                file_size_bytes: Some(record.manifest.media.file_size_bytes),
                tile_template: None,
                stream: None,
                view_state: None,
                error: record.manifest.error.clone(),
            });
        return Ok(PreviewVariantBuildResult {
            variant,
            token_registration: None,
        });
    }

    generate_preview_variant(
        &record.manifest.asset_id,
        &record.path,
        &record.manifest,
        request,
    )
}

struct PreviewVariantBuildResult {
    variant: PreviewVariant,
    token_registration: Option<(String, PathBuf)>,
}

fn generate_initial_proxy(
    asset_id: &str,
    source_path: &Path,
    manifest: &PreviewManifest,
) -> Option<PreviewVariantBuildResult> {
    if manifest.error.is_some() || is_exr_path(source_path) {
        return None;
    }
    if !generated_proxy_needed(
        &manifest.media.dynamic_range,
        manifest.media.dimensions.as_ref(),
        &manifest.source_name,
        manifest.media.file_size_bytes,
    ) {
        return None;
    }
    let request = PreviewVariantRequest {
        role: PreviewVariantRole::Proxy,
        view_state: manifest.default_view_state.clone(),
        projection_type: Some(manifest.projection.projection_type.clone()),
        coverage_angle: manifest.projection.coverage_angle.clone(),
        width: None,
        height: None,
        quality: Some(82),
        format: Some("jpeg".to_string()),
    };
    generate_preview_variant(asset_id, source_path, manifest, &request).ok()
}

fn generate_preview_variant(
    asset_id: &str,
    source_path: &Path,
    manifest: &PreviewManifest,
    request: &PreviewVariantRequest,
) -> ApiResult<PreviewVariantBuildResult> {
    let Some(role) = to_image_variant_role(&request.role) else {
        return Ok(unsupported_variant(asset_id, manifest, request));
    };
    if manifest.error.is_some() || is_exr_path(source_path) {
        return Ok(unsupported_variant(asset_id, manifest, request));
    }

    let format = ImageVariantFormat::normalize(request.format.as_deref());
    let cache_dir = preview_cache_dir(asset_id)?;
    let token = Uuid::new_v4().to_string();
    let path = cache_dir.join(format!(
        "{}-{}.{}",
        role_slug(&request.role),
        token,
        format.extension()
    ));
    let artifact = generate_runtime_variant(
        source_path,
        &path,
        &ImageVariantRequest {
            role,
            view_state: request.view_state.clone(),
            projection_type: request
                .projection_type
                .clone()
                .or_else(|| Some(manifest.projection.projection_type.clone())),
            coverage_angle: request
                .coverage_angle
                .clone()
                .or_else(|| manifest.projection.coverage_angle.clone()),
            width: request.width,
            height: request.height,
            quality: request.quality,
            format,
        },
    )
    .map_err(|error| ApiError::ServiceError(error.to_string()))?;
    let variant = PreviewVariant {
        id: format!("{}:{}", manifest.asset_id, role_slug(&request.role)),
        asset_id: manifest.asset_id.clone(),
        role: request.role.clone(),
        url: Some(preview_file_url(&token)),
        token: Some(token.clone()),
        mime_type: Some(artifact.mime_type.to_string()),
        dimensions: Some(artifact.dimensions),
        file_size_bytes: Some(artifact.file_size_bytes),
        tile_template: None,
        stream: None,
        view_state: request.view_state.clone(),
        error: None,
    };
    Ok(PreviewVariantBuildResult {
        variant,
        token_registration: Some((token, artifact.path)),
    })
}

fn unsupported_variant(
    asset_id: &str,
    manifest: &PreviewManifest,
    request: &PreviewVariantRequest,
) -> PreviewVariantBuildResult {
    PreviewVariantBuildResult {
        variant: PreviewVariant {
            id: format!("{}:{}", asset_id, role_slug(&request.role)),
            asset_id: asset_id.to_string(),
            role: PreviewVariantRole::Unsupported,
            url: None,
            token: None,
            mime_type: None,
            dimensions: request
                .width
                .zip(request.height)
                .map(|(width, height)| PreviewDimensions { width, height }),
            file_size_bytes: None,
            tile_template: None,
            stream: None,
            view_state: request.view_state.clone(),
            error: manifest.error.clone().or_else(|| {
                Some(PreviewErrorState {
                    code: "unsupported-format".to_string(),
                    message: "Unsupported preview variant".to_string(),
                    recoverable: true,
                    retry_after_ms: None,
                })
            }),
        },
        token_registration: None,
    }
}

fn probe_projection(
    path: &Path,
    request: &RegisterPreviewAssetRequest,
) -> PreviewProjectionMetadata {
    let sidecar = read_sidecar(path);
    let sidecar_projection = sidecar
        .as_ref()
        .and_then(|sidecar| sidecar.projection_type.clone());
    let sidecar_coverage_angle = sidecar.and_then(|sidecar| sidecar.coverage_angle);
    infer_projection(
        path,
        &ProjectionInferenceInput {
            sidecar_projection,
            sidecar_coverage_angle,
            expected_projection: request.expected_projection.clone(),
            explicit_open: request.explicit_open.unwrap_or(false),
        },
    )
}

fn infer_asset_kind(path: &Path, mime_type: &str) -> PreviewAssetKind {
    if mime_type.starts_with("image/") {
        return PreviewAssetKind::Image;
    }
    if mime_type.starts_with("video/") {
        return PreviewAssetKind::Video;
    }
    if mime_type.starts_with("audio/") {
        return PreviewAssetKind::Audio;
    }

    match normalized_extension(path).as_deref() {
        Some("hdr") | Some("exr") | Some("jpg") | Some("jpeg") | Some("png") | Some("webp") => {
            PreviewAssetKind::Image
        }
        Some("mp4") | Some("mov") | Some("mkv") | Some("webm") | Some("m4v") => {
            PreviewAssetKind::Video
        }
        Some("mp3") | Some("wav") | Some("flac") | Some("aac") | Some("ogg") => {
            PreviewAssetKind::Audio
        }
        _ => PreviewAssetKind::Unknown,
    }
}

fn preview_manifest_status(
    path: &Path,
    kind: &PreviewAssetKind,
    file_size: u64,
) -> PreviewManifestStatus {
    if is_exr_path(path) {
        return PreviewManifestStatus::Unsupported;
    }
    if is_hdr_path(path) {
        return PreviewManifestStatus::RequiresProxy;
    }
    if matches!(kind, PreviewAssetKind::Video) {
        return PreviewManifestStatus::StreamRequired;
    }
    if matches!(kind, PreviewAssetKind::Image)
        && file_size > neko_runtime_media::image_variant::LARGE_IMAGE_PROXY_THRESHOLD_BYTES
    {
        return PreviewManifestStatus::RequiresProxy;
    }
    PreviewManifestStatus::Ready
}

fn manifest_error(path: &Path, status: &PreviewManifestStatus) -> Option<PreviewErrorState> {
    if !matches!(status, PreviewManifestStatus::Unsupported) {
        return None;
    }
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("unknown");
    let message = if is_exr_path(path) {
        format!("EXR preview requires a decoder that is not available for .{extension}")
    } else {
        format!("Unsupported preview format .{extension}")
    };
    Some(PreviewErrorState {
        code: "unsupported-format".to_string(),
        message,
        recoverable: true,
        retry_after_ms: None,
    })
}

fn to_image_variant_role(role: &PreviewVariantRole) -> Option<ImageVariantRole> {
    match role {
        PreviewVariantRole::Source => Some(ImageVariantRole::Source),
        PreviewVariantRole::Proxy => Some(ImageVariantRole::Proxy),
        PreviewVariantRole::Thumbnail => Some(ImageVariantRole::Thumbnail),
        PreviewVariantRole::FovCrop => Some(ImageVariantRole::FovCrop),
        PreviewVariantRole::Screenshot => Some(ImageVariantRole::Screenshot),
        PreviewVariantRole::Tile | PreviewVariantRole::Stream | PreviewVariantRole::Unsupported => {
            None
        }
    }
}

fn role_slug(role: &PreviewVariantRole) -> &'static str {
    match role {
        PreviewVariantRole::Source => "source",
        PreviewVariantRole::Proxy => "proxy",
        PreviewVariantRole::Thumbnail => "thumbnail",
        PreviewVariantRole::FovCrop => "fov-crop",
        PreviewVariantRole::Tile => "tile",
        PreviewVariantRole::Stream => "stream",
        PreviewVariantRole::Screenshot => "screenshot",
        PreviewVariantRole::Unsupported => "unsupported",
    }
}

fn image_format_for_path(path: &Path) -> Option<String> {
    match normalized_extension(path).as_deref() {
        Some("jpg") | Some("jpeg") => Some("jpeg".to_string()),
        Some("png") => Some("png".to_string()),
        Some("webp") => Some("webp".to_string()),
        Some("gif") => Some("gif".to_string()),
        Some("hdr") => Some("hdr".to_string()),
        Some("exr") => Some("exr".to_string()),
        _ => None,
    }
}

fn preview_cache_dir(asset_id: &str) -> ApiResult<PathBuf> {
    let dir = std::env::temp_dir()
        .join("neko-preview-cache")
        .join(asset_id);
    fs::create_dir_all(&dir).map_err(|error| {
        ApiError::Internal(format!(
            "Failed to create preview cache dir {:?}: {error}",
            dir
        ))
    })?;
    Ok(dir)
}

pub fn cleanup_generated_file(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            tracing::warn!(
                "Failed to remove generated preview variant {:?}: {}",
                path,
                error
            );
        }
    }
    if let Some(parent) = path.parent() {
        let _ = fs::remove_dir(parent);
    }
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn unix_timestamp_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{codecs::hdr::HdrEncoder, ImageBuffer, Rgb};
    use neko_runtime_media::PreviewProjectionConfidence;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn registry_register_lookup_unregister_token() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        fs::write(&file_path, b"media").expect("write preview");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);

        let token = registry
            .register(file_path.clone())
            .expect("register token");
        assert_eq!(
            registry.lookup_token(&token).expect("lookup token"),
            Some(file_path.canonicalize().expect("canonical file"))
        );

        registry.unregister_token(&token).expect("unregister token");
        assert_eq!(
            registry.lookup_token(&token).expect("lookup removed token"),
            None
        );
    }

    #[test]
    fn registry_rejects_path_outside_allowed_roots() {
        let allowed = tempdir().expect("allowed tempdir");
        let outside = tempdir().expect("outside tempdir");
        let outside_file = outside.path().join("secret.txt");
        fs::write(&outside_file, b"secret").expect("write outside file");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![allowed.path().to_path_buf()]);

        assert!(matches!(
            registry
                .register(outside_file)
                .expect_err("outside root rejected"),
            ApiError::InvalidRequest(_)
        ));
    }

    #[test]
    fn asset_manifest_uses_runtime_media_projection_analysis() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("studio_360.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            })
            .expect("register asset");

        assert_eq!(manifest.kind, PreviewAssetKind::Image);
        assert_eq!(manifest.status, PreviewManifestStatus::Ready);
        assert_eq!(
            manifest.projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            manifest.projection.confidence,
            PreviewProjectionConfidence::TrustedFilename
        );
        assert_eq!(
            manifest
                .media
                .dimensions
                .as_ref()
                .map(|d| (d.width, d.height)),
            Some((4, 2))
        );
        assert_eq!(
            registry
                .lookup_token(&manifest.token)
                .expect("lookup token"),
            Some(image_path.canonicalize().expect("canonical image"))
        );
    }

    #[test]
    fn sidecar_manual_projection_takes_priority() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary-wide.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");
        write_sidecar_update(
            &image_path,
            Some(PreviewProjectionType::Cylindrical),
            Some(PanoramaViewState {
                yaw_deg: 42.0,
                mode: RuntimePanoramaViewMode::Cylindrical,
                ..default_panorama_view_state()
            }),
            Some(PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 65.0,
            }),
        )
        .expect("write sidecar");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: Some(false),
            })
            .expect("manifest");

        assert_eq!(
            manifest.projection.projection_type,
            PreviewProjectionType::Cylindrical
        );
        assert_eq!(
            manifest.projection.confidence,
            PreviewProjectionConfidence::Manual
        );
        assert_eq!(
            manifest
                .default_view_state
                .as_ref()
                .map(|state| state.yaw_deg),
            Some(42.0)
        );
        assert_eq!(
            manifest.projection.coverage_angle,
            Some(PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 65.0,
            })
        );
    }

    #[test]
    fn hdr_proxy_and_exr_unsupported_state() {
        let dir = tempdir().expect("tempdir");
        let hdr_path = dir.path().join("studio.hdr");
        write_test_hdr(&hdr_path);
        let exr_path = dir.path().join("studio.exr");
        fs::write(&exr_path, b"v/1\x01").expect("write exr");

        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let hdr_manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: hdr_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            })
            .expect("register hdr asset");
        assert_eq!(hdr_manifest.status, PreviewManifestStatus::RequiresProxy);
        assert_eq!(hdr_manifest.media.dynamic_range, PreviewDynamicRange::Hdr);
        let proxy = hdr_manifest
            .variants
            .iter()
            .find(|variant| matches!(variant.role, PreviewVariantRole::Proxy))
            .expect("hdr proxy variant");
        assert_eq!(proxy.mime_type.as_deref(), Some("image/jpeg"));
        assert_eq!(hdr_manifest.source_url, proxy.url);

        let exr_manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: exr_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            })
            .expect("register exr asset");
        assert_eq!(exr_manifest.status, PreviewManifestStatus::Unsupported);
        assert_eq!(exr_manifest.media.dynamic_range, PreviewDynamicRange::Hdr);
        assert_eq!(
            exr_manifest.error.as_ref().map(|error| error.code.as_str()),
            Some("unsupported-format")
        );
    }

    #[test]
    fn request_variant_generates_file_token() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 20, 20]));
        image.save(&image_path).expect("save image");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            })
            .expect("register asset");

        let variant = registry
            .request_variant(
                &manifest.asset_id,
                PreviewVariantRequest {
                    role: PreviewVariantRole::Thumbnail,
                    view_state: None,
                    projection_type: None,
                    coverage_angle: None,
                    width: Some(128),
                    height: Some(64),
                    quality: Some(80),
                    format: Some("png".to_string()),
                },
            )
            .expect("build thumbnail");

        let token = variant.token.as_deref().expect("variant token");
        assert!(variant
            .url
            .as_deref()
            .unwrap_or_default()
            .starts_with("/v1/preview/file/"));
        assert!(registry
            .lookup_token(token)
            .expect("lookup token")
            .is_some());
        registry
            .unregister_asset(&manifest.asset_id)
            .expect("cleanup generated variant");
    }

    #[test]
    fn request_variant_accepts_projection_and_coverage_override() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([20, 20, 20]));
        image.save(&image_path).expect("save image");
        let registry = PreviewFileRegistry::with_allowed_roots(vec![dir.path().to_path_buf()]);
        let manifest = registry
            .register_asset(RegisterPreviewAssetRequest {
                source: image_path.to_string_lossy().to_string(),
                kind: Some(PreviewAssetKind::Image),
                expected_projection: None,
                explicit_open: None,
            })
            .expect("register asset");

        let variant = registry
            .request_variant(
                &manifest.asset_id,
                PreviewVariantRequest {
                    role: PreviewVariantRole::FovCrop,
                    view_state: Some(PanoramaViewState {
                        mode: RuntimePanoramaViewMode::Cylindrical,
                        ..default_panorama_view_state()
                    }),
                    projection_type: Some(PreviewProjectionType::Cylindrical),
                    coverage_angle: Some(PanoramaCoverageAngle {
                        horizontal_deg: 180.0,
                        vertical_deg: 65.0,
                    }),
                    width: Some(64),
                    height: Some(64),
                    quality: Some(80),
                    format: Some("jpeg".to_string()),
                },
            )
            .expect("build fov crop");

        assert_eq!(variant.role, PreviewVariantRole::FovCrop);
        assert_eq!(
            variant.dimensions.as_ref().map(|d| (d.width, d.height)),
            Some((64, 64))
        );
        assert!(variant.token.is_some());
    }

    fn write_test_hdr(path: &Path) {
        let file = File::create(path).expect("create hdr");
        let pixels = vec![
            Rgb([0.25_f32, 0.5, 1.0]),
            Rgb([1.5, 0.2, 0.1]),
            Rgb([0.1, 1.0, 0.2]),
            Rgb([2.0, 2.0, 2.0]),
            Rgb([0.25_f32, 0.5, 1.0]),
            Rgb([1.5, 0.2, 0.1]),
            Rgb([0.1, 1.0, 0.2]),
            Rgb([2.0, 2.0, 2.0]),
        ];
        HdrEncoder::new(file)
            .encode(&pixels, 4, 2)
            .expect("encode hdr");
    }
}
