//! StreamLoop - Decoding loop abstraction
//!
//! Provides frame pacing + playback state control + cancellation mechanism.
//! Video/Audio/Timeline start_stream all reuse this abstraction.

use crate::domain::{FrameData, Timeline};
use crate::encoder::EncodedPacket;
use crate::error::{Error, Result};
use crate::preview::PreviewPipelineConfig;
use crate::services::audio_mixdown::MixdownConfig;
use neko_engine_types::{FrameFormat, LoopRegion, StreamId};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, oneshot, watch, RwLock};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

pub type MixdownUpdateAck = Arc<Mutex<Option<oneshot::Sender<Vec<String>>>>>;

const DEFAULT_PACER_FPS: f64 = 30.0;
const MIN_PACER_FPS: f64 = 1.0;
const MAX_PACER_FPS: f64 = 240.0;
pub const DEFAULT_PLAYBACK_SPEED: f64 = 1.0;
pub const MIN_PLAYBACK_SPEED: f64 = 0.1;

pub fn normalize_stream_fps(fps: f64) -> f64 {
    if !fps.is_finite() || fps <= 0.0 {
        return DEFAULT_PACER_FPS;
    }
    fps.clamp(MIN_PACER_FPS, MAX_PACER_FPS)
}

pub fn normalize_playback_speed(speed: f64) -> f64 {
    if !speed.is_finite() {
        return DEFAULT_PLAYBACK_SPEED;
    }
    speed.max(MIN_PLAYBACK_SPEED)
}

/// Playback state (controlled externally via watch channel)
pub struct PlaybackState {
    pub paused: bool,
    pub speed: f64,
    pub loop_region: Option<LoopRegion>,
    /// One-shot seek request, cleared after processing
    pub seek_to: Option<f64>,
    /// Monotonically increasing seek sequence counter.
    /// Used by paired streams (e.g., timeline video+audio) to dedup seeks
    /// without comparing f64 values, allowing repeated seeks to the same time.
    pub seek_seq: u64,
    /// Hot-update: new timeline data to apply without recreating the stream.
    /// Wrapped in Arc to avoid cloning large timeline data through watch channel.
    pub timeline_update: Option<Arc<Timeline>>,
    /// Monotonically increasing timeline update sequence counter.
    pub timeline_seq: u64,
    /// Hot-update: new preview config (resolution/bitrate) to apply.
    pub config_update: Option<PreviewPipelineConfig>,
    /// Monotonically increasing config update sequence counter.
    pub config_seq: u64,
    /// Hot-update: new audio mixdown config to apply without recreating the stream.
    pub mixdown_update: Option<Arc<MixdownConfig>>,
    /// One-shot response channel for warnings emitted by the actual mix stream update.
    pub mixdown_update_ack: Option<MixdownUpdateAck>,
    /// Monotonically increasing mixdown update sequence counter.
    pub mixdown_seq: u64,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            paused: false,
            speed: 1.0,
            loop_region: None,
            seek_to: None,
            seek_seq: 0,
            timeline_update: None,
            timeline_seq: 0,
            config_update: None,
            config_seq: 0,
            mixdown_update: None,
            mixdown_update_ack: None,
            mixdown_seq: 0,
        }
    }
}

impl Clone for PlaybackState {
    fn clone(&self) -> Self {
        Self {
            paused: self.paused,
            speed: self.speed,
            loop_region: self.loop_region.clone(),
            seek_to: self.seek_to,
            seek_seq: self.seek_seq,
            timeline_update: self.timeline_update.clone(),
            timeline_seq: self.timeline_seq,
            config_update: self.config_update.clone(),
            config_seq: self.config_seq,
            mixdown_update: self.mixdown_update.clone(),
            mixdown_update_ack: self.mixdown_update_ack.clone(),
            mixdown_seq: self.mixdown_seq,
        }
    }
}

