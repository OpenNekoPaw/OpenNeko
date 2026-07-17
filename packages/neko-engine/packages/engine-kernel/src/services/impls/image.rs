//! ImageService implementation
//!
//! Provides image-related operations: probing and capture.

use crate::domain::{CaptureOptions, FrameData};
use crate::error::{Error, Result};
use crate::services::impls::common::convert_media_info;
use crate::services::IImageService;
use async_trait::async_trait;
use neko_engine_codec::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use neko_engine_gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
use neko_engine_types::{FrameFormat, MediaInfo};
use neko_runtime_media::{encode_rgba_to_jpeg, global_probe_cache};
use std::path::Path;
use std::sync::Arc;

/// ImageService implementation
///
/// Wraps decoder and GPU pipeline for image probing and capture.
/// Images are treated as single-frame media (time = 0.0).
pub struct ImageService {
    /// GPU context for hardware acceleration
    gpu_ctx: Option<Arc<GpuContext>>,
}

impl ImageService {
    /// Create a new ImageService
    pub fn new(gpu_ctx: Option<Arc<GpuContext>>) -> Self {
        Self { gpu_ctx }
    }
}

#[async_trait]
impl IImageService for ImageService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || global_probe_cache().probe(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(convert_media_info(info))
    }

    async fn capture(&self, source: &Path, options: CaptureOptions) -> Result<FrameData> {
        let path = source.to_string_lossy().to_string();
        let gpu_ctx = self.gpu_ctx.clone();
        let quality = options.quality;
        let format = options.format;

        let result = tokio::task::spawn_blocking(move || -> Result<FrameData> {
            let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

            let media_info = decoder.open(&path)?;
            let width = media_info.width;
            let height = media_info.height;

            // Images are single-frame, decode at time 0.0
            let gpu_texture = decoder
                .decode_gpu_at(0.0)?
                .ok_or_else(|| Error::Other("No frame in image".to_string()))?;

            if let Some(ctx) = gpu_ctx {
                let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                let nv12_texture = importer.import(&gpu_texture)?;

                let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                let output_texture = renderer.create_output_texture(width, height);
                let output_view =
                    output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                let rgba_data = ctx.read_texture_sync(&output_texture, width, height)?;

                let (data, output_format) = match format {
                    FrameFormat::Jpeg => {
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                    FrameFormat::Rgba => (rgba_data, FrameFormat::Rgba),
                    _ => {
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                };

                Ok(FrameData {
                    data,
                    width,
                    height,
                    format: output_format,
                    timestamp: 0.0,
                    diagnostics: None,
                })
            } else {
                Err(Error::Other("GPU context required for capture".to_string()))
            }
        })
        .await
        .map_err(|e| Error::Other(format!("Capture task failed: {}", e)))??;

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_service() -> ImageService {
        ImageService::new(None)
    }

    #[tokio::test]
    async fn test_image_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.png")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_image_service_capture_no_gpu() {
        let service = create_test_service();
        let options = CaptureOptions::default();
        let result = service
            .capture(Path::new("/nonexistent/file.png"), options)
            .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_image_service_trait_object() {
        fn _assert_impl<T: IImageService>() {}
        _assert_impl::<ImageService>();
    }
}
