//! NativeEngine - NAPI bridge to EngineApi
//!
//! This module provides a Node.js-friendly interface to the EngineApi.
//! It handles JSON serialization/deserialization and async bridging.
//!
//! Features:
//! - `dispatch` / `dispatch_action` — unified ActionRequest/ActionResponse protocol
//! - `start_frame_server` / `stop_frame_server` — embedded HTTP/WS server lifecycle
//! - Convenience methods for common operations (probe, capture, tasks, etc.)

use napi_derive::napi;
use std::sync::{Arc, Mutex};
use tokio::sync::OnceCell;

use neko_engine_types::{ActionRequest, EngineConfig};
use neko_host_api::EngineApi;

/// Global engine instance (singleton)
static ENGINE: OnceCell<Arc<EngineApi>> = OnceCell::const_new();
static HTTP_SERVER: Mutex<Option<HttpServerState>> = Mutex::new(None);

pub(crate) fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .try_init();
}

pub(crate) fn shared_engine_cell() -> &'static OnceCell<Arc<EngineApi>> {
    &ENGINE
}

/// Get or initialize the global engine instance with optional config path
pub(crate) async fn get_engine_with_config(
    config_path: Option<String>,
) -> napi::Result<Arc<EngineApi>> {
    shared_engine_cell()
        .get_or_try_init(|| async {
            let config = EngineConfig::load(
                config_path
                    .as_ref()
                    .map(|s| std::path::Path::new(s.as_str())),
                None,
            )
            .map_err(|e| napi::Error::from_reason(format!("Config error: {}", e)))?;

            EngineApi::with_config(config)
                .await
                .map(Arc::new)
                .map_err(|e| {
                    napi::Error::from_reason(format!("Failed to initialize engine: {}", e))
                })
        })
        .await
        .cloned()
}

pub(crate) async fn get_engine() -> napi::Result<Arc<EngineApi>> {
    get_engine_with_config(None).await
}

/// Process-wide state for the embedded HTTP/WebSocket server.
///
/// The engine itself is process-scoped, and the frame server must follow that
/// lifetime rather than the lifetime of any single JavaScript NativeEngine
/// wrapper. Otherwise a wrapper drop or GC cycle can close the HTTP server
/// while other extensions still hold a cached port.
struct HttpServerState {
    addr: std::net::SocketAddr,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

fn http_server_state() -> &'static Mutex<Option<HttpServerState>> {
    &HTTP_SERVER
}

/// NativeEngine - Main entry point for all engine operations
///
/// This class provides a unified interface to the Neko Engine through
/// the ActionRequest/ActionResponse protocol.
///
/// It also manages an optional embedded HTTP/WebSocket server for
/// per-stream frame delivery to webview consumers.
#[napi]
pub struct NativeEngine {
    engine: Arc<EngineApi>,
}

#[napi]
impl NativeEngine {
    /// Create a new NativeEngine instance
    ///
    /// @param config_path - Optional path to engine.toml config file.
    ///   If omitted, loads from ~/.neko/engine.toml and .neko/engine.toml.
    #[napi(factory)]
    pub async fn create(config_path: Option<String>) -> napi::Result<Self> {
        init_tracing();

        tracing::info!("Creating NativeEngine...");

        let engine = get_engine_with_config(config_path).await?;

        tracing::info!(
            "NativeEngine created (GPU: {})",
            if engine.has_gpu() {
                "enabled"
            } else {
                "disabled"
            }
        );

        Ok(Self { engine })
    }

    /// Dispatch an action request
    ///
    /// This is the main entry point for all operations.
    /// Takes a JSON string representing an ActionRequest and returns
    /// a JSON string representing an ActionResponse.
    #[napi]
    pub async fn dispatch(&self, request_json: String) -> napi::Result<String> {
        let response = self.engine.dispatch_json(&request_json).await;
        Ok(response)
    }