impl std::fmt::Debug for PlaybackState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PlaybackState")
            .field("paused", &self.paused)
            .field("speed", &self.speed)
            .field("loop_region", &self.loop_region)
            .field("seek_to", &self.seek_to)
            .field("seek_seq", &self.seek_seq)
            .field("timeline_update", &self.timeline_update)
            .field("timeline_seq", &self.timeline_seq)
            .field("config_update", &self.config_update)
            .field("config_seq", &self.config_seq)
            .field("mixdown_update", &self.mixdown_update)
            .field(
                "mixdown_update_ack",
                &self.mixdown_update_ack.as_ref().map(|_| "<ack>"),
            )
            .field("mixdown_seq", &self.mixdown_seq)
            .finish()
    }
}

/// Handle for a running decoding loop
pub struct StreamLoopHandle {
    pub stream_id: StreamId,
    pub cancel: CancellationToken,
    pub state_tx: watch::Sender<PlaybackState>,
    pub join_handle: JoinHandle<()>,
    /// Linked stream ID for paired streams (e.g. video↔audio in timeline)
    pub linked_stream_id: Option<String>,
}

/// Default EOF idle timeout: stream auto-cleans after this duration without seek
pub const EOF_IDLE_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes

/// Manages active stream loops (held by Service)
pub struct ActiveStreams {
    loops: RwLock<HashMap<String, StreamLoopHandle>>,
}

impl ActiveStreams {
    pub fn new() -> Self {
        Self {
            loops: RwLock::new(HashMap::new()),
        }
    }

    /// Insert a new stream loop handle
    pub async fn insert(&self, handle: StreamLoopHandle) {
        let id = handle.stream_id.as_str().to_string();
        self.loops.write().await.insert(id, handle);
    }

    /// Check if a stream exists
    pub async fn contains(&self, stream_id: &StreamId) -> bool {
        self.loops.read().await.contains_key(stream_id.as_str())
    }

    /// Update playback state for a stream
    pub async fn update_state<F>(&self, stream_id: &StreamId, f: F) -> Result<()>
    where
        F: FnOnce(&mut PlaybackState),
    {
        let loops = self.loops.read().await;
        let handle = loops
            .get(stream_id.as_str())
            .ok_or_else(|| Error::Other(format!("Stream not found: {}", stream_id.as_str())))?;

        handle.state_tx.send_modify(f);
        Ok(())
    }

    /// Hot-update mixdown data for a running audio mix stream.
    pub async fn update_mixdown(
        &self,
        stream_id: &StreamId,
        config: Arc<MixdownConfig>,
    ) -> Result<Vec<String>> {
        let (ack_tx, ack_rx) = oneshot::channel();
        let ack = Arc::new(Mutex::new(Some(ack_tx)));
        self.update_state(stream_id, |s| {
            s.mixdown_update = Some(config);
            s.mixdown_update_ack = Some(ack);
            s.mixdown_seq += 1;
        })
        .await?;

        tokio::time::timeout(Duration::from_secs(5), ack_rx)
            .await
            .map_err(|_| Error::Other("Mix stream update acknowledgement timed out".to_string()))?
            .map_err(|_| Error::Other("Mix stream update acknowledgement dropped".to_string()))
    }

    /// Insert a paired video+audio stream (sets linked_stream_id on both handles)
    pub async fn insert_paired(&self, mut video: StreamLoopHandle, mut audio: StreamLoopHandle) {
        let video_id = video.stream_id.as_str().to_string();
        let audio_id = audio.stream_id.as_str().to_string();
        video.linked_stream_id = Some(audio_id.clone());
        audio.linked_stream_id = Some(video_id.clone());
        let mut loops = self.loops.write().await;
        loops.insert(video_id, video);
        loops.insert(audio_id, audio);
    }

