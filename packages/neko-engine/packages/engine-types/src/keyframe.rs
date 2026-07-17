//! Keyframe types

use serde::{Deserialize, Serialize};

use crate::VideoCodecType;

/// Single keyframe info (videos:keyframes response item)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframeInfo {
    /// Frame index in video
    pub frame_index: u64,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Presentation timestamp
    pub pts: i64,
    /// NAL unit type (for H.264/H.265)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nal_type: Option<u8>,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Frame size in bytes (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

/// Keyframe index for a video file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframeIndex {
    /// Video codec type
    pub codec_type: VideoCodecType,
    /// Total keyframe count
    pub total_count: usize,
    /// Keyframe list
    pub keyframes: Vec<KeyframeInfo>,
    /// Average GOP size (frames between keyframes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_gop_size: Option<f64>,
}

impl KeyframeIndex {
    pub fn new(codec_type: VideoCodecType) -> Self {
        Self {
            codec_type,
            total_count: 0,
            keyframes: Vec::new(),
            avg_gop_size: None,
        }
    }

    /// Find nearest keyframe before or at the given timestamp
    pub fn find_keyframe_before(&self, timestamp: f64) -> Option<&KeyframeInfo> {
        self.keyframes
            .iter()
            .rev()
            .find(|kf| kf.timestamp <= timestamp)
    }

    /// Find nearest keyframe after the given timestamp
    pub fn find_keyframe_after(&self, timestamp: f64) -> Option<&KeyframeInfo> {
        self.keyframes.iter().find(|kf| kf.timestamp > timestamp)
    }

    /// Calculate average GOP size
    pub fn calculate_avg_gop(&mut self) {
        if self.keyframes.len() < 2 {
            self.avg_gop_size = None;
            return;
        }

        let total_frames: u64 = self
            .keyframes
            .windows(2)
            .map(|w| w[1].frame_index - w[0].frame_index)
            .sum();

        self.avg_gop_size = Some(total_frames as f64 / (self.keyframes.len() - 1) as f64);
    }
}
