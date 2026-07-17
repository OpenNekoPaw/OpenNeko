//! Stream entry types for StreamRegistry

use neko_engine_types::{Resolution, StreamId, StreamState};
use std::time::Instant;
use tokio::sync::broadcast;

use super::FrameData;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamSendError;

impl std::fmt::Display for StreamSendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "stream has no active receivers")
    }
}

impl std::error::Error for StreamSendError {}

/// Per-stream entry — each stream has its own broadcast channel
///
/// This replaces the older shared broadcast channel used by the legacy
/// in-core frame streaming path.
#[derive(Debug)]
pub struct StreamEntry {
    /// Unique stream ID
    pub id: StreamId,
    /// Parent session ID
    pub session_id: String,
    /// Associated resource ID
    pub resource_id: String,
    /// Current state
    pub state: StreamState,
    /// Per-stream broadcast channel for frames
    pub tx: broadcast::Sender<FrameData>,
    /// Creation timestamp
    pub created_at: Instant,
    /// Stream configuration
    pub config: StreamConfig,
}

impl StreamEntry {
    /// Create a new stream entry
    pub fn new(
        session_id: impl Into<String>,
        resource_id: impl Into<String>,
        config: StreamConfig,
    ) -> (Self, broadcast::Receiver<FrameData>) {
        let session_id = session_id.into();
        let id = StreamId::new(&session_id);
        let (tx, rx) = broadcast::channel(64); // Buffer 64 frames

        let entry = Self {
            id,
            session_id,
            resource_id: resource_id.into(),
            state: StreamState::Created,
            tx,
            created_at: Instant::now(),
            config,
        };

        (entry, rx)
    }

    /// Create a new stream entry with a specific StreamId
    ///
    /// Used when registering an externally-created stream (e.g., from TimelineService)
    /// into the StreamRegistry.
    pub fn with_id(
        stream_id: StreamId,
        session_id: impl Into<String>,
        resource_id: impl Into<String>,
        config: StreamConfig,
    ) -> (Self, broadcast::Receiver<FrameData>) {
        let (tx, rx) = broadcast::channel(64);

        let entry = Self {
            id: stream_id,
            session_id: session_id.into(),
            resource_id: resource_id.into(),
            state: StreamState::Created,
            tx,
            created_at: Instant::now(),
            config,
        };

        (entry, rx)
    }

    /// Check if stream can transition to target state
    pub fn can_transition_to(&self, target: StreamState) -> bool {
        self.state.can_transition_to(target)
    }

    /// Transition to new state
    pub fn transition(&mut self, target: StreamState) -> Result<(), StreamTransitionError> {
        if !self.can_transition_to(target) {
            return Err(StreamTransitionError {
                from: self.state,
                to: target,
            });
        }
        self.state = target;
        Ok(())
    }

    /// Check if stream is active (can receive frames)
    pub fn is_active(&self) -> bool {
        matches!(self.state, StreamState::Active | StreamState::Paused)
    }

    /// Check if stream is destroyed
    pub fn is_destroyed(&self) -> bool {
        self.state == StreamState::Destroyed
    }

    /// Get age since creation
    pub fn age(&self) -> std::time::Duration {
        self.created_at.elapsed()
    }

    /// Send a frame to all subscribers
    pub fn send_frame(&self, frame: FrameData) -> Result<usize, StreamSendError> {
        self.tx.send(frame).map_err(|_| StreamSendError)
    }

    /// Get number of active receivers
    pub fn receiver_count(&self) -> usize {
        self.tx.receiver_count()
    }

    /// Subscribe to this stream
    pub fn subscribe(&self) -> broadcast::Receiver<FrameData> {
        self.tx.subscribe()
    }
}

/// Stream configuration
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// Output resolution
    pub resolution: Resolution,
    /// Frame rate
    pub fps: f64,
    /// Start time in seconds
    pub start_time: f64,
    /// Stream codec
    pub codec: StreamCodec,
    /// If true, start the stream in paused state (no frames produced until resume)
    pub initial_paused: bool,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            resolution: Resolution::full_hd(),
            fps: 30.0,
            start_time: 0.0,
            codec: StreamCodec::H264,
            initial_paused: false,
        }
    }
}

/// Stream codec type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StreamCodec {
    /// H.264 for WebCodecs compatibility
    #[default]
    H264,
    /// Raw RGBA frames (for GPU-local consumers)
    Raw,
}

/// Error when stream state transition is invalid
#[derive(Debug, Clone)]
pub struct StreamTransitionError {
    pub from: StreamState,
    pub to: StreamState,
}

impl std::fmt::Display for StreamTransitionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Invalid stream state transition: {:?} -> {:?}",
            self.from, self.to
        )
    }
}

impl std::error::Error for StreamTransitionError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_entry_creation() {
        let config = StreamConfig::default();
        let (entry, _rx) = StreamEntry::new("session1", "vid_abc123", config);

        assert!(entry.id.as_str().starts_with("strm_"));
        assert_eq!(entry.state, StreamState::Created);
        assert_eq!(entry.session_id, "session1");
    }

    #[test]
    fn test_stream_state_transitions() {
        let config = StreamConfig::default();
        let (mut entry, _rx) = StreamEntry::new("session1", "vid_abc123", config);

        // Created -> Active
        assert!(entry.transition(StreamState::Active).is_ok());
        assert_eq!(entry.state, StreamState::Active);

        // Active -> Paused
        assert!(entry.transition(StreamState::Paused).is_ok());
        assert_eq!(entry.state, StreamState::Paused);

        // Paused -> Active
        assert!(entry.transition(StreamState::Active).is_ok());
        assert_eq!(entry.state, StreamState::Active);

        // Active -> Destroyed
        assert!(entry.transition(StreamState::Destroyed).is_ok());
        assert_eq!(entry.state, StreamState::Destroyed);
    }

    #[test]
    fn test_invalid_transition() {
        let config = StreamConfig::default();
        let (mut entry, _rx) = StreamEntry::new("session1", "vid_abc123", config);

        // Created -> Paused (invalid)
        assert!(entry.transition(StreamState::Paused).is_err());
    }
}
