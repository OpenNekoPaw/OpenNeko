//! SessionManager - Multi-window session lifecycle management
//!
//! Manages sessions with:
//! - Session creation and destruction
//! - Resource scoping per session
//! - Cascade cleanup of associated streams on session destroy
//! - Idle session timeout

use crate::registry::StreamRegistry;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// A session representing a client connection (e.g., an editor window)
#[derive(Debug)]
pub struct Session {
    /// Session identifier
    pub id: String,
    /// When the session was created
    pub created_at: Instant,
    /// Last activity timestamp (for idle detection)
    pub last_active: Instant,
    /// Resources scoped to this session
    pub resources: Vec<String>,
}

impl Session {
    fn new(id: String) -> Self {
        let now = Instant::now();
        Self {
            id,
            created_at: now,
            last_active: now,
            resources: Vec::new(),
        }
    }

    fn touch(&mut self) {
        self.last_active = Instant::now();
    }

    fn idle_duration(&self) -> Duration {
        self.last_active.elapsed()
    }
}

/// Configuration for SessionManager
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// How long a session can be idle before cleanup
    pub idle_timeout: Duration,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            idle_timeout: Duration::from_secs(3600), // 1 hour
        }
    }
}

/// Manages client sessions and their associated resources/streams
///
/// Each session represents a client connection (e.g., an editor window).
/// When a session is destroyed, all associated streams are cascade-destroyed
/// via the StreamRegistry.
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    stream_registry: Arc<StreamRegistry>,
    config: SessionConfig,
}

impl SessionManager {
    /// Create a new SessionManager with default config
    pub fn new(stream_registry: Arc<StreamRegistry>) -> Self {
        Self::with_config(stream_registry, SessionConfig::default())
    }

