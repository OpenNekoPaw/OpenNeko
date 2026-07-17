//! Stream playback control trait
//!
//! Extracted from IVideoService/IAudioService/ITimelineService to eliminate
//! duplicated stream control methods (stop/pause/resume/speed/seek/loop).

use crate::error::Result;
use async_trait::async_trait;
use neko_engine_types::{LoopRegion, StreamId};

/// Stream playback control interface
///
/// All services that manage streams share this common set of playback
/// control operations. Implementations delegate to `StreamPlaybackDelegate`.
#[async_trait]
pub trait IStreamPlayback: Send + Sync {
    /// Stop a stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Pause stream playback
    async fn pause(&self, stream_id: &StreamId) -> Result<()>;

    /// Resume stream playback
    async fn resume(&self, stream_id: &StreamId) -> Result<()>;

    /// Set playback speed
    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()>;

    /// Seek to exact time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;

    /// Set loop region for playback
    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()>;
}
