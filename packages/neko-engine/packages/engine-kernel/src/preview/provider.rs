//! Preview provider contracts and CPU-backed default providers.

// TODO(P2): wire these providers into host preview routes once the preview
// registry fully replaces the host-api file registry path.
#![allow(dead_code)]

use crate::error::{Error, Result};
use neko_runtime_media::{
    infer_projection, read_sidecar, ImageVariantFormat, ImageVariantRequest, ImageVariantRole,
    PreviewDimensions, PreviewProjectionMetadata, PreviewProjectionType, ProjectionInferenceInput,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProviderKind {
    Image,
    Video,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewArtifactKind {
    Analysis,
    Variant,
    Snapshot,
    Stream,
    Unsupported,
}

#[derive(Clone, Debug)]
pub struct PreviewRequest {
    pub source: PathBuf,
    pub kind: PreviewProviderKind,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: bool,
    pub variant: Option<PreviewProviderVariantRequest>,
}

#[derive(Clone, Debug)]
pub struct PreviewProviderVariantRequest {
    pub output_path: PathBuf,
    pub role: ImageVariantRole,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub quality: Option<u8>,
    pub format: ImageVariantFormat,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewArtifact {
    pub provider_id: String,
    pub kind: PreviewArtifactKind,
    pub source: String,
    pub projection: Option<PreviewProjectionMetadata>,
    pub output_path: Option<String>,
    pub mime_type: Option<String>,
    pub dimensions: Option<PreviewDimensions>,
    pub file_size_bytes: Option<u64>,
    pub metadata: Option<Value>,
    pub error: Option<String>,
}

pub trait PreviewProvider: Send + Sync {
    fn id(&self) -> &'static str;

    fn supports(&self, request: &PreviewRequest) -> bool;

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact>;
}

#[derive(Default)]
pub struct PreviewProviderRegistry {
    providers: HashMap<&'static str, Arc<dyn PreviewProvider>>,
}

impl PreviewProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }

    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        registry.register(ImagePreviewProvider);
        registry.register(VideoPreviewProvider);
        registry
    }

    pub fn register<P>(&mut self, provider: P)
    where
        P: PreviewProvider + 'static,
    {
        self.providers.insert(provider.id(), Arc::new(provider));
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn PreviewProvider>> {
        self.providers.get(id).cloned()
    }

    pub fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let Some(provider) = self
            .providers
            .values()
            .find(|provider| provider.supports(request))
        else {
            return Err(Error::UnsupportedCapability(format!(
                "No preview provider supports {:?}",
                request.source
            )));
        };
        provider.generate(request)
    }

    pub fn provider_ids(&self) -> Vec<&'static str> {
        let mut ids: Vec<_> = self.providers.keys().copied().collect();
        ids.sort_unstable();
        ids
    }
}

pub struct ImagePreviewProvider;

impl PreviewProvider for ImagePreviewProvider {
    fn id(&self) -> &'static str {
        "image"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Image) || is_supported_image(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let sidecar = read_sidecar(&request.source);
        let sidecar_projection = sidecar
            .as_ref()
            .and_then(|sidecar| sidecar.projection_type.clone());
        let sidecar_coverage_angle = sidecar.and_then(|sidecar| sidecar.coverage_angle);
        let projection = infer_projection(
            &request.source,
            &ProjectionInferenceInput {
                sidecar_projection,
                sidecar_coverage_angle,
                expected_projection: request.expected_projection.clone(),
                explicit_open: request.explicit_open,
            },
        );

        if let Some(variant) = &request.variant {
            let artifact = neko_runtime_media::generate_preview_variant(
                &request.source,
                &variant.output_path,
                &ImageVariantRequest {
                    role: variant.role.clone(),
                    view_state: None,
                    projection_type: Some(projection.projection_type.clone()),
                    coverage_angle: projection.coverage_angle.clone(),
                    width: variant.width,
                    height: variant.height,
                    quality: variant.quality,
                    format: variant.format,
                },
            )
            .map_err(|error| Error::Other(error.to_string()))?;

            return Ok(PreviewArtifact {
                provider_id: self.id().to_string(),
                kind: PreviewArtifactKind::Variant,
                source: request.source.to_string_lossy().to_string(),
                projection: Some(projection),
                output_path: Some(artifact.path.to_string_lossy().to_string()),
                mime_type: Some(artifact.mime_type.to_string()),
                dimensions: Some(artifact.dimensions),
                file_size_bytes: Some(artifact.file_size_bytes),
                metadata: None,
                error: None,
            });
        }

        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Analysis,
            source: request.source.to_string_lossy().to_string(),
            projection: Some(projection),
            output_path: None,
            mime_type: None,
            dimensions: None,
            file_size_bytes: None,
            metadata: None,
            error: None,
        })
    }
}

