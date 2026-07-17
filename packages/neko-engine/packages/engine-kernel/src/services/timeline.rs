//! Timeline service trait

use crate::domain::operations::EditOperationEnvelope;
use crate::domain::{FrameData, StreamConfig, Timeline, TimelineProjectInfo};
use crate::error::Result;
use crate::export::ExportStats;
use crate::preview::PreviewPipelineConfig;
use crate::services::IStreamPlayback;
use async_trait::async_trait;
use neko_engine_types::StreamId;
use serde::Serialize;
use std::path::Path;
use tokio::sync::{broadcast, watch};

/// Stream performance statistics (updated periodically, polled on demand)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStats {
    /// Video pipeline performance metrics
    pub video: ExportStats,
    /// Audio mix average time in milliseconds
    pub audio_mix_ms: f64,
    /// Audio average FPS
    pub audio_fps: f64,
    /// Current playback position in seconds
    pub current_time: f64,
    /// Total timeline duration in seconds
    pub total_duration: f64,
    /// System resource: peak memory bytes
    pub peak_memory_bytes: u64,
    /// System resource: average CPU usage percent
    pub cpu_usage_percent: f64,
}

impl Default for StreamStats {
    fn default() -> Self {
        Self {
            video: ExportStats::default(),
            audio_mix_ms: 0.0,
            audio_fps: 0.0,
            current_time: 0.0,
            total_duration: 0.0,
            peak_memory_bytes: 0,
            cpu_usage_percent: 0.0,
        }
    }
}

/// Result of starting a timeline stream (video + audio paired streams)
pub struct TimelineStreamResult {
    pub video_stream_id: StreamId,
    pub video_rx: broadcast::Receiver<FrameData>,
    pub audio_stream_id: StreamId,
    pub audio_rx: broadcast::Receiver<FrameData>,
    /// Watch receiver for latest stats snapshot (poll on demand)
    pub stats_rx: watch::Receiver<StreamStats>,
}

impl std::fmt::Debug for TimelineStreamResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TimelineStreamResult")
            .field("video_stream_id", &self.video_stream_id)
            .field("audio_stream_id", &self.audio_stream_id)
            .finish()
    }
}

/// Timeline service interface
///
/// Handles timeline-specific operations: compositing frames,
/// stream management, and project probing.
/// Stream playback control (stop/pause/resume/speed/seek/loop) is inherited from `IStreamPlayback`.
#[async_trait]
pub trait ITimelineService: IStreamPlayback {
    /// Probe a .nkv project file and return metadata without rendering
    async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo>;

    /// Composite a single frame at specified time
    async fn composite(&self, timeline: &Timeline, frame_number: u64) -> Result<FrameData>;

    /// Start a timeline stream for preview (returns paired video + audio streams)
    async fn start_stream(
        &self,
        timeline: &Timeline,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<TimelineStreamResult>;

    /// Get stream performance statistics
    async fn get_stream_stats(&self, stream_id: &StreamId) -> Option<StreamStats>;

    /// Hot-update preview quality for a running stream.
    async fn set_quality(
        &self,
        stream_id: &StreamId,
        width: u32,
        height: u32,
        bitrate: Option<u64>,
        fps: Option<f64>,
    ) -> Result<()>;

    /// Hot-update timeline data for an active stream without recreating it.
    /// Initial implementation: stop the old stream and start a new one with the same IDs.
    async fn update_stream(&self, stream_id: &StreamId, timeline: &Timeline) -> Result<()>;

    /// Apply an incremental operation to the stored stream timeline.
    /// Returns `Ok(true)` if applied, `Ok(false)` if the operation type is unsupported
    /// (caller should fall back to full `update_stream`).
    /// `base_dir` is used for resolving relative media paths in structural operations.
    async fn apply_operation_to_stream(
        &self,
        stream_id: &StreamId,
        operation: &EditOperationEnvelope,
        base_dir: Option<&std::path::Path>,
    ) -> Result<bool>;
}