    /// Dispatch an action request with typed parameters
    ///
    /// Convenience method that takes individual parameters instead of JSON.
    /// All ActionRequest fields are supported for full parity with `dispatch()`.
    #[napi]
    #[allow(clippy::too_many_arguments)]
    pub async fn dispatch_action(
        &self,
        group: String,
        action: String,
        id: Option<String>,
        options: Option<String>,
        source: Option<String>,
        session_id: Option<String>,
        stream_id: Option<String>,
        body: Option<String>,
    ) -> napi::Result<String> {
        let options_value: serde_json::Value =
            parse_json_arg(options, "options")?.unwrap_or(serde_json::Value::Null);

        let body_value: Option<serde_json::Value> = parse_json_arg(body, "body")?;

        let request = ActionRequest {
            group,
            action,
            id: id.unwrap_or_default(),
            source,
            session_id,
            stream_id,
            options: options_value,
            body: body_value,
        };

        let response = self.engine.dispatch(request).await;
        serde_json::to_string(&response)
            .map_err(|e| napi::Error::from_reason(format!("Serialization error: {}", e)))
    }

    /// Check if GPU is available
    #[napi]
    pub fn has_gpu(&self) -> bool {
        self.engine.has_gpu()
    }

    /// Get list of supported action groups
    #[napi]
    pub fn groups(&self) -> Vec<String> {
        self.engine
            .groups()
            .into_iter()
            .map(|s| s.to_string())
            .collect()
    }

    /// Get list of supported actions for a group
    #[napi]
    pub fn actions(&self, group: String) -> Option<Vec<String>> {
        self.engine
            .actions(&group)
            .map(|actions| actions.iter().map(|s| s.to_string()).collect())
    }

    // ========== Convenience methods for common operations ==========

