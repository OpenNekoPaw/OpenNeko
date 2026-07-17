//! StreamController - handles streams:* actions
//!
//! Manages stream lifecycle through the StreamRegistry and provides
//! unified playback control (stop/seek/speed/stats/update) via TimelineService.
//!
//! Lifecycle actions (StreamRegistry):
//! - create: Create a new stream + auto-activate
//! - activate: Created → Active
//! - pause: Active → Paused (registry state only)
//! - resume: Paused → Active (registry state only)
//! - destroy: Any → Destroyed
//! - list: List all streams for a session
//!
//! Playback control actions (delegated to TimelineService via handle_stream_control):
//! - stop: Stop stream playback and destroy
//! - seek: Seek to time position
//! - speed: Set playback speed
//! - loop: Set loop region
//! - stats: Get stream performance statistics
//! - update: Hot-update timeline data without recreating stream

use crate::controllers::utils::handle_stream_control;
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::{StreamRegistry, StreamStateError};
use neko_engine_kernel::contracts::domain::EditOperationEnvelope;
use neko_engine_kernel::contracts::domain::{StreamCodec, StreamConfig, Timeline};
use neko_engine_kernel::contracts::jvi::JviLoader;
use neko_engine_kernel::contracts::services::ITimelineService;
use neko_engine_types::registry;
use neko_engine_types::{ActionResponse, Resolution, StreamId};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for stream lifecycle management and playback control
pub struct StreamController {
    stream_registry: Arc<StreamRegistry>,
    timeline_service: Arc<dyn ITimelineService>,
}

impl StreamController {
    /// Create a new StreamController
    pub fn new(
        stream_registry: Arc<StreamRegistry>,
        timeline_service: Arc<dyn ITimelineService>,
    ) -> Self {
        Self {
            stream_registry,
            timeline_service,
        }
    }
}

/// Options for streams:create
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateOptions {
    /// Session ID (required)
    session_id: Option<String>,
    /// Resource ID to associate with the stream
    resource_id: Option<String>,
    /// Output width
    width: Option<u32>,
    /// Output height
    height: Option<u32>,
    /// Frame rate
    fps: Option<f64>,
    /// Codec: "h264" | "raw"
    codec: Option<String>,
}

/// Options for streams:list
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListOptions {
    /// Session ID to filter by
    session_id: Option<String>,
}

/// Resolve stream ID from options.streamId (preferred) or resource_id (fallback).
/// This allows both dispatch-style (`options: { streamId: "..." }`) and
/// REST-style (`/v1/streams/:id/:action`) to work uniformly.
fn resolve_stream_id(
    options: &Value,
    resource_id: Option<&str>,
    action_name: &str,
) -> ApiResult<String> {
    // Try options.streamId first
    if let Some(sid) = options.get("streamId").and_then(|v| v.as_str()) {
        if !sid.is_empty() {
            return Ok(sid.to_string());
        }
    }
    // Fallback to resource_id (REST path param)
    if let Some(rid) = resource_id {
        if !rid.is_empty() {
            return Ok(rid.to_string());
        }
    }
    Err(ApiError::InvalidRequest(format!(
        "streamId is required for {}",
        action_name
    )))
}

impl Controller for StreamController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "create" => {
                let opts: CreateOptions = serde_json::from_value(options).unwrap_or_default();

                let session_id = opts.session_id.ok_or_else(|| {
                    ApiError::InvalidRequest("sessionId is required for streams:create".to_string())
                })?;

                let res_id = opts
                    .resource_id
                    .or_else(|| resource_id.map(|s| s.to_string()))
                    .unwrap_or_else(|| format!("res_{}", session_id));

                let width = opts.width.unwrap_or(1920);
                let height = opts.height.unwrap_or(1080);
                let fps = opts.fps.unwrap_or(30.0);
                let codec = match opts.codec.as_deref() {
                    Some("raw") => StreamCodec::Raw,
                    _ => StreamCodec::H264,
                };

                let config = StreamConfig {
                    resolution: Resolution::new(width, height),
                    fps,
                    start_time: 0.0,
                    codec,
                    initial_paused: false,
                };

                // Create the stream
                let (stream_id, _rx) = self
                    .stream_registry
                    .create_stream(&session_id, &res_id, config)
                    .await;

