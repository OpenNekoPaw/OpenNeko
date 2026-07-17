//! Frame data types

use neko_engine_types::FrameFormat;
use neko_engine_types::RenderFrameDiagnostics;

/// Decoded frame data — output of capture/extract/composite operations
#[derive(Debug, Clone)]
pub struct FrameData {
    /// Raw pixel data
    pub data: Vec<u8>,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Pixel format
    pub format: FrameFormat,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Optional producer-side render diagnostics for realtime streams.
    pub diagnostics: Option<RenderFrameDiagnostics>,
}

impl FrameData {
    /// Create a new frame
    pub fn new(data: Vec<u8>, width: u32, height: u32, format: FrameFormat) -> Self {
        Self {
            data,
            width,
            height,
            format,
            timestamp: 0.0,
            diagnostics: None,
        }
    }

    /// Create with timestamp
    pub fn with_timestamp(mut self, timestamp: f64) -> Self {
        self.timestamp = timestamp;
        self
    }

    /// Get frame size in bytes
    pub fn size(&self) -> usize {
        self.data.len()
    }

    /// Check if frame is empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Get expected size based on dimensions and format
    pub fn expected_size(&self) -> usize {
        let pixels = (self.width * self.height) as usize;
        match self.format {
            FrameFormat::Rgba => pixels * 4,
            FrameFormat::Nv12 => pixels * 3 / 2,
            FrameFormat::Jpeg
            | FrameFormat::Png
            | FrameFormat::Webp
            | FrameFormat::H264
            | FrameFormat::PcmF32
            | FrameFormat::Opus => self.data.len(), // Compressed/packed
        }
    }
}
