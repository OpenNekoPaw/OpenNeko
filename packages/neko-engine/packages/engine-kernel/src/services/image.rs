//! Image service trait

use crate::domain::{CaptureOptions, FrameData};
use crate::error::Result;
use async_trait::async_trait;
use neko_engine_types::MediaInfo;
use std::path::Path;

/// Image service interface
///
/// Handles image-related operations: probing and capture.
#[async_trait]
pub trait IImageService: Send + Sync {
    /// Probe image file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Capture/load image with optional transformations
    async fn capture(&self, source: &Path, options: CaptureOptions) -> Result<FrameData>;
}
