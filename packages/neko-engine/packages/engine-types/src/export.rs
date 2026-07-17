//! Export types — settings, progress, and metadata

use serde::{Deserialize, Serialize};

use crate::{AudioCodec, EncoderPreset, HwEncoderType, Resolution, TimeRange, VideoCodec};

/// Export state machine
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportState {
    #[default]
    Pending,
    Initializing,
    Decoding,
    Compositing,
    Encoding,
    Muxing,
    Finalizing,
    Completed,
    Paused,
    Cancelled,
    Error,
}

impl ExportState {
    /// Check if export is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled | Self::Error)
    }

    /// Check if export is actively processing
    pub fn is_processing(&self) -> bool {
        matches!(
            self,
            Self::Initializing
                | Self::Decoding
                | Self::Compositing
                | Self::Encoding
                | Self::Muxing
                | Self::Finalizing
        )
    }
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
    /// Video bitrate in bps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_bitrate: Option<u64>,
    /// Audio codec
    #[serde(default)]
    pub audio_codec: AudioCodec,
    /// Audio bitrate in bps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_bitrate: Option<u64>,
    /// Hardware encoder type
    #[serde(default)]
    pub hw_encoder: HwEncoderType,
    /// Encoder preset
    #[serde(default)]
    pub preset: EncoderPreset,
    /// Time range to export (None = full timeline)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_range: Option<TimeRange>,
    /// Enable zero-copy GPU encoding (macOS VideoToolbox)
    #[serde(default)]
    pub use_zero_copy_gpu: bool,
}

impl ExportSettings {
    pub fn new(width: u32, height: u32, fps: f64) -> Self {
        Self {
            width,
            height,
            fps,
            video_codec: VideoCodec::default(),
            video_bitrate: None,
            audio_codec: AudioCodec::default(),
            audio_bitrate: None,
            hw_encoder: HwEncoderType::default(),
            preset: EncoderPreset::default(),
            time_range: None,
            use_zero_copy_gpu: false,
        }
    }

    pub fn resolution(&self) -> Resolution {
        Resolution::new(self.width, self.height)
    }

    pub fn with_video_codec(mut self, codec: VideoCodec) -> Self {
        self.video_codec = codec;
        self
    }

    pub fn with_video_bitrate(mut self, bitrate: u64) -> Self {
        self.video_bitrate = Some(bitrate);
        self
    }

    pub fn with_hw_encoder(mut self, hw_encoder: HwEncoderType) -> Self {
        self.hw_encoder = hw_encoder;
        self
    }

    pub fn with_preset(mut self, preset: EncoderPreset) -> Self {
        self.preset = preset;
        self
    }

    pub fn with_zero_copy(mut self, enabled: bool) -> Self {
        self.use_zero_copy_gpu = enabled;
        self
    }
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self::new(1920, 1080, 30.0)
    }
}

/// Export progress
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    /// Error message (if state is Error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Export metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<ExportMetadata>,
    /// Performance statistics
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<ExportStats>,
}

impl ExportProgress {
    pub fn new(job_id: impl Into<String>, total_frames: u64) -> Self {
        Self {
            job_id: job_id.into(),
            state: ExportState::Pending,
            progress: 0.0,
            current_frame: 0,
            total_frames,
            elapsed_ms: 0,
            estimated_remaining_ms: 0,
            error: None,
            metadata: None,
            stats: None,
        }
    }

    /// Get progress ratio (0.0 - 1.0)
    pub fn ratio(&self) -> f64 {
        self.progress / 100.0
    }
}

/// Export metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMetadata {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Video bitrate
    pub video_bitrate: u64,
    /// Audio bitrate
    pub audio_bitrate: u64,
    /// Video codec name
    pub video_codec: String,
    /// Audio codec name
    pub audio_codec: String,
    /// Render mode
    pub render_mode: String,
    /// Hardware encoder (if used)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hw_encoder: Option<String>,
}

