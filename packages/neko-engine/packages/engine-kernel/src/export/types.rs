//! Export types - Data structures for video export
//!
//! Export-specific types (settings, progress, responses).
//! Timeline/Track/Element types are in `domain::timeline`.

use serde::{Deserialize, Serialize};

use crate::domain::Timeline;
use crate::encoder::EncoderConfig;
use neko_engine_types::{AudioCodec, EncoderPreset, HwEncoderType, VideoCodec};

// Re-export neko_engine_types enums as the old names for backward compatibility
pub type ExportVideoCodec = VideoCodec;
pub type ExportAudioCodec = AudioCodec;
pub type ExportHwEncoder = HwEncoderType;
pub type ExportPreset = EncoderPreset;

// =============================================================================
// Export Job Configuration
// =============================================================================

/// Export job configuration from Extension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobConfig {
    /// Unique job ID
    pub job_id: String,
    /// Output file path
    pub output_path: String,
    /// Export settings
    pub settings: ExportSettings,
    /// Timeline data (unified domain model)
    pub timeline: Timeline,
}

/// Export settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video codec
    #[serde(default)]
    pub video_codec: VideoCodec,
    /// Video bitrate (bps)
    pub video_bitrate: Option<u64>,
    /// Audio codec
    #[serde(default)]
    pub audio_codec: AudioCodec,
    /// Audio bitrate (bps)
    pub audio_bitrate: Option<u64>,
    /// Hardware encoder type
    #[serde(default)]
    pub hw_encoder: HwEncoderType,
    /// Time range to export (optional, exports full timeline if not specified)
    pub time_range: Option<TimeRange>,
    /// Encoder preset
    #[serde(default)]
    pub preset: EncoderPreset,
    /// Enable zero-copy GPU encoding (macOS VideoToolbox only)
    #[serde(default)]
    pub use_zero_copy_gpu: bool,
}

impl ExportSettings {
    /// Convert to EncoderConfig
    pub fn to_encoder_config(&self) -> EncoderConfig {
        let mut config = EncoderConfig::new(self.width, self.height, self.fps, self.video_codec);

        if let Some(bitrate) = self.video_bitrate {
            config = config.with_bitrate(bitrate);
        }

        config = config
            .with_preset(self.preset)
            .with_hw_encoder(self.hw_encoder)
            .with_zero_copy_gpu(self.use_zero_copy_gpu);

        config
    }
}

/// Time range for partial export
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
}

// =============================================================================
// Export Progress
// =============================================================================

/// Export progress update
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    /// Job ID
    pub job_id: String,
    /// Current state
    pub state: ExportState,
    /// Progress percentage (0.0 - 100.0)
    pub progress: f64,
    /// Current frame being processed
    pub current_frame: u64,
    /// Total frames to process
    pub total_frames: u64,
    /// Elapsed time in milliseconds
    pub elapsed_ms: u64,
    /// Estimated remaining time in milliseconds
    pub estimated_remaining_ms: u64,
    /// Error message if state is Error
    pub error: Option<String>,
    /// Export metadata (populated after initialization)
    pub metadata: Option<ExportMetadata>,
    /// Performance statistics
    pub stats: Option<ExportStats>,
}

/// Export metadata - basic info about the export
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMetadata {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video bitrate (bps)
    pub video_bitrate: u64,
    /// Audio bitrate (bps)
    pub audio_bitrate: u64,
    /// Video codec name
    pub video_codec: String,
    /// Audio codec name
    pub audio_codec: String,
    /// Render mode (wgpu)
    pub render_mode: String,
    /// Hardware encoder type (if used)
    pub hw_encoder: Option<String>,
}

/// Export performance statistics
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportStats {
    // === Detailed Pipeline Timing (per-frame average in milliseconds) ===
    /// Hardware decode time (VideoToolbox/NVDEC)
    pub hw_decode_ms: f64,
    /// NV12 texture import to wgpu (CPU→GPU transfer)
    pub nv12_import_ms: f64,
    /// NV12 to RGBA conversion (GPU shader)
    pub nv12_to_rgba_ms: f64,
    /// Layer composition (GPU render)
    pub composite_ms: f64,
    /// RGBA to NV12 conversion for encoder (GPU compute)
    pub rgba_to_nv12_ms: f64,
    /// GPU data readback to CPU (for software encoder)
    pub cpu_readback_ms: f64,
    /// Encoder submission time
    pub encode_submit_ms: f64,

    // === Aggregate Timing (backward compatible, in milliseconds) ===
    /// Total decode time (hw_decode alias)
    pub decode_time_ms: u64,
    /// Total GPU pipeline time (import + nv12→rgba + composite + rgba→nv12 + readback)
    pub composite_time_ms: u64,
    /// Total encode time
    pub encode_time_ms: f64,
    /// Mux time
    pub mux_time_ms: u64,

    // === Performance Metrics ===
    /// Average FPS during export
    pub avg_fps: f64,
    /// Peak memory usage in bytes
    pub peak_memory_bytes: u64,
    /// Average CPU usage percentage (0.0 - 100.0)
    pub cpu_usage_percent: f64,
    /// Average GPU usage percentage (0.0 - 100.0), null if unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_usage_percent: Option<f64>,
    /// Peak VRAM usage in bytes, null if unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_usage_bytes: Option<u64>,
}

/// Export state
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportState {
    /// Job is queued
    Pending,
    /// Initializing decoders and encoders
    Initializing,
    /// Decoding source media
    Decoding,
    /// Compositing frames
    Compositing,
    /// Encoding video
    Encoding,
    /// Muxing audio/video
    Muxing,
    /// Finalizing output file
    Finalizing,
    /// Export completed successfully
    Completed,
    /// Export was cancelled
    Cancelled,
    /// Export failed with error
    Error,
}

// =============================================================================
// Queue Types
// =============================================================================

/// Status of a job in the export queue
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum QueueStatus {
    /// Waiting to start
    Pending,
    /// Currently running
    Running,
    /// Finished successfully
    Completed,
    /// Failed with error
    Failed,
    /// Cancelled by user
    Cancelled,
}

/// Entry in the export queue (pending or active)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntry {
    /// Job ID
    pub job_id: String,
    /// Queue status
    pub status: QueueStatus,
    /// Unix millisecond timestamp when the entry was created
    pub created_at: u64,
}

// =============================================================================
// API Response Types
// =============================================================================

/// Response for POST /export/start
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStartResponse {
    /// Job ID
    pub job_id: String,
    /// Total frames to export
    pub total_frames: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::Resolution;

    #[test]
    fn test_export_settings_to_encoder_config() {
        let settings = ExportSettings {
            width: 1920,
            height: 1080,
            fps: 30.0,
            video_codec: VideoCodec::H264,
            video_bitrate: Some(5_000_000),
            audio_codec: AudioCodec::Aac,
            audio_bitrate: Some(128_000),
            hw_encoder: HwEncoderType::Auto,
            time_range: None,
            preset: EncoderPreset::Fast,
            use_zero_copy_gpu: false,
        };

        let config = settings.to_encoder_config();
        assert_eq!(config.width, 1920);
        assert_eq!(config.height, 1080);
    }

    #[test]
    fn test_timeline_total_frames() {
        let timeline = Timeline::new(Resolution::full_hd(), 30.0);
        assert_eq!(timeline.total_frames(), 0); // duration is 0.0
    }
}