    /// Get system health status
    #[napi]
    pub async fn health(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "health".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get system metrics (CPU, memory, GPU usage)
    #[napi]
    pub async fn metrics(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "metric".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get GPU information
    #[napi]
    pub async fn gpu_info(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "gpu".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Probe a video file for metadata
    #[napi]
    pub async fn probe_video(&self, source: String) -> napi::Result<String> {
        let options = serde_json::json!({ "source": source });
        self.dispatch_action(
            "videos".to_string(),
            "probe".to_string(),
            None,
            Some(options.to_string()),
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// List all active tasks
    #[napi]
    pub async fn list_tasks(&self) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "list".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get task progress
    #[napi]
    pub async fn get_task_progress(&self, task_id: String) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "probe".to_string(),
            Some(task_id),
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Cancel a task
    #[napi]
    pub async fn cancel_task(&self, task_id: String) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "cancel".to_string(),
            Some(task_id),
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Capture a single frame from video
    ///
    /// Returns JSON with base64-encoded frame data
    #[napi]
    pub async fn capture_frame(
        &self,
        source: String,
        time: f64,
        quality: Option<u32>,
        format: Option<String>,
    ) -> napi::Result<String> {
        let options = serde_json::json!({
            "source": source,
            "time": time,
            "quality": quality.unwrap_or(85),
            "format": format.unwrap_or_else(|| "jpeg".to_string()),
        });
        self.dispatch_action(
            "videos".to_string(),
            "capture".to_string(),
            None,
            Some(options.to_string()),
            None,
            None,
            None,
            None,
        )
        .await
    }

    // ========== Frame Server Management ==========

    /// Start the embedded HTTP/WebSocket server (full neko-host-http router).
    ///
    /// The server provides:
    /// - `ws://127.0.0.1:{port}/v1/streams/{stream_id}` — per-stream WebSocket
    /// - `POST http://127.0.0.1:{port}/v1/dispatch` — ActionRequest dispatch
    /// - `GET http://127.0.0.1:{port}/health` — health check
    /// - `POST http://127.0.0.1:{port}/v1/preview/register` — register file for Range serving
    /// - `GET http://127.0.0.1:{port}/v1/preview/file/:token` — serve file with Range support
    ///
    /// Returns the actual bound port (useful when port=0 for auto-assign).
    #[napi]
    pub async fn start_frame_server(&self, port: Option<u16>) -> napi::Result<u16> {
        self.start_frame_server_with_preview_roots(port, None).await
    }

    /// Start the embedded HTTP/WebSocket server with preview file allow-list roots.
    #[napi]
    pub async fn start_frame_server_with_preview_roots(
        &self,
        port: Option<u16>,
        preview_allowed_roots: Option<Vec<String>>,
    ) -> napi::Result<u16> {
        // Check if already running
        {
            let guard = http_server_state()
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            if guard.is_some() {
                return Err(napi::Error::from_reason(
                    "Frame server is already running. Call stopFrameServer() first.",
                ));
            }
        }

        let bind_port = port.unwrap_or(0);
        let preview_allowed_roots = preview_allowed_roots
            .unwrap_or_default()
            .into_iter()
            .map(std::path::PathBuf::from)
            .collect();

        let (addr, shutdown_tx) = neko_host_http::start_server_with_shutdown_and_preview_roots(
            self.engine.clone(),
            bind_port,
            preview_allowed_roots,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to start frame server: {}", e)))?;

        let actual_port = addr.port();

        tracing::info!("Frame server started on http://127.0.0.1:{}", actual_port);

        // Store the server state
        {
            let mut guard = http_server_state()
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            *guard = Some(HttpServerState { addr, shutdown_tx });
        }

        Ok(actual_port)
    }

    /// Update preview/file access allow-list roots for the running engine.
    ///
    /// The HTTP router and JSON controllers share the same EngineApi-backed
    /// registry, so this can safely be called after the frame server has
    /// already started.
    #[napi]
    pub fn set_preview_allowed_roots(
        &self,
        preview_allowed_roots: Option<Vec<String>>,
    ) -> napi::Result<()> {
        let roots = preview_allowed_roots
            .unwrap_or_default()
            .into_iter()
            .map(std::path::PathBuf::from)
            .collect();

        self.engine
            .set_preview_allowed_roots(roots)
            .map_err(|e| napi::Error::from_reason(format!("Failed to set preview roots: {}", e)))
    }

    /// Stop the embedded HTTP/WebSocket server
    #[napi]
    pub async fn stop_frame_server(&self) -> napi::Result<()> {
        let state = {
            let mut guard = http_server_state()
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            guard.take()
        };

        if let Some(server_state) = state {
            let _ = server_state.shutdown_tx.send(true);
            tracing::info!("Frame server on port {} stopped", server_state.addr.port());
        }

        Ok(())
    }

    /// Get the frame server port, or null if not running
    #[napi]
    pub fn get_frame_server_port(&self) -> Option<u16> {
        http_server_state()
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|s| s.addr.port()))
    }
}

fn parse_json_arg(value: Option<String>, label: &str) -> napi::Result<Option<serde_json::Value>> {
    value
        .map(|s| {
            serde_json::from_str(&s)
                .map_err(|e| napi::Error::from_reason(format!("Invalid {} JSON: {}", label, e)))
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::{http_server_state, parse_json_arg, HttpServerState, NativeEngine};

    #[test]
    fn parse_json_arg_rejects_malformed_json() {
        let result = parse_json_arg(Some("{broken".to_string()), "options");
        assert!(result.is_err());
    }

    #[test]
    fn parse_json_arg_accepts_valid_json() {
        let result = parse_json_arg(Some("{\"quality\":\"high\"}".to_string()), "options")
            .expect("valid json")
            .expect("some value");
        assert_eq!(result["quality"], "high");
    }

    #[tokio::test]
    async fn test_native_engine_creation() {
        // Note: This test requires GPU, may fail in CI
        // let engine = NativeEngine::create().await;
        // assert!(engine.is_ok());
    }

    #[tokio::test]
    async fn frame_server_state_is_shared_across_native_engine_wrappers_without_binding_socket() {
        let (shutdown_tx, _shutdown_rx) = tokio::sync::watch::channel(false);
        let test_addr = std::net::SocketAddr::from(([127, 0, 0, 1], 43210));
        {
            let mut guard = http_server_state()
                .lock()
                .expect("shared server state lock");
            *guard = Some(HttpServerState {
                addr: test_addr,
                shutdown_tx,
            });
        }

        let first = NativeEngine::create(None).await.expect("first engine");
        let second = NativeEngine::create(None).await.expect("second engine");
        assert_eq!(first.get_frame_server_port(), Some(test_addr.port()));
        assert_eq!(second.get_frame_server_port(), Some(test_addr.port()));
        assert!(
            second.start_frame_server(Some(0)).await.is_err(),
            "a second wrapper must see the already-running shared server"
        );

        second
            .stop_frame_server()
            .await
            .expect("stop shared server");
        assert_eq!(first.get_frame_server_port(), None);

        let mut guard = http_server_state()
            .lock()
            .expect("shared server state lock");
        *guard = None;
    }
}