    /// Stop a stream by cancelling its loop and removing it.
    /// If the stream has a linked partner, the partner is also stopped.
    pub async fn stop(&self, stream_id: &StreamId) -> Result<()> {
        let (handle, linked_handle) = {
            let mut loops = self.loops.write().await;
            let handle = loops.remove(stream_id.as_str());
            let linked_handle = handle
                .as_ref()
                .and_then(|h| h.linked_stream_id.as_ref())
                .and_then(|linked_id| loops.remove(linked_id));
            (handle, linked_handle)
        };

        if let Some(handle) = handle {
            handle.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(5), handle.join_handle).await;
            // Linked handle shares the same CancellationToken, just await its join
            if let Some(linked) = linked_handle {
                let _ = tokio::time::timeout(Duration::from_secs(5), linked.join_handle).await;
            }
            Ok(())
        } else {
            Err(Error::Other(format!(
                "Stream not found: {}",
                stream_id.as_str()
            )))
        }
    }

    /// Stop all active streams
    #[allow(dead_code)] // Phase 2: batch stream management
    pub async fn stop_all(&self) {
        let handles: Vec<StreamLoopHandle> = {
            let mut loops = self.loops.write().await;
            loops.drain().map(|(_, h)| h).collect()
        };

        for handle in handles {
            handle.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(5), handle.join_handle).await;
        }
    }

    /// Remove a stream handle without cancelling (used by self-cleanup on EOF timeout).
    /// Also removes linked partner if present.
    pub async fn remove(&self, stream_id: &str) {
        let mut loops = self.loops.write().await;
        if let Some(handle) = loops.remove(stream_id) {
            if let Some(linked_id) = &handle.linked_stream_id {
                loops.remove(linked_id);
            }
        }
    }

    /// Get count of active streams
    #[allow(dead_code)] // Phase 2: batch stream management
    pub async fn count(&self) -> usize {
        self.loops.read().await.len()
    }
}

impl Default for ActiveStreams {
    fn default() -> Self {
        Self::new()
    }
}

/// Delegate for stream playback control operations.
///
/// Provides a single, correct implementation of stop/pause/resume/speed/seek/loop
/// that all services (Video, Audio, Timeline) share via composition.
/// This eliminates copy-paste duplication and ensures consistency (e.g. seek_seq increment).
pub struct StreamPlaybackDelegate {
    active_streams: Arc<ActiveStreams>,
}

impl StreamPlaybackDelegate {
    /// Create a new delegate wrapping the given ActiveStreams
    pub fn new(active_streams: Arc<ActiveStreams>) -> Self {
        Self { active_streams }
    }

    pub async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams.stop(stream_id).await
    }

    pub async fn pause(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.paused = true)
            .await
    }

    pub async fn resume(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.paused = false)
            .await
    }

    pub async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        let speed = normalize_playback_speed(speed);
        self.active_streams
            .update_state(stream_id, |s| s.speed = speed)
            .await
    }

    pub async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| {
                s.seek_to = Some(time_seconds);
                s.seek_seq += 1;
            })
            .await
    }

    pub async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.loop_region = region)
            .await
    }

    /// Hot-update timeline data for a running stream.
    /// The video/audio loops will pick up the new timeline on the next frame iteration.
    pub async fn update_timeline(
        &self,
        stream_id: &StreamId,
        timeline: Arc<Timeline>,
    ) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| {
                s.timeline_update = Some(timeline);
                s.timeline_seq += 1;
            })
            .await
    }

    /// Hot-update preview config (resolution/bitrate) for a running stream.
    /// The video loop will pick up the new config on the next frame iteration
    /// and call pipeline.update_config().
    pub async fn update_config(
        &self,
        stream_id: &StreamId,
        config: PreviewPipelineConfig,
    ) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| {
                s.config_update = Some(config);
                s.config_seq += 1;
            })
            .await
    }

    /// Hot-update mixdown data for a running audio mix stream.
    /// The mix stream loop will pick up the new config on the next buffer iteration.
    pub async fn update_mixdown(
        &self,
        stream_id: &StreamId,
        config: Arc<MixdownConfig>,
    ) -> Result<Vec<String>> {
        self.active_streams.update_mixdown(stream_id, config).await
    }
}