    /// Create a new SessionManager with custom config
    pub fn with_config(stream_registry: Arc<StreamRegistry>, config: SessionConfig) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            stream_registry,
            config,
        }
    }

    /// Create a session (idempotent — returns true if newly created)
    pub async fn create(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.write().await;
        if sessions.contains_key(session_id) {
            // Touch existing session
            if let Some(session) = sessions.get_mut(session_id) {
                session.touch();
            }
            false
        } else {
            sessions.insert(session_id.to_string(), Session::new(session_id.to_string()));
            tracing::debug!("Created session {}", session_id);
            true
        }
    }

    /// Check if a session exists
    pub async fn exists(&self, session_id: &str) -> bool {
        let sessions = self.sessions.read().await;
        sessions.contains_key(session_id)
    }

    /// Destroy a session and cascade-destroy all associated streams
    pub async fn destroy(&self, session_id: &str) {
        {
            let mut sessions = self.sessions.write().await;
            sessions.remove(session_id);
        }

        // Cascade: destroy all streams belonging to this session
        self.stream_registry.destroy_session(session_id).await;

        tracing::debug!(
            "Destroyed session {} (streams cascade-destroyed)",
            session_id
        );
    }

    /// Add a resource to a session's scope
    pub async fn add_resource(&self, session_id: &str, resource_id: &str) -> bool {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            if !session.resources.contains(&resource_id.to_string()) {
                session.resources.push(resource_id.to_string());
            }
            session.touch();
            true
        } else {
            false
        }
    }

    /// Get all resources scoped to a session
    pub async fn get_resources(&self, session_id: &str) -> Vec<String> {
        let sessions = self.sessions.read().await;
        sessions
            .get(session_id)
            .map(|s| s.resources.clone())
            .unwrap_or_default()
    }

    /// Access the underlying stream registry
    pub fn streams(&self) -> &Arc<StreamRegistry> {
        &self.stream_registry
    }

    /// Get the number of active sessions
    pub async fn count(&self) -> usize {
        let sessions = self.sessions.read().await;
        sessions.len()
    }

    /// List all session IDs
    pub async fn list(&self) -> Vec<String> {
        let sessions = self.sessions.read().await;
        sessions.keys().cloned().collect()
    }

    /// Cleanup idle sessions, returns the number of sessions cleaned up
    pub async fn cleanup_idle(&self) -> usize {
        let to_remove: Vec<String> = {
            let sessions = self.sessions.read().await;
            sessions
                .values()
                .filter(|s| s.idle_duration() > self.config.idle_timeout)
                .map(|s| s.id.clone())
                .collect()
        };

        let count = to_remove.len();
        for session_id in to_remove {
            self.destroy(&session_id).await;
        }

        if count > 0 {
            tracing::info!("Cleaned up {} idle sessions", count);
        }

        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_manager() -> SessionManager {
        let stream_registry = Arc::new(StreamRegistry::new());
        SessionManager::new(stream_registry)
    }

    fn create_test_manager_with_timeout(timeout: Duration) -> SessionManager {
        let stream_registry = Arc::new(StreamRegistry::new());
        SessionManager::with_config(
            stream_registry,
            SessionConfig {
                idle_timeout: timeout,
            },
        )
    }

    #[tokio::test]
    async fn test_create_session() {
        let manager = create_test_manager();

        assert!(manager.create("session1").await);
        assert_eq!(manager.count().await, 1);
    }

    #[tokio::test]
    async fn test_create_session_idempotent() {
        let manager = create_test_manager();

        assert!(manager.create("session1").await);
        assert!(!manager.create("session1").await); // Already exists
        assert_eq!(manager.count().await, 1);
    }

    #[tokio::test]
    async fn test_exists() {
        let manager = create_test_manager();

        assert!(!manager.exists("session1").await);
        manager.create("session1").await;
        assert!(manager.exists("session1").await);
    }

    #[tokio::test]
    async fn test_destroy_session() {
        let manager = create_test_manager();

        manager.create("session1").await;
        assert_eq!(manager.count().await, 1);

        manager.destroy("session1").await;
        assert_eq!(manager.count().await, 0);
        assert!(!manager.exists("session1").await);
    }

    #[tokio::test]
    async fn test_add_resource() {
        let manager = create_test_manager();

        manager.create("session1").await;
        assert!(manager.add_resource("session1", "vid_abc123").await);
        assert!(manager.add_resource("session1", "vid_def456").await);

        let resources = manager.get_resources("session1").await;
        assert_eq!(resources.len(), 2);
        assert!(resources.contains(&"vid_abc123".to_string()));
        assert!(resources.contains(&"vid_def456".to_string()));
    }

    #[tokio::test]
    async fn test_add_resource_dedup() {
        let manager = create_test_manager();

        manager.create("session1").await;
        manager.add_resource("session1", "vid_abc123").await;
        manager.add_resource("session1", "vid_abc123").await;

        let resources = manager.get_resources("session1").await;
        assert_eq!(resources.len(), 1);
    }

    #[tokio::test]
    async fn test_add_resource_nonexistent_session() {
        let manager = create_test_manager();

        assert!(!manager.add_resource("nonexistent", "vid_abc123").await);
    }

    #[tokio::test]
    async fn test_get_resources_nonexistent_session() {
        let manager = create_test_manager();

        let resources = manager.get_resources("nonexistent").await;
        assert!(resources.is_empty());
    }

    #[tokio::test]
    async fn test_list_sessions() {
        let manager = create_test_manager();

        manager.create("session1").await;
        manager.create("session2").await;

        let mut sessions = manager.list().await;
        sessions.sort();
        assert_eq!(sessions, vec!["session1", "session2"]);
    }

    #[tokio::test]
    async fn test_cleanup_idle() {
        let manager = create_test_manager_with_timeout(Duration::from_millis(10));

        manager.create("session1").await;
        manager.create("session2").await;

        // Wait for sessions to become idle
        tokio::time::sleep(Duration::from_millis(50)).await;

        let cleaned = manager.cleanup_idle().await;
        assert_eq!(cleaned, 2);
        assert_eq!(manager.count().await, 0);
    }

    #[tokio::test]
    async fn test_cleanup_idle_preserves_active() {
        let manager = create_test_manager_with_timeout(Duration::from_millis(100));

        manager.create("session1").await;

        // Wait a bit but not enough for timeout
        tokio::time::sleep(Duration::from_millis(10)).await;

        let cleaned = manager.cleanup_idle().await;
        assert_eq!(cleaned, 0);
        assert_eq!(manager.count().await, 1);
    }

    #[tokio::test]
    async fn test_destroy_cascades_streams() {
        let stream_registry = Arc::new(StreamRegistry::new());
        let manager = SessionManager::new(stream_registry.clone());

        manager.create("session1").await;

        // Create streams for this session
        let config = neko_engine_kernel::contracts::domain::StreamConfig {
            resolution: neko_engine_types::Resolution::new(1920, 1080),
            fps: 30.0,
            start_time: 0.0,
            codec: neko_engine_kernel::contracts::domain::StreamCodec::H264,
            initial_paused: false,
        };
        let (_id1, _) = stream_registry
            .create_stream("session1", "vid_abc", config.clone())
            .await;
        let (_id2, _) = stream_registry
            .create_stream("session1", "vid_def", config)
            .await;

        assert_eq!(stream_registry.count().await, 2);

        // Destroy session should cascade-destroy streams
        manager.destroy("session1").await;

        assert_eq!(stream_registry.count().await, 0);
    }
}