                // Auto-activate
                self.stream_registry
                    .activate(&stream_id)
                    .await
                    .map_err(|e| {
                        ApiError::StreamError(format!("Failed to activate stream: {}", e))
                    })?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "sessionId": session_id,
                    "resourceId": res_id,
                    "wsEndpoint": format!("/v1/streams/{}", stream_id.as_str()),
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "activate" => {
                let stream_id = resolve_stream_id(&options, resource_id, "streams:activate")?;

                let sid = StreamId::from_string(stream_id.clone());
                self.stream_registry
                    .activate(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "pause" => {
                let stream_id = resolve_stream_id(&options, resource_id, "streams:pause")?;

                let sid = StreamId::from_string(stream_id.clone());
                self.stream_registry
                    .pause(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                // Also pause decode loop if running. Use let _ = because the loop may not
                // be active yet (stream created but timelines:stream not called) or may have
                // finished at EOF. The registry state change above is the authoritative signal.
                let _ = self.timeline_service.pause(&sid).await;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "paused",
                });

                Ok(ActionResponse::ok("", response))
            }

            "resume" => {
                let stream_id = resolve_stream_id(&options, resource_id, "streams:resume")?;

                let sid = StreamId::from_string(stream_id.clone());
                self.stream_registry
                    .resume(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                // Apply seek position if provided (before resuming so first frame is correct)
                if let Some(time) = options.get("time").and_then(|v| v.as_f64()) {
                    let _ = self.timeline_service.seek(&sid, time).await;
                }

                // Apply speed if provided
                if let Some(speed) = options.get("speed").and_then(|v| v.as_f64()) {
                    let _ = self.timeline_service.set_speed(&sid, speed).await;
                }

                // Signal decode loop to resume if running. Use let _ = for the same reason
                // as pause: the loop may not be active (stream not yet started or already at EOF).
                let _ = self.timeline_service.resume(&sid).await;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "destroy" => {
                let stream_id = resolve_stream_id(&options, resource_id, "streams:destroy")?;

                let sid = StreamId::from_string(stream_id.clone());

                // Clean up TimelineService internal state (stats_receivers + current_timelines).
                // Use let _ = because stop_stream may fail if stream is not in ActiveStreams
                // (e.g. already stopped via EOF timeout), which is not an error for destroy.
                let _ = self.timeline_service.stop_stream(&sid).await;

                let already_destroyed = match self.stream_registry.destroy(&sid).await {
                    Ok(()) => false,
                    Err(StreamStateError::NotFound(_)) => true,
                    Err(error) => return Err(ApiError::StreamError(error.to_string())),
                };

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "destroyed",
                    "alreadyDestroyed": already_destroyed,
                });

                Ok(ActionResponse::ok("", response))
            }

            "list" => {
                let opts: ListOptions = serde_json::from_value(options).unwrap_or_default();

                let session_id = opts.session_id.ok_or_else(|| {
                    ApiError::InvalidRequest("sessionId is required for streams:list".to_string())
                })?;

                let stream_ids = self.stream_registry.get_session_streams(&session_id).await;

                let ids: Vec<&str> = stream_ids.iter().map(|id| id.as_str()).collect();

                let response = serde_json::json!({
                    "sessionId": session_id,
                    "streams": ids,
                    "count": ids.len(),
                });

                Ok(ActionResponse::ok("", response))
            }

            // Hot-update preview quality (resolution/bitrate) without recreating stream
            "quality" => {
                let stream_id_str = resolve_stream_id(&options, resource_id, "streams:quality")?;
                let stream_id = StreamId::from_string(stream_id_str.clone());

                let width = options
                    .get("width")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest("width required for streams:quality".to_string())
                    })?;
                let height = options
                    .get("height")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest("height required for streams:quality".to_string())
                    })?;
                let bitrate = options.get("bitrate").and_then(|v| v.as_u64());
                let fps = options.get("fps").and_then(|v| v.as_f64());

                self.timeline_service
                    .set_quality(&stream_id, width, height, bitrate, fps)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to set quality: {}", e)))?;

                let response = serde_json::json!({
                    "streamId": stream_id_str,
                    "width": width,
                    "height": height,
                    "status": "updated",
                });

                Ok(ActionResponse::ok("", response))
            }

            // Playback control actions — delegated to TimelineService via handle_stream_control
            "stop" | "seek" | "speed" | "loop" => {
                handle_stream_control(self.timeline_service.as_ref(), action, options, "streams")
                    .await
            }

            // Stream stats — delegated to TimelineService
            "stats" => {
                let opts: crate::controllers::utils::StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("streamId required for streams:stats".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                match self.timeline_service.get_stream_stats(&stream_id).await {
                    Some(stats) => Ok(ActionResponse::ok(
                        stream_id.as_str(),
                        serde_json::to_value(stats)?,
                    )),
                    None => Err(ApiError::NotFound(format!(
                        "No stats for stream '{}'",
                        stream_id.as_str()
                    ))),
                }
            }

            // Hot-update timeline data without recreating stream
            "update" => {
                let opts: crate::controllers::utils::StreamControlOptions =
                    serde_json::from_value(options.clone()).unwrap_or_default();

                let stream_id_str = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("streamId required for streams:update".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id_str);

                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "Timeline data required in body for streams:update".to_string(),
                    )
                })?;

                // Resolve baseDir from options (same as timelines:stream)
                let base_dir = options
                    .get("baseDir")
                    .and_then(|v| v.as_str())
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|| std::path::PathBuf::from("."));

                // Parse timeline (try domain format first, fallback to JVI)
                let timeline: Timeline = serde_json::from_value(body.clone())
                    .or_else(|domain_err| {
                        let json_str = serde_json::to_string(&body).map_err(|e| {
                            ApiError::InvalidRequest(format!("Invalid JSON: {}", e))
                        })?;
                        let loader = JviLoader::new();
                        let (tl, _) = loader.load_from_json(&json_str, base_dir).map_err(|e| {
                            tracing::warn!(
                                "streams:update timeline parse failed - domain: {}, JVI: {}",
                                domain_err,
                                e
                            );
                            ApiError::InvalidRequest(format!("Invalid timeline data: {}", e))
                        })?;
                        Ok::<Timeline, ApiError>(tl)
                    })
                    .map_err(|e: ApiError| e)?;

                self.timeline_service
                    .update_stream(&stream_id, &timeline)
                    .await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "status": "updated",
                });

                Ok(ActionResponse::ok("", response))
            }

            // Incremental operation apply (avoids full JSON parse + JVI conversion)
            "applyOperation" => {
                let opts: crate::controllers::utils::StreamControlOptions =
                    serde_json::from_value(options.clone()).unwrap_or_default();

                let stream_id_str = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "streamId required for streams:applyOperation".to_string(),
                    )
                })?;
                let stream_id = StreamId::from_string(stream_id_str);

                let base_dir = opts.base_dir.map(std::path::PathBuf::from);

                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "Operation data required in body for streams:applyOperation".to_string(),
                    )
                })?;

                let operation: EditOperationEnvelope = serde_json::from_value(body)
                    .map_err(|e| ApiError::InvalidRequest(format!("Invalid operation: {}", e)))?;

                let applied = self
                    .timeline_service
                    .apply_operation_to_stream(&stream_id, &operation, base_dir.as_deref())
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Apply operation failed: {}", e)))?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "applied": applied,
                });

                Ok(ActionResponse::ok("", response))
            }

            _ => Err(ApiError::UnknownAction {
                group: "streams".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::STREAMS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::STREAMS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> StreamController {
        let stream_registry = Arc::new(StreamRegistry::new());
        let services = ServiceFactory::new().create_with_gpu(None);
        StreamController::new(stream_registry, services.timeline_service)
    }

    #[tokio::test]
    async fn test_create_stream() {
        let controller = create_test_controller();

        let options = serde_json::json!({
            "sessionId": "test-session",
            "resourceId": "vid_abc123",
            "width": 1280,
            "height": 720,
            "fps": 30.0,
        });

        let result = controller.handle("create", None, options, None).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());

        let data = response.data.unwrap();
        assert!(data["streamId"].as_str().unwrap().starts_with("strm_"));
        assert_eq!(data["state"], "active");
        assert!(data["wsEndpoint"]
            .as_str()
            .unwrap()
            .starts_with("/v1/streams/strm_"));
    }

    #[tokio::test]
    async fn test_stream_lifecycle() {
        let controller = create_test_controller();

        // Create
        let options = serde_json::json!({
            "sessionId": "test-session",
            "resourceId": "vid_abc123",
        });
        let result = controller
            .handle("create", None, options, None)
            .await
            .unwrap();
        let stream_id = result.data.as_ref().unwrap()["streamId"]
            .as_str()
            .unwrap()
            .to_string();

        // Pause
        let result = controller
            .handle("pause", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "paused");

        // Resume
        let result = controller
            .handle("resume", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "active");

        // Destroy
        let result = controller
            .handle("destroy", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "destroyed");
        assert_eq!(data["alreadyDestroyed"], false);
    }

    #[tokio::test]
    async fn test_destroy_stream_is_idempotent() {
        let controller = create_test_controller();

        let options = serde_json::json!({
            "sessionId": "test-session",
            "resourceId": "vid_abc123",
        });
        let result = controller
            .handle("create", None, options, None)
            .await
            .unwrap();
        let stream_id = result.data.as_ref().unwrap()["streamId"]
            .as_str()
            .unwrap()
            .to_string();

        controller
            .handle("destroy", Some(&stream_id), Value::Null, None)
            .await
            .unwrap();
        let second_destroy = controller
            .handle("destroy", Some(&stream_id), Value::Null, None)
            .await
            .unwrap();

        assert!(second_destroy.is_ok());
        let data = second_destroy.data.unwrap();
        assert_eq!(data["state"], "destroyed");
        assert_eq!(data["alreadyDestroyed"], true);
    }

    #[tokio::test]
    async fn test_list_session_streams() {
        let controller = create_test_controller();

        // Create two streams for the same session
        let options1 = serde_json::json!({
            "sessionId": "session-1",
            "resourceId": "vid_1",
        });
        let options2 = serde_json::json!({
            "sessionId": "session-1",
            "resourceId": "vid_2",
        });

        controller
            .handle("create", None, options1, None)
            .await
            .unwrap();
        controller
            .handle("create", None, options2, None)
            .await
            .unwrap();

        // List
        let list_opts = serde_json::json!({ "sessionId": "session-1" });
        let result = controller
            .handle("list", None, list_opts, None)
            .await
            .unwrap();

        let data = result.data.unwrap();
        assert_eq!(data["count"], 2);
        assert_eq!(data["streams"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_create_stream_missing_session_id() {
        let controller = create_test_controller();

        let result = controller.handle("create", None, Value::Null, None).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("sessionId"));
    }

    #[tokio::test]
    async fn test_unknown_action() {
        let controller = create_test_controller();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
    }
}
