//! StreamRegistry - Per-stream broadcast channel management
//!
//! Manages streams with:
//! - Per-stream broadcast channels (no global broadcast)
//! - Lifecycle state machine (Created → Active → Paused → Destroyed)
//! - Automatic cleanup of stale streams

use neko_engine_kernel::contracts::domain::{FrameData, StreamConfig, StreamEntry};
use neko_engine_types::{StreamId, StreamState};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};
use tokio_util::sync::CancellationToken;

/// Configuration for stream cleanup
#[derive(Debug, Clone)]
pub struct StreamCleanupConfig {
    /// Max time a stream can be in Created state before cleanup
    pub created_timeout: Duration,
    /// Max time a stream can be in Paused state before cleanup
    pub paused_timeout: Duration,
    /// Cleanup scan interval
    pub scan_interval: Duration,
}

impl Default for StreamCleanupConfig {
    fn default() -> Self {
        Self {
            created_timeout: Duration::from_secs(30),
            paused_timeout: Duration::from_secs(300), // 5 minutes
            scan_interval: Duration::from_secs(60),
        }
    }
}

/// Stream registry for managing per-stream broadcast channels
///
/// Features:
/// - Per-stream broadcast: each stream has its own channel
/// - State machine: Created → Active → Paused → Destroyed
/// - Auto cleanup: removes stale streams periodically
/// - Session index: session_id → [stream_id] for batch cleanup
/// - Resource index: resource_id → [stream_id] for resource-level operations
pub struct StreamRegistry {
    /// Streams by ID
    streams: Arc<RwLock<HashMap<String, StreamEntry>>>,
    /// Session to streams mapping
    session_streams: Arc<RwLock<HashMap<String, Vec<String>>>>,
    /// Resource to streams mapping
    resource_streams: Arc<RwLock<HashMap<String, Vec<String>>>>,
    /// CancellationTokens for Service-layer decode loops
    ///
    /// When a stream is destroyed (including session cascade), the associated
    /// CancellationToken is cancelled to stop the Service-layer decode/encode loop.
    cancel_tokens: Arc<RwLock<HashMap<String, CancellationToken>>>,
    /// Cleanup configuration
    cleanup_config: StreamCleanupConfig,
}

impl StreamRegistry {
    /// Create a new stream registry
    pub fn new() -> Self {
        Self::with_config(StreamCleanupConfig::default())
    }

    /// Create with custom cleanup config
    pub fn with_config(cleanup_config: StreamCleanupConfig) -> Self {
        Self {
            streams: Arc::new(RwLock::new(HashMap::new())),
            session_streams: Arc::new(RwLock::new(HashMap::new())),
            resource_streams: Arc::new(RwLock::new(HashMap::new())),
            cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
            cleanup_config,
        }
    }

    /// Create a new stream
    ///
    /// Returns the stream ID and a receiver for frames.
    pub async fn create_stream(
        &self,
        session_id: &str,
        resource_id: &str,
        config: StreamConfig,
    ) -> (StreamId, broadcast::Receiver<FrameData>) {
        let (entry, rx) = StreamEntry::new(session_id, resource_id, config);
        let stream_id = entry.id.clone();
        let id_str = stream_id.as_str().to_string();

        {
            let mut streams = self.streams.write().await;
            let mut session_map = self.session_streams.write().await;
            let mut resource_map = self.resource_streams.write().await;

            streams.insert(id_str.clone(), entry);

            // Track session → stream relationship
            session_map
                .entry(session_id.to_string())
                .or_default()
                .push(id_str.clone());

            // Track resource → stream relationship
            resource_map
                .entry(resource_id.to_string())
                .or_default()
                .push(id_str);
        }

        tracing::debug!(
            "Created stream {} for session {}",
            stream_id.as_str(),
            session_id
        );
        (stream_id, rx)
    }