pub struct VideoPreviewProvider;

impl PreviewProvider for VideoPreviewProvider {
    fn id(&self) -> &'static str {
        "video"
    }

    fn supports(&self, request: &PreviewRequest) -> bool {
        matches!(request.kind, PreviewProviderKind::Video) || is_supported_video(&request.source)
    }

    fn generate(&self, request: &PreviewRequest) -> Result<PreviewArtifact> {
        let sidecar = read_sidecar(&request.source);
        let sidecar_projection = sidecar
            .as_ref()
            .and_then(|sidecar| sidecar.projection_type.clone());
        let sidecar_coverage_angle = sidecar.and_then(|sidecar| sidecar.coverage_angle);
        let projection = infer_projection(
            &request.source,
            &ProjectionInferenceInput {
                sidecar_projection,
                sidecar_coverage_angle,
                expected_projection: request.expected_projection.clone(),
                explicit_open: request.explicit_open,
            },
        );
        Ok(PreviewArtifact {
            provider_id: self.id().to_string(),
            kind: PreviewArtifactKind::Analysis,
            source: request.source.to_string_lossy().to_string(),
            projection: Some(projection),
            output_path: None,
            mime_type: None,
            dimensions: None,
            file_size_bytes: None,
            metadata: None,
            error: None,
        })
    }
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("hdr" | "exr" | "jpg" | "jpeg" | "png" | "webp")
    )
}

fn is_supported_video(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("mp4" | "m4v" | "mov" | "mkv" | "webm")
    )
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use tempfile::tempdir;

    #[test]
    fn registry_routes_image_request_to_image_provider() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("studio_360.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");
        let registry = PreviewProviderRegistry::with_defaults();

        let artifact = registry
            .generate(&PreviewRequest {
                source: image_path,
                kind: PreviewProviderKind::Image,
                expected_projection: None,
                explicit_open: false,
                variant: None,
            })
            .expect("generate image preview");

        assert_eq!(artifact.provider_id, "image");
        assert_eq!(artifact.kind, PreviewArtifactKind::Analysis);
        assert_eq!(
            artifact.projection.unwrap().projection_type,
            PreviewProjectionType::Equirectangular
        );
    }

    #[test]
    fn registry_registers_media_preview_providers() {
        let registry = PreviewProviderRegistry::with_defaults();
        assert_eq!(registry.provider_ids(), vec!["image", "video"]);
    }

    #[test]
    fn video_provider_returns_projection_analysis() {
        let registry = PreviewProviderRegistry::with_defaults();
        let artifact = registry
            .generate(&PreviewRequest {
                source: PathBuf::from("tour_360.mp4"),
                kind: PreviewProviderKind::Video,
                expected_projection: Some(PreviewProjectionType::Equirectangular),
                explicit_open: true,
                variant: None,
            })
            .expect("video provider");

        assert_eq!(artifact.provider_id, "video");
        assert_eq!(artifact.kind, PreviewArtifactKind::Analysis);
        assert_eq!(
            artifact.projection.unwrap().projection_type,
            PreviewProjectionType::Equirectangular
        );
    }
}
