//! Common types shared across modules

use serde::{Deserialize, Serialize};

/// Resolution (width x height)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

impl Resolution {
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }

    /// Common resolutions
    pub fn hd() -> Self {
        Self::new(1280, 720)
    }

    pub fn full_hd() -> Self {
        Self::new(1920, 1080)
    }

    pub fn uhd_4k() -> Self {
        Self::new(3840, 2160)
    }
}

impl Default for Resolution {
    fn default() -> Self {
        Self::full_hd()
    }
}

/// Frame/pixel format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrameFormat {
    #[default]
    Rgba,
    Nv12,
    Jpeg,
    Png,
    Webp,
    /// H.264 encoded NAL units (for streaming)
    H264,
    /// PCM F32 audio data (for streaming)
    PcmF32,
    /// Opus encoded audio packets (for streaming)
    Opus,
}

/// Track type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    #[default]
    Video,
    Audio,
    Text,
    Effect,
    Subtitle,
    Shape,
    /// Alias for Video (used in JVI files)
    #[serde(alias = "media")]
    Media,
}

/// Proxy file generation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyResult {
    pub proxy_id: String,
    pub original_id: String,
    pub proxy_path: String,
    pub resolution: String,
    pub codec: String,
}

/// Time range for operations
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub start: f64,
    pub end: f64,
}

impl TimeRange {
    pub fn new(start: f64, end: f64) -> Self {
        Self { start, end }
    }

    pub fn duration(&self) -> f64 {
        self.end - self.start
    }

    pub fn contains(&self, time: f64) -> bool {
        time >= self.start && time < self.end
    }
}
