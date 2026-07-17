//! Request/Response protocol types

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ApiError, ErrorCode};

/// Unified action request — all View layers convert to this format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequest {
    /// Resource group (videos, audios, images, timelines, tasks, nodes)
    pub group: String,

    /// Resource ID (deterministic hash or empty for new resources)
    #[serde(default)]
    pub id: String,

    /// Action to perform (probe, capture, extract, stream, etc.)
    pub action: String,

    /// Source file path (for self-healing when ID is stale)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,

    /// Session ID for multi-window isolation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,

    /// Stream ID for signal targeting (pause/resume/speed/loop)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_id: Option<String>,

    /// Action-specific options
    #[serde(default = "default_options")]
    pub options: Value,

    /// Request body (for complex payloads like Timeline)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
}

impl ActionRequest {
    pub fn new(group: impl Into<String>, action: impl Into<String>) -> Self {
        Self {
            group: group.into(),
            id: String::new(),
            action: action.into(),
            source: None,
            session_id: None,
            stream_id: None,
            options: default_options(),
            body: None,
        }
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = id.into();
        self
    }

    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }

    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    pub fn with_stream(mut self, stream_id: impl Into<String>) -> Self {
        self.stream_id = Some(stream_id.into());
        self
    }

    pub fn with_options(mut self, options: Value) -> Self {
        self.options = options;
        self
    }

    pub fn with_body(mut self, body: Value) -> Self {
        self.body = Some(body);
        self
    }

    /// Get option as string
    pub fn option_str(&self, key: &str) -> Option<&str> {
        self.options.get(key).and_then(|v| v.as_str())
    }

    /// Get option as f64
    pub fn option_f64(&self, key: &str) -> Option<f64> {
        self.options.get(key).and_then(|v| v.as_f64())
    }

    /// Get option as i64
    pub fn option_i64(&self, key: &str) -> Option<i64> {
        self.options.get(key).and_then(|v| v.as_i64())
    }

    /// Get option as u64
    pub fn option_u64(&self, key: &str) -> Option<u64> {
        self.options.get(key).and_then(|v| v.as_u64())
    }

    /// Get option as bool
    pub fn option_bool(&self, key: &str) -> Option<bool> {
        self.options.get(key).and_then(|v| v.as_bool())
    }

    /// Parse body as typed value
    pub fn parse_body<T: for<'de> Deserialize<'de>>(&self) -> Result<T, ApiError> {
        match &self.body {
            Some(body) => serde_json::from_value(body.clone()).map_err(|e| {
                ApiError::new(ErrorCode::ValidationError, format!("Invalid body: {}", e))
            }),
            None => Err(ApiError::missing_parameter("body")),
        }
    }
}

fn default_options() -> Value {
    Value::Object(serde_json::Map::new())
}

/// Unified action response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResponse {
    /// Request ID (echoed back for correlation)
    pub id: String,

    /// Response status
    pub status: ResponseStatus,

    /// Response data (action-specific)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,

    /// Progress info (for long-running operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<Value>,

    /// Error info (if status is Error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

/// Response status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResponseStatus {
    Ok,
    Error,
    Pending,
    Progress,
}