/// Export performance statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStats {
    // Per-frame timing (milliseconds)
    pub hw_decode_ms: f64,
    pub nv12_import_ms: f64,
    pub nv12_to_rgba_ms: f64,
    pub composite_ms: f64,
    pub rgba_to_nv12_ms: f64,
    pub cpu_readback_ms: f64,
    pub encode_submit_ms: f64,

    // Aggregate timing (milliseconds)
    pub decode_time_ms: u64,
    pub composite_time_ms: u64,
    pub encode_time_ms: f64,
    pub mux_time_ms: u64,

    // Performance metrics
    pub avg_fps: f64,
    pub peak_memory_bytes: u64,
    pub cpu_usage_percent: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_usage_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_usage_bytes: Option<u64>,
}

/// Export start response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStartResponse {
    pub job_id: String,
    pub total_frames: u64,
}

/// Export cancel response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCancelResponse {
    pub success: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- ExportState ----

    #[test]
    fn test_export_state_terminal() {
        assert!(ExportState::Completed.is_terminal());
        assert!(ExportState::Cancelled.is_terminal());
        assert!(ExportState::Error.is_terminal());
        assert!(!ExportState::Pending.is_terminal());
        assert!(!ExportState::Encoding.is_terminal());
        assert!(!ExportState::Paused.is_terminal());
    }

    #[test]
    fn test_export_state_processing() {
        assert!(ExportState::Decoding.is_processing());
        assert!(ExportState::Compositing.is_processing());
        assert!(ExportState::Encoding.is_processing());
        assert!(ExportState::Muxing.is_processing());
        assert!(!ExportState::Pending.is_processing());
        assert!(!ExportState::Completed.is_processing());
        assert!(!ExportState::Paused.is_processing());
    }

    #[test]
    fn test_export_state_default() {
        assert_eq!(ExportState::default(), ExportState::Pending);
    }

    // ---- ExportSettings ----

    #[test]
    fn test_export_settings_new() {
        let settings = ExportSettings::new(1920, 1080, 30.0);
        assert_eq!(settings.width, 1920);
        assert_eq!(settings.height, 1080);
        assert_eq!(settings.fps, 30.0);
    }

    #[test]
    fn test_export_settings_builder() {
        let settings = ExportSettings::new(3840, 2160, 60.0)
            .with_video_codec(VideoCodec::H265)
            .with_video_bitrate(20_000_000)
            .with_hw_encoder(HwEncoderType::VideoToolbox)
            .with_preset(EncoderPreset::Fast)
            .with_zero_copy(true);

        assert_eq!(settings.video_codec, VideoCodec::H265);
        assert_eq!(settings.video_bitrate, Some(20_000_000));
        assert_eq!(settings.hw_encoder, HwEncoderType::VideoToolbox);
        assert_eq!(settings.preset, EncoderPreset::Fast);
        assert!(settings.use_zero_copy_gpu);
    }

    #[test]
    fn test_export_settings_resolution() {
        let settings = ExportSettings::new(1920, 1080, 30.0);
        let res = settings.resolution();
        assert_eq!(res.width, 1920);
        assert_eq!(res.height, 1080);
    }

    #[test]
    fn test_export_settings_default() {
        let settings = ExportSettings::default();
        assert_eq!(settings.width, 1920);
        assert_eq!(settings.height, 1080);
        assert_eq!(settings.fps, 30.0);
        assert_eq!(settings.video_codec, VideoCodec::H264);
    }

    // ---- ExportProgress ----

    #[test]
    fn test_export_progress_new() {
        let progress = ExportProgress::new("job_1", 3000);
        assert_eq!(progress.job_id, "job_1");
        assert_eq!(progress.total_frames, 3000);
        assert_eq!(progress.state, ExportState::Pending);
        assert_eq!(progress.progress, 0.0);
        assert_eq!(progress.current_frame, 0);
    }

    #[test]
    fn test_export_progress_ratio() {
        let mut progress = ExportProgress::new("job_1", 100);
        progress.progress = 50.0;
        assert!((progress.ratio() - 0.5).abs() < f64::EPSILON);

        progress.progress = 100.0;
        assert!((progress.ratio() - 1.0).abs() < f64::EPSILON);
    }

    // ---- Serde ----

    #[test]
    fn test_export_state_serde() {
        let json = serde_json::to_string(&ExportState::Encoding).unwrap();
        assert_eq!(json, "\"encoding\"");
        let parsed: ExportState = serde_json::from_str("\"completed\"").unwrap();
        assert_eq!(parsed, ExportState::Completed);
    }
}