/// Wall-clock based frame pacer for blocking threads
///
/// Uses `Instant` + `std::thread::sleep` for frame pacing inside `spawn_blocking`.
/// When a frame takes longer than expected, the next frame is produced immediately
/// (no skip, natural catch-up). This avoids the cumulative delay issue of
/// `MissedTickBehavior::Delay` in tokio intervals.
pub struct WallClockPacer {
    start_time: std::time::Instant,
    frame_number: u64,
    fps: f64,
    speed: f64,
}

impl WallClockPacer {
    /// Create a new wall-clock pacer
    pub fn new(fps: f64, speed: f64) -> Self {
        Self {
            start_time: std::time::Instant::now(),
            frame_number: 0,
            fps: normalize_stream_fps(fps),
            speed: normalize_playback_speed(speed),
        }
    }

    /// Wait until the next frame should be produced.
    /// If behind schedule, returns immediately (no frame skip).
    /// Uses hybrid sleep+spin to achieve sub-millisecond accuracy
    /// (std::thread::sleep has ~2ms granularity on macOS).
    pub fn wait_for_next_frame(&mut self) {
        let Some(frame_number) = self.frame_number.checked_add(1) else {
            tracing::warn!("Pacer frame counter overflow; resetting pacer");
            self.reset();
            return;
        };
        self.frame_number = frame_number;
        let seconds = self.frame_number as f64 / (self.fps * self.speed);
        let Ok(offset) = Duration::try_from_secs_f64(seconds) else {
            tracing::warn!(
                "Invalid pacer offset (fps={}, speed={}, frame={}); resetting pacer",
                self.fps,
                self.speed,
                self.frame_number
            );
            self.reset();
            return;
        };
        let Some(expected) = self.start_time.checked_add(offset) else {
            tracing::warn!(
                "Pacer offset overflow (fps={}, speed={}, frame={}); resetting pacer",
                self.fps,
                self.speed,
                self.frame_number
            );
            self.reset();
            return;
        };
        let now = std::time::Instant::now();
        if now >= expected {
            return;
        }
        let remaining = expected - now;
        // Sleep most of the time, then spin-wait the last 2ms for precision
        const SPIN_THRESHOLD: Duration = Duration::from_millis(2);
        if remaining > SPIN_THRESHOLD {
            std::thread::sleep(remaining - SPIN_THRESHOLD);
        }
        // Spin-wait for the remaining time
        while std::time::Instant::now() < expected {
            std::hint::spin_loop();
        }
    }

    /// Update playback speed, resetting the time base to avoid jumps
    pub fn update_speed(&mut self, speed: f64) {
        self.speed = normalize_playback_speed(speed);
        self.start_time = std::time::Instant::now();
        self.frame_number = 0;
    }

    /// Reset the pacer (e.g. after seek)
    pub fn reset(&mut self) {
        self.start_time = std::time::Instant::now();
        self.frame_number = 0;
    }
}

/// Pack an H.264 EncodedPacket into FrameData for broadcast transport
///
/// Wire format: [pts_us:i64 LE][dts_us:i64 LE][is_keyframe:u8][duration_us:i64 LE][H.264 NAL data...]
/// PTS, DTS, and duration are converted from stream time_base units to microseconds.
pub fn pack_h264_frame(
    packet: &EncodedPacket,
    width: u32,
    height: u32,
    time_base: f64,
) -> FrameData {
    let header_size = 8 + 8 + 1 + 8; // pts + dts + is_keyframe + duration
                                     // Convert from stream time_base units to microseconds
    let pts_us = (packet.pts as f64 * time_base * 1_000_000.0) as i64;
    let dts_us = (packet.dts as f64 * time_base * 1_000_000.0) as i64;
    let duration_us = (packet.duration as f64 * time_base * 1_000_000.0) as i64;
    let mut data = Vec::with_capacity(header_size + packet.data.len());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.extend_from_slice(&dts_us.to_le_bytes());
    data.push(if packet.is_keyframe { 1 } else { 0 });
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&packet.data);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: pts_us as f64 / 1_000_000.0,
        diagnostics: None,
    }
}