impl ActionResponse {
    /// Create success response
    pub fn ok(id: impl Into<String>, data: Value) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Ok,
            data: Some(data),
            progress: None,
            error: None,
        }
    }

    /// Create error response
    pub fn error(id: impl Into<String>, code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Error,
            data: None,
            progress: None,
            error: Some(ApiError::new(code, message)),
        }
    }

    /// Create error response from ApiError
    pub fn from_error(id: impl Into<String>, error: ApiError) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Error,
            data: None,
            progress: None,
            error: Some(error),
        }
    }

    /// Create pending response (for async operations)
    pub fn pending(id: impl Into<String>, task_id: &str) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Pending,
            data: Some(serde_json::json!({ "taskId": task_id })),
            progress: None,
            error: None,
        }
    }

    /// Create progress response
    pub fn progress(id: impl Into<String>, progress: Value) -> Self {
        Self {
            id: id.into(),
            status: ResponseStatus::Progress,
            data: None,
            progress: Some(progress),
            error: None,
        }
    }

    /// Check if response is successful
    pub fn is_ok(&self) -> bool {
        self.status == ResponseStatus::Ok
    }

    /// Check if response is error
    pub fn is_error(&self) -> bool {
        self.status == ResponseStatus::Error
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- ActionRequest ----

    #[test]
    fn test_request_new() {
        let req = ActionRequest::new("videos", "probe");
        assert_eq!(req.group, "videos");
        assert_eq!(req.action, "probe");
        assert_eq!(req.id, "");
        assert!(req.source.is_none());
        assert!(req.session_id.is_none());
        assert!(req.stream_id.is_none());
    }

    #[test]
    fn test_request_builder_chain() {
        let req = ActionRequest::new("videos", "stream")
            .with_id("vid_abc")
            .with_source("/path/to/video.mp4")
            .with_session("session_1")
            .with_stream("stream_1")
            .with_options(json!({"fps": 30}))
            .with_body(json!({"timeline": {}}));

        assert_eq!(req.id, "vid_abc");
        assert_eq!(req.source.as_deref(), Some("/path/to/video.mp4"));
        assert_eq!(req.session_id.as_deref(), Some("session_1"));
        assert_eq!(req.stream_id.as_deref(), Some("stream_1"));
        assert_eq!(req.options["fps"], 30);
        assert!(req.body.is_some());
    }

    #[test]
    fn test_request_option_accessors() {
        let req = ActionRequest::new("videos", "probe").with_options(json!({
            "path": "/video.mp4",
            "fps": 29.97,
            "width": 1920,
            "loop": true
        }));

        assert_eq!(req.option_str("path"), Some("/video.mp4"));
        assert_eq!(req.option_f64("fps"), Some(29.97));
        assert_eq!(req.option_i64("width"), Some(1920));
        assert_eq!(req.option_bool("loop"), Some(true));
        assert_eq!(req.option_str("missing"), None);
    }

    #[test]
    fn test_request_parse_body() {
        #[derive(serde::Deserialize, PartialEq, Debug)]
        struct MyBody {
            name: String,
        }

        let req = ActionRequest::new("test", "test").with_body(json!({"name": "hello"}));
        let body: MyBody = req.parse_body().unwrap();
        assert_eq!(body.name, "hello");
    }

    #[test]
    fn test_request_parse_body_missing() {
        let req = ActionRequest::new("test", "test");
        let result = req.parse_body::<serde_json::Value>();
        assert!(result.is_err());
    }

    #[test]
    fn test_request_serde_roundtrip() {
        let req = ActionRequest::new("videos", "probe")
            .with_id("vid_123")
            .with_options(json!({"path": "/test.mp4"}));

        let json = serde_json::to_string(&req).unwrap();
        let parsed: ActionRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.group, "videos");
        assert_eq!(parsed.action, "probe");
        assert_eq!(parsed.id, "vid_123");
    }

    #[test]
    fn test_request_serde_skip_none_fields() {
        let req = ActionRequest::new("nodes", "health");
        let json = serde_json::to_string(&req).unwrap();
        // Optional None fields should be skipped
        assert!(!json.contains("source"));
        assert!(!json.contains("sessionId"));
        assert!(!json.contains("streamId"));
        assert!(!json.contains("body"));
    }

    // ---- ActionResponse ----

    #[test]
    fn test_response_ok() {
        let resp = ActionResponse::ok("req_1", json!({"status": "ready"}));
        assert!(resp.is_ok());
        assert!(!resp.is_error());
        assert_eq!(resp.id, "req_1");
        assert!(resp.data.is_some());
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_response_error() {
        let resp = ActionResponse::error("req_2", ErrorCode::ResourceNotFound, "not found");
        assert!(resp.is_error());
        assert!(!resp.is_ok());
        assert!(resp.error.is_some());
        assert!(resp.data.is_none());
    }

    #[test]
    fn test_response_pending() {
        let resp = ActionResponse::pending("req_3", "task_abc");
        assert_eq!(resp.status, ResponseStatus::Pending);
        assert_eq!(resp.data.as_ref().unwrap()["taskId"], "task_abc");
    }

    #[test]
    fn test_response_progress() {
        let resp = ActionResponse::progress("req_4", json!({"percent": 50}));
        assert_eq!(resp.status, ResponseStatus::Progress);
        assert!(resp.progress.is_some());
    }
}