    /// Create a stream while replacing any existing streams for the same resource.
    ///
    /// This is intended for singleton media resources: concurrent starts for
    /// the same resource must not leave multiple producers alive. The
    /// replacement and the new cancellation token are
    /// committed while holding the registry indices, closing the race between
    /// resource cleanup and stream creation.
    pub async fn create_stream_replacing_resource(
        &self,
        session_id: &str,
        resource_id: &str,
        config: StreamConfig,
        cancel_token: CancellationToken,
    ) -> (StreamId, broadcast::Receiver<FrameData>) {
        let (entry, rx) = StreamEntry::new(session_id, resource_id, config);
        let stream_id = entry.id.clone();
        let id_str = stream_id.as_str().to_string();
        let replaced_ids: Vec<String>;

        {
            let mut tokens = self.cancel_tokens.write().await;
            let mut streams = self.streams.write().await;
            let mut session_map = self.session_streams.write().await;
            let mut resource_map = self.resource_streams.write().await;

            replaced_ids = resource_map.remove(resource_id).unwrap_or_default();
            for replaced_id in &replaced_ids {
                if let Some(token) = tokens.remove(replaced_id) {
                    token.cancel();
                }
                if let Some(mut replaced_entry) = streams.remove(replaced_id) {
                    let _ = replaced_entry.transition(StreamState::Destroyed);
                    if let Some(stream_ids) = session_map.get_mut(&replaced_entry.session_id) {
                        stream_ids.retain(|id| id != replaced_id);
                        if stream_ids.is_empty() {
                            session_map.remove(&replaced_entry.session_id);
                        }
                    }
                }
            }

            streams.insert(id_str.clone(), entry);
            session_map
                .entry(session_id.to_string())
                .or_default()
                .push(id_str.clone());
            resource_map
                .entry(resource_id.to_string())
                .or_default()
                .push(id_str.clone());
            tokens.insert(id_str.clone(), cancel_token);
        }

        if !replaced_ids.is_empty() {
            tracing::debug!(
                "Created stream {} for session {}, replacing {} stream(s) for resource {}",
                stream_id.as_str(),
                session_id,
                replaced_ids.len(),
                resource_id
            );
        } else {
            tracing::debug!(
                "Created stream {} for session {}",
                stream_id.as_str(),
                session_id
            );
        }
        (stream_id, rx)
    }

    /// Associate a CancellationToken with a stream
    ///
    /// When the stream is destroyed (including session cascade), the token
    /// will be cancelled to stop the Service-layer decode/encode loop.
    pub async fn set_cancel_token(&self, stream_id: &StreamId, token: CancellationToken) {
        let mut tokens = self.cancel_tokens.write().await;
        tokens.insert(stream_id.as_str().to_string(), token);
    }

    /// Register an externally-created stream into the registry
    ///
    /// Used when a stream is created outside the registry (e.g., by TimelineService)
    /// but needs to be discoverable via WebSocket subscription.
    ///
    /// Spawns a forwarding task that reads frames from the external broadcast channel
    /// and pushes them into the registry's own broadcast channel.
    pub async fn register_external_stream(
        &self,
        stream_id: StreamId,
        session_id: &str,
        resource_id: &str,
        config: StreamConfig,
        mut external_rx: broadcast::Receiver<FrameData>,
        cancel_token: CancellationToken,
    ) -> broadcast::Receiver<FrameData> {
        let (entry, rx) = StreamEntry::with_id(stream_id.clone(), session_id, resource_id, config);
        let registry_tx = entry.tx.clone();
        let id_str = stream_id.as_str().to_string();

        {
            let mut streams = self.streams.write().await;
            let mut session_map = self.session_streams.write().await;
            let mut resource_map = self.resource_streams.write().await;

            streams.insert(id_str.clone(), entry);

            session_map
                .entry(session_id.to_string())
                .or_default()
                .push(id_str.clone());

            resource_map
                .entry(resource_id.to_string())
                .or_default()
                .push(id_str.clone());
        }

        // Auto-activate so WebSocket subscribers can receive frames immediately
        let _ = self.activate(&stream_id).await;

        // Register cancel token for cleanup
        self.set_cancel_token(&stream_id, cancel_token.clone())
            .await;

        // Spawn forwarding task: external_rx → registry_tx
        // Waits for at least one WebSocket subscriber before forwarding,
        // so frames aren't lost into an empty broadcast channel.
        let forward_id = id_str.clone();
        tokio::spawn(async move {
            tracing::info!(
                "Forwarding task started for stream {}, waiting for subscriber...",
                forward_id
            );

            // Wait until at least one WebSocket client subscribes to the registry channel.
            // Frames accumulate in the external broadcast channel (capacity 64) during this wait.
            let wait_start = tokio::time::Instant::now();
            loop {
                if cancel_token.is_cancelled() {
                    tracing::debug!(
                        "External stream {} cancelled while waiting for subscriber",
                        forward_id
                    );
                    return;
                }
                // receiver_count() returns the number of active Receivers on this Sender
                if registry_tx.receiver_count() > 0 {
                    tracing::info!(
                        "Stream {} got subscriber after {:.0}ms, starting forwarding",
                        forward_id,
                        wait_start.elapsed().as_millis()
                    );
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                // Safety timeout: don't wait forever (5 seconds)
                if wait_start.elapsed() > std::time::Duration::from_secs(5) {
                    tracing::warn!(
                        "Stream {} timed out waiting for subscriber, starting anyway",
                        forward_id
                    );
                    break;
                }
            }

            let mut frame_count = 0u64;
            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => {
                        tracing::debug!("External stream {} forwarding stopped (cancelled), forwarded {} frames", forward_id, frame_count);
                        break;
                    }
                    result = external_rx.recv() => {
                        match result {
                            Ok(frame) => {
                                frame_count += 1;
                                if frame_count <= 3 || frame_count.is_multiple_of(100) {
                                    tracing::debug!("Forwarding frame {} for stream {} ({} bytes)", frame_count, forward_id, frame.data.len());
                                }
                                let _ = registry_tx.send(frame);
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                tracing::warn!("External stream {} lagged by {} frames", forward_id, n);
                            }
                            Err(broadcast::error::RecvError::Closed) => {
                                tracing::info!("External stream {} source closed after {} frames", forward_id, frame_count);
                                break;
                            }
                        }
                    }
                }
            }
        });