/// Pack decoded PCM f32le audio into FrameData for audio stream broadcast
///
/// Wire format (matches AudioStreamClient frontend):
/// [pts_us:i64 LE (8B)][duration_us:i64 LE (8B)][sample_rate:u32 LE (4B)][channels:u16 LE (2B)][interleaved f32le PCM...]
/// PTS and duration are in microseconds (converted from seconds).
pub fn pack_pcm_f32le_stream_frame(
    pcm_data: &[u8],
    pts_seconds: f64,
    duration_seconds: f64,
    sample_rate: u32,
    channels: u16,
) -> FrameData {
    let header_size = 8 + 8 + 4 + 2; // pts_us + duration_us + sample_rate + channels = 22
    let pts_us = (pts_seconds * 1_000_000.0) as i64;
    let duration_us = (duration_seconds * 1_000_000.0) as i64;
    let mut data = Vec::with_capacity(header_size + pcm_data.len());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&sample_rate.to_le_bytes());
    data.extend_from_slice(&channels.to_le_bytes());
    data.extend_from_slice(pcm_data);

    FrameData {
        data,
        width: sample_rate,
        height: channels as u32,
        format: FrameFormat::PcmF32,
        timestamp: pts_seconds,
        diagnostics: None,
    }
}

/// EOF idle wait loop for blocking threads.
///
/// After EOF, the decode loop calls this instead of `break`. It sleeps in a loop
/// checking for seek requests or cancellation. If a seek arrives, returns `Some(time)`.
/// If cancelled or idle timeout expires, returns `None` (caller should break).
///
/// Uses `last_seek_seq` to detect new seek requests without clearing `seek_to`,
/// so paired streams (e.g., timeline video+audio) sharing the same watch channel
/// can both observe the same seek request.
pub fn eof_idle_wait(
    cancel: &CancellationToken,
    state_rx: &watch::Receiver<PlaybackState>,
    last_seek_seq: u64,
    timeout: Duration,
) -> Option<f64> {
    let eof_start = std::time::Instant::now();
    tracing::info!(
        "Stream reached EOF, waiting for seek (timeout: {:?})",
        timeout
    );

    loop {
        // Check cancellation
        if cancel.is_cancelled() {
            return None;
        }

        // Check idle timeout
        if eof_start.elapsed() > timeout {
            tracing::info!("EOF idle timeout expired, auto-cleaning stream");
            return None;
        }

        // Check for new seek request via sequence counter
        let state = state_rx.borrow().clone();
        if state.seek_seq != last_seek_seq {
            if let Some(time) = state.seek_to {
                tracing::info!("EOF idle: received seek to {:.3}s, resuming stream", time);
                return Some(time);
            }
        }

        // Sleep to avoid busy-waiting
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// Create a new stream with broadcast channel and control channels
///
/// Returns (StreamId, broadcast::Receiver, CancellationToken, watch::Receiver<PlaybackState>, watch::Sender<PlaybackState>)
pub fn create_stream_channels(
    session_id: &str,
    buffer_size: usize,
) -> (
    StreamId,
    broadcast::Sender<FrameData>,
    broadcast::Receiver<FrameData>,
    CancellationToken,
    watch::Sender<PlaybackState>,
    watch::Receiver<PlaybackState>,
) {
    let stream_id = StreamId::new(session_id);
    let (tx, rx) = broadcast::channel(buffer_size);
    let cancel = CancellationToken::new();
    let (state_tx, state_rx) = watch::channel(PlaybackState::default());

    (stream_id, tx, rx, cancel, state_tx, state_rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_playback_state_default() {
        let state = PlaybackState::default();
        assert!(!state.paused);
        assert!((state.speed - 1.0).abs() < f64::EPSILON);
        assert!(state.loop_region.is_none());
        assert!(state.seek_to.is_none());
        assert!(state.mixdown_update.is_none());
        assert_eq!(state.mixdown_seq, 0);
    }

    #[tokio::test]
    async fn test_active_streams_lifecycle() {
        let streams = ActiveStreams::new();
        assert_eq!(streams.count().await, 0);

        let cancel = CancellationToken::new();
        let (state_tx, _state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
            linked_stream_id: None,
        };

        streams.insert(handle).await;
        assert_eq!(streams.count().await, 1);
        assert!(streams.contains(&stream_id).await);

        streams.stop(&stream_id).await.unwrap();
        assert_eq!(streams.count().await, 0);
    }

    #[tokio::test]
    async fn test_active_streams_update_state() {
        let streams = ActiveStreams::new();
        let cancel = CancellationToken::new();
        let (state_tx, mut state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel: cancel.clone(),
            state_tx,
            join_handle,
            linked_stream_id: None,
        };

        streams.insert(handle).await;

        // Update pause state
        streams
            .update_state(&stream_id, |s| s.paused = true)
            .await
            .unwrap();

        state_rx.changed().await.unwrap();
        assert!(state_rx.borrow().paused);

        // Update speed
        streams
            .update_state(&stream_id, |s| s.speed = 2.0)
            .await
            .unwrap();

        state_rx.changed().await.unwrap();
        assert!((state_rx.borrow().speed - 2.0).abs() < f64::EPSILON);

        // Cleanup
        cancel.cancel();
        streams.stop_all().await;
    }

    #[tokio::test]
    async fn test_stream_playback_delegate_sanitizes_invalid_speed() {
        let streams = Arc::new(ActiveStreams::new());
        let delegate = StreamPlaybackDelegate::new(streams.clone());
        let cancel = CancellationToken::new();
        let (state_tx, mut state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test-speed");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel: cancel.clone(),
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        streams.insert(handle).await;

        delegate.set_speed(&stream_id, f64::NAN).await.unwrap();

        state_rx.changed().await.unwrap();
        assert!((state_rx.borrow().speed - 1.0).abs() < f64::EPSILON);

        cancel.cancel();
        streams.stop_all().await;
    }

    #[tokio::test]
    async fn test_stream_playback_delegate_update_mixdown() {
        let streams = Arc::new(ActiveStreams::new());
        let delegate = StreamPlaybackDelegate::new(streams.clone());
        let cancel = CancellationToken::new();
        let (state_tx, mut state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel: cancel.clone(),
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        streams.insert(handle).await;

        let ack_task = tokio::spawn({
            let stream_id = stream_id.clone();
            let config = Arc::new(MixdownConfig {
                tracks: vec![],
                master_effects: vec![],
                master_volume: 0.5,
                sample_rate: 44100,
                channels: 1,
            });
            async move { delegate.update_mixdown(&stream_id, config).await }
        });

        state_rx.changed().await.unwrap();
        let ack = {
            let state = state_rx.borrow();
            assert_eq!(state.mixdown_seq, 1);
            let update = state.mixdown_update.as_ref().unwrap();
            assert_eq!(update.sample_rate, 44100);
            assert_eq!(update.channels, 1);
            assert!((update.master_volume - 0.5).abs() < f32::EPSILON);
            state.mixdown_update_ack.as_ref().unwrap().clone()
        };

        let sender = ack.lock().unwrap().take().unwrap();
        sender.send(vec!["updated".to_string()]).unwrap();
        let warnings = ack_task.await.unwrap().unwrap();
        assert_eq!(warnings, vec!["updated".to_string()]);

        cancel.cancel();
        streams.stop_all().await;
    }

    #[tokio::test]
    async fn test_active_streams_update_mixdown_times_out_without_ack() {
        let streams = Arc::new(ActiveStreams::new());
        let cancel = CancellationToken::new();
        let (state_tx, mut state_rx) = watch::channel(PlaybackState::default());
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            cancel_clone.cancelled().await;
        });

        let stream_id = StreamId::new("test-timeout");
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel: cancel.clone(),
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        streams.insert(handle).await;

        let config = Arc::new(MixdownConfig {
            tracks: vec![],
            master_effects: vec![],
            master_volume: 0.5,
            sample_rate: 44100,
            channels: 1,
        });

        let update_task = tokio::spawn({
            let streams = streams.clone();
            let stream_id = stream_id.clone();
            async move { streams.update_mixdown(&stream_id, config).await }
        });

        state_rx.changed().await.unwrap();
        let ack = state_rx
            .borrow()
            .mixdown_update_ack
            .as_ref()
            .unwrap()
            .clone();
        drop(ack.lock().unwrap().take());
        let err = update_task.await.unwrap().unwrap_err();
        assert!(err
            .to_string()
            .contains("Mix stream update acknowledgement dropped"));

        cancel.cancel();
        streams.stop_all().await;
    }

    #[test]
    fn test_pack_h264_frame() {
        let packet = EncodedPacket {
            data: vec![0x00, 0x00, 0x00, 0x01, 0x67], // SPS NAL
            pts: 1000,
            dts: 900,
            is_keyframe: true,
            duration: 33333,
            stream_index: 0,
        };

        // time_base = 1/30 fps → each PTS unit = 1/30 second
        let time_base = 1.0 / 30.0;
        let frame = pack_h264_frame(&packet, 1920, 1080, time_base);
        assert_eq!(frame.width, 1920);
        assert_eq!(frame.height, 1080);
        assert_eq!(frame.format, FrameFormat::H264);

        // Verify header
        let header_size = 8 + 8 + 1 + 8;
        assert_eq!(frame.data.len(), header_size + packet.data.len());

        // Verify pts is in microseconds: 1000 * (1/30) * 1_000_000 = 33_333_333
        let pts = i64::from_le_bytes(frame.data[0..8].try_into().unwrap());
        assert_eq!(pts, 33_333_333);

        // Verify is_keyframe
        assert_eq!(frame.data[16], 1);
    }

    #[test]
    fn test_create_stream_channels() {
        let (stream_id, _tx, _rx, _cancel, _state_tx, _state_rx) =
            create_stream_channels("test_session", 64);

        assert!(stream_id.as_str().starts_with("strm_"));
    }

    #[test]
    fn test_wall_clock_pacer_creation() {
        let pacer = WallClockPacer::new(30.0, 1.0);
        assert!((pacer.fps - 30.0).abs() < f64::EPSILON);
        assert!((pacer.speed - 1.0).abs() < f64::EPSILON);
        assert_eq!(pacer.frame_number, 0);
    }

    #[test]
    fn test_wall_clock_pacer_min_speed() {
        let pacer = WallClockPacer::new(30.0, 0.0);
        assert!((pacer.speed - 0.1).abs() < f64::EPSILON);
    }

    #[test]
    fn test_wall_clock_pacer_sanitizes_non_finite_inputs() {
        let mut pacer = WallClockPacer::new(f64::NAN, f64::NAN);
        assert!((pacer.fps - 30.0).abs() < f64::EPSILON);
        assert!((pacer.speed - 1.0).abs() < f64::EPSILON);

        pacer.update_speed(f64::INFINITY);
        assert!((pacer.speed - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_wall_clock_pacer_handles_invalid_duration_without_panic() {
        let mut pacer = WallClockPacer::new(1.0, 0.1);
        pacer.frame_number = u64::MAX;

        pacer.wait_for_next_frame();

        assert_eq!(pacer.frame_number, 0);
    }

    #[test]
    fn test_wall_clock_pacer_speed_update() {
        let mut pacer = WallClockPacer::new(30.0, 1.0);
        pacer.wait_for_next_frame();
        assert_eq!(pacer.frame_number, 1);

        pacer.update_speed(2.0);
        assert!((pacer.speed - 2.0).abs() < f64::EPSILON);
        assert_eq!(pacer.frame_number, 0); // Reset on speed change
    }

    #[test]
    fn test_wall_clock_pacer_reset() {
        let mut pacer = WallClockPacer::new(30.0, 1.0);
        pacer.wait_for_next_frame();
        pacer.wait_for_next_frame();
        assert_eq!(pacer.frame_number, 2);

        pacer.reset();
        assert_eq!(pacer.frame_number, 0);
    }
}
