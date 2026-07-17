//! Decoder trait and types

use crate::error::Result;

pub use neko_engine_types::{DecodedGpuTextureHandle as GpuTextureHandle, PixelFormat};

/// Frame data - either CPU buffer or GPU texture handle
#[derive(Debug)]
pub enum FrameData {
    /// CPU memory buffer
    Cpu(Vec<u8>),
    /// GPU texture handle (platform-specific)
    Gpu(GpuTextureHandle),
}

/// Decoded video frame
#[derive(Debug)]
pub struct DecodedFrame {
    /// Frame width in pixels
    pub width: u32,
    /// Frame height in pixels
    pub height: u32,
    /// Pixel format
    pub format: PixelFormat,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Frame data
    pub data: FrameData,
}

impl DecodedFrame {
    /// Get frame data as bytes (only for CPU frames)
    pub fn as_bytes(&self) -> Option<&[u8]> {
        match &self.data {
            FrameData::Cpu(data) => Some(data),
            FrameData::Gpu(_) => None,
        }
    }

    /// Take ownership of CPU frame data
    pub fn into_bytes(self) -> Option<Vec<u8>> {
        match self.data {
            FrameData::Cpu(data) => Some(data),
            FrameData::Gpu(_) => None,
        }
    }
}

/// Media information
#[derive(Debug, Clone)]
pub struct MediaInfo {
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Duration in seconds
    pub duration: f64,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video codec name
    pub codec: String,
    /// Pixel format string
    pub pixel_format: String,
    /// Total number of frames (estimated)
    pub frame_count: u64,
}

/// Decoder trait for video decoding
pub trait Decoder {
    /// Open a video file
    fn open(&mut self, path: &str) -> Result<MediaInfo>;

    /// Seek to a specific time position
    fn seek(&mut self, time_seconds: f64) -> Result<()>;

    /// Decode the next frame
    fn decode_next(&mut self) -> Result<Option<DecodedFrame>>;

    /// Decode frame at specific time
    fn decode_at(&mut self, time_seconds: f64) -> Result<Option<DecodedFrame>> {
        self.seek(time_seconds)?;
        self.decode_next()
    }

    /// Get current position in seconds
    fn position(&self) -> f64;

    /// Get media info (must call open first)
    fn media_info(&self) -> Option<&MediaInfo>;

    /// Close the decoder and release resources
    fn close(&mut self);
}