        tracing::debug!(
            "Registered external stream {} for session {}",
            stream_id.as_str(),
            session_id
        );

        rx
    }

    /// Get the broadcast sender for a stream (for Service-layer frame pushing)
    ///
    /// Returns a clone of the broadcast::Sender so the Service decode loop
    /// can push frames directly into the Registry's channel.
    pub async fn get_sender(&self, stream_id: &StreamId) -> Option<broadcast::Sender<FrameData>> {
        let streams = self.streams.read().await;
        streams.get(stream_id.as_str()).map(|e| e.tx.clone())
    }

    /// Get stream state by ID
    pub async fn get_state(&self, stream_id: &StreamId) -> Option<StreamState> {
        let streams = self.streams.read().await;
        streams.get(stream_id.as_str()).map(|e| e.state)
    }

    /// Check if stream exists
    pub async fn exists(&self, stream_id: &StreamId) -> bool {
        let streams = self.streams.read().await;
        streams.contains_key(stream_id.as_str())
    }

    /// Subscribe to a stream
    pub async fn subscribe(&self, stream_id: &StreamId) -> Option<broadcast::Receiver<FrameData>> {
        let streams = self.streams.read().await;
        streams.get(stream_id.as_str()).map(|e| e.subscribe())
    }

    /// Activate a stream (Created → Active)
    pub async fn activate(&self, stream_id: &StreamId) -> Result<(), StreamStateError> {
        let mut streams = self.streams.write().await;
        if let Some(entry) = streams.get_mut(stream_id.as_str()) {
            entry.transition(StreamState::Active)?;
            tracing::debug!("Activated stream {}", stream_id.as_str());
            Ok(())
        } else {
            Err(StreamStateError::NotFound(stream_id.as_str().to_string()))
        }
    }

    /// Pause a stream (Active → Paused)
    pub async fn pause(&self, stream_id: &StreamId) -> Result<(), StreamStateError> {
        let mut streams = self.streams.write().await;
        if let Some(entry) = streams.get_mut(stream_id.as_str()) {
            entry.transition(StreamState::Paused)?;
            tracing::debug!("Paused stream {}", stream_id.as_str());
            Ok(())
        } else {
            Err(StreamStateError::NotFound(stream_id.as_str().to_string()))
        }
    }

    /// Resume a stream (Paused → Active)
    pub async fn resume(&self, stream_id: &StreamId) -> Result<(), StreamStateError> {
        let mut streams = self.streams.write().await;
        if let Some(entry) = streams.get_mut(stream_id.as_str()) {
            entry.transition(StreamState::Active)?;
            tracing::debug!("Resumed stream {}", stream_id.as_str());
            Ok(())
        } else {
            Err(StreamStateError::NotFound(stream_id.as_str().to_string()))
        }
    }

    /// Destroy a stream
    ///
    /// Cancels the associated CancellationToken (stopping the Service-layer
    /// decode loop), then removes the stream entry and cleans up all indices.
    pub async fn destroy(&self, stream_id: &StreamId) -> Result<(), StreamStateError> {
        // 1. Cancel the Service-layer decode loop (if registered)
        {
            let mut tokens = self.cancel_tokens.write().await;
            if let Some(token) = tokens.remove(stream_id.as_str()) {
                token.cancel();
            }
        }

        // 2. Remove stream entry and clean up indices
        let mut streams = self.streams.write().await;
        let mut session_map = self.session_streams.write().await;
        let mut resource_map = self.resource_streams.write().await;

        if let Some(mut entry) = streams.remove(stream_id.as_str()) {
            entry.transition(StreamState::Destroyed)?;

            // Remove from session mapping
            if let Some(stream_ids) = session_map.get_mut(&entry.session_id) {
                stream_ids.retain(|id| id != stream_id.as_str());
                if stream_ids.is_empty() {
                    session_map.remove(&entry.session_id);
                }
            }

            // Remove from resource mapping
            if let Some(stream_ids) = resource_map.get_mut(&entry.resource_id) {
                stream_ids.retain(|id| id != stream_id.as_str());
                if stream_ids.is_empty() {
                    resource_map.remove(&entry.resource_id);
                }
            }

            tracing::debug!("Destroyed stream {}", stream_id.as_str());
            Ok(())
        } else {
            Err(StreamStateError::NotFound(stream_id.as_str().to_string()))
        }
    }

    /// Send a frame to a stream
    pub async fn send_frame(
        &self,
        stream_id: &StreamId,
        frame: FrameData,
    ) -> Result<usize, StreamStateError> {
        let streams = self.streams.read().await;
        if let Some(entry) = streams.get(stream_id.as_str()) {
            if !entry.is_active() {
                return Err(StreamStateError::NotActive(stream_id.as_str().to_string()));
            }
            entry
                .send_frame(frame)
                .map_err(|_| StreamStateError::NoReceivers(stream_id.as_str().to_string()))
        } else {
            Err(StreamStateError::NotFound(stream_id.as_str().to_string()))
        }
    }

    /// Get all streams for a session
    pub async fn get_session_streams(&self, session_id: &str) -> Vec<StreamId> {
        let session_map = self.session_streams.read().await;
        session_map
            .get(session_id)
            .map(|ids| {
                ids.iter()
                    .map(|id| StreamId::from_string(id.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Destroy all streams for a session
    pub async fn destroy_session(&self, session_id: &str) {
        let stream_ids = self.get_session_streams(session_id).await;
        for stream_id in stream_ids {
            let _ = self.destroy(&stream_id).await;
        }
        tracing::debug!("Destroyed all streams for session {}", session_id);
    }

    /// Get all streams for a resource
    pub async fn get_resource_streams(&self, resource_id: &str) -> Vec<StreamId> {
        let resource_map = self.resource_streams.read().await;
        resource_map
            .get(resource_id)
            .map(|ids| {
                ids.iter()
                    .map(|id| StreamId::from_string(id.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Destroy all streams for a resource
    ///
    /// Useful when a resource is unregistered — all associated streams should be cleaned up.
    pub async fn destroy_resource_streams(&self, resource_id: &str) {
        let stream_ids = self.get_resource_streams(resource_id).await;
        for stream_id in stream_ids {
            let _ = self.destroy(&stream_id).await;
        }
        tracing::debug!("Destroyed all streams for resource {}", resource_id);
    }

    /// Cleanup stale streams
    ///
    /// Removes streams that have been:
    /// - In Created state for too long
    /// - In Paused state for too long
    pub async fn cleanup_stale(&self) -> usize {
        let mut to_remove = Vec::new();

        {
            let streams = self.streams.read().await;
            for (id, entry) in streams.iter() {
                let age = entry.age();
                let should_remove = match entry.state {
                    StreamState::Created => age > self.cleanup_config.created_timeout,
                    StreamState::Paused => age > self.cleanup_config.paused_timeout,
                    StreamState::Destroyed => true,
                    _ => false,
                };

                if should_remove {
                    to_remove.push(StreamId::from_string(id.clone()));
                }
            }
        }

        let count = to_remove.len();
        for stream_id in to_remove {
            let _ = self.destroy(&stream_id).await;
        }

        if count > 0 {
            tracing::info!("Cleaned up {} stale streams", count);
        }

        count
    }

    /// Start background cleanup task
    pub fn start_cleanup_task(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let interval = self.cleanup_config.scan_interval;
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            loop {
                ticker.tick().await;
                self.cleanup_stale().await;
            }
        })
    }

    /// Get count of active streams
    pub async fn count(&self) -> usize {
        let streams = self.streams.read().await;
        streams.len()
    }

    /// Get count of active streams (not destroyed)
    pub async fn active_count(&self) -> usize {
        let streams = self.streams.read().await;
        streams.values().filter(|e| e.is_active()).count()
    }
}

impl Default for StreamRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Stream state error
#[derive(Debug, Clone)]
pub enum StreamStateError {
    /// Stream not found
    NotFound(String),
    /// Invalid state transition
    InvalidTransition(String),
    /// Stream not active
    NotActive(String),
    /// No receivers for broadcast
    NoReceivers(String),
}

impl std::fmt::Display for StreamStateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(id) => write!(f, "Stream not found: {}", id),
            Self::InvalidTransition(msg) => write!(f, "Invalid state transition: {}", msg),
            Self::NotActive(id) => write!(f, "Stream not active: {}", id),
            Self::NoReceivers(id) => write!(f, "No receivers for stream: {}", id),
        }
    }
}

impl std::error::Error for StreamStateError {}

impl From<neko_engine_kernel::contracts::domain::StreamTransitionError> for StreamStateError {
    fn from(e: neko_engine_kernel::contracts::domain::StreamTransitionError) -> Self {
        Self::InvalidTransition(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::Resolution;

    fn test_config() -> StreamConfig {
        StreamConfig {
            resolution: Resolution::new(1920, 1080),
            fps: 30.0,
            start_time: 0.0,
            playback_speed: 1.0,
            codec: neko_engine_kernel::contracts::domain::StreamCodec::H264,
            initial_paused: false,
        }
    }

    #[tokio::test]
    async fn test_create_stream() {
        let registry = StreamRegistry::new();
        let (stream_id, _rx) = registry
            .create_stream("session1", "vid_abc123", test_config())
            .await;

        assert!(stream_id.as_str().starts_with("strm_"));
        assert_eq!(registry.count().await, 1);
    }

    #[tokio::test]
    async fn test_stream_lifecycle() {
        let registry = StreamRegistry::new();
        let (stream_id, _rx) = registry
            .create_stream("session1", "vid_abc123", test_config())
            .await;

        // Created → Active
        registry.activate(&stream_id).await.unwrap();

        // Active → Paused
        registry.pause(&stream_id).await.unwrap();

        // Paused → Active
        registry.resume(&stream_id).await.unwrap();

        // Active → Destroyed
        registry.destroy(&stream_id).await.unwrap();

        assert_eq!(registry.count().await, 0);
    }

    #[tokio::test]
    async fn test_session_streams() {
        let registry = StreamRegistry::new();

        let (_id1, _) = registry
            .create_stream("session1", "vid_1", test_config())
            .await;
        let (_id2, _) = registry
            .create_stream("session1", "vid_2", test_config())
            .await;
        let (_id3, _) = registry
            .create_stream("session2", "vid_3", test_config())
            .await;

        let session1_streams = registry.get_session_streams("session1").await;
        assert_eq!(session1_streams.len(), 2);

        registry.destroy_session("session1").await;
        assert_eq!(registry.count().await, 1);
    }

    #[tokio::test]
    async fn test_resource_streams() {
        let registry = StreamRegistry::new();

        let (_id1, _) = registry
            .create_stream("session1", "vid_abc", test_config())
            .await;
        let (_id2, _) = registry
            .create_stream("session2", "vid_abc", test_config())
            .await;
        let (_id3, _) = registry
            .create_stream("session1", "vid_def", test_config())
            .await;

        // Two streams for vid_abc
        let resource_streams = registry.get_resource_streams("vid_abc").await;
        assert_eq!(resource_streams.len(), 2);

        // One stream for vid_def
        let resource_streams = registry.get_resource_streams("vid_def").await;
        assert_eq!(resource_streams.len(), 1);

        // Destroy all streams for vid_abc
        registry.destroy_resource_streams("vid_abc").await;
        assert_eq!(registry.count().await, 1);

        // vid_abc streams should be gone
        let resource_streams = registry.get_resource_streams("vid_abc").await;
        assert_eq!(resource_streams.len(), 0);
    }

    #[tokio::test]
    async fn test_destroy_cleans_resource_index() {
        let registry = StreamRegistry::new();

        let (stream_id, _) = registry
            .create_stream("session1", "vid_abc", test_config())
            .await;

        assert_eq!(registry.get_resource_streams("vid_abc").await.len(), 1);

        registry.destroy(&stream_id).await.unwrap();

        assert_eq!(registry.get_resource_streams("vid_abc").await.len(), 0);
    }

    #[tokio::test]
    async fn test_create_stream_replacing_resource_is_singleton() {
        let registry = StreamRegistry::new();
        let first_token = CancellationToken::new();
        let first_token_clone = first_token.clone();
        let (first_id, _) = registry
            .create_stream_replacing_resource("session1", "vid_abc", test_config(), first_token)
            .await;
        registry.activate(&first_id).await.unwrap();

        let second_token = CancellationToken::new();
        let second_token_clone = second_token.clone();
        let (second_id, _) = registry
            .create_stream_replacing_resource("session1", "vid_abc", test_config(), second_token)
            .await;

        assert_ne!(first_id, second_id);
        assert!(first_token_clone.is_cancelled());
        assert!(!second_token_clone.is_cancelled());
        assert!(!registry.exists(&first_id).await);
        assert!(registry.exists(&second_id).await);
        assert_eq!(
            registry.get_resource_streams("vid_abc").await,
            vec![second_id]
        );
        assert_eq!(registry.get_session_streams("session1").await.len(), 1);
    }

    #[tokio::test]
    async fn test_destroy_cancels_token() {
        let registry = StreamRegistry::new();
        let (stream_id, _rx) = registry
            .create_stream("session1", "vid_abc", test_config())
            .await;

        // Register a CancellationToken
        let token = CancellationToken::new();
        let token_clone = token.clone();
        registry.set_cancel_token(&stream_id, token).await;

        // Activate then destroy
        registry.activate(&stream_id).await.unwrap();
        registry.destroy(&stream_id).await.unwrap();

        // Token should be cancelled
        assert!(token_clone.is_cancelled());
    }

    #[tokio::test]
    async fn test_destroy_session_cancels_tokens() {
        let registry = StreamRegistry::new();
        let (id1, _) = registry
            .create_stream("session1", "vid_1", test_config())
            .await;
        let (id2, _) = registry
            .create_stream("session1", "vid_2", test_config())
            .await;

        let token1 = CancellationToken::new();
        let token2 = CancellationToken::new();
        let t1_clone = token1.clone();
        let t2_clone = token2.clone();
        registry.set_cancel_token(&id1, token1).await;
        registry.set_cancel_token(&id2, token2).await;

        registry.activate(&id1).await.unwrap();
        registry.activate(&id2).await.unwrap();

        // Destroy session should cancel both tokens
        registry.destroy_session("session1").await;

        assert!(t1_clone.is_cancelled());
        assert!(t2_clone.is_cancelled());
        assert_eq!(registry.count().await, 0);
    }

    #[tokio::test]
    async fn test_get_sender() {
        let registry = StreamRegistry::new();
        let (stream_id, mut rx) = registry
            .create_stream("session1", "vid_abc", test_config())
            .await;

        registry.activate(&stream_id).await.unwrap();

        // Get sender and push a frame through it
        let tx = registry.get_sender(&stream_id).await.unwrap();
        let frame = FrameData::new(
            vec![42u8; 100],
            1920,
            1080,
            neko_engine_types::FrameFormat::Rgba,
        );
        tx.send(frame).unwrap();

        let received = rx.try_recv().unwrap();
        assert_eq!(received.data[0], 42);
    }
}
