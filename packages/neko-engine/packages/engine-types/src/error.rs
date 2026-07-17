//! Error types and codes

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Unified error codes for API responses
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Resource errors (1xx)
    ResourceNotFound,
    ResourceAlreadyExists,
    InvalidResourceId,
    InvalidResourceType,

    // Stream errors (2xx)
    StreamNotFound,
    StreamAlreadyExists,
    InvalidStreamState,
    StreamTimeout,

    // Media errors (3xx)
    DecodeError,
    EncodeError,
    UnsupportedCodec,
    UnsupportedFormat,
    InvalidMediaFile,
    MediaNotReady,

    // Task errors (4xx)
    TaskNotFound,
    TaskAlreadyCancelled,
    TaskAlreadyCompleted,
    InvalidTaskState,

    // GPU errors (5xx)
    GpuNotAvailable,
    GpuContextError,
    ShaderCompilationError,
    TextureError,

    // IO errors (6xx)
    FileNotFound,
    PermissionDenied,
    IoError,

    // Validation errors (7xx)
    InvalidParameter,
    MissingParameter,
    ValidationError,

    // Capacity errors (8xx)
    ServiceOverloaded,

    // Internal errors (9xx)
    InternalError,
    NotImplemented,
    Unknown,
}

impl ErrorCode {
    /// Get HTTP status code equivalent
    pub fn http_status(&self) -> u16 {
        match self {
            Self::ResourceNotFound
            | Self::StreamNotFound
            | Self::TaskNotFound
            | Self::FileNotFound => 404,

            Self::ResourceAlreadyExists | Self::StreamAlreadyExists => 409,

            Self::InvalidResourceId
            | Self::InvalidResourceType
            | Self::InvalidStreamState
            | Self::InvalidTaskState
            | Self::InvalidParameter
            | Self::MissingParameter
            | Self::ValidationError => 400,

            Self::PermissionDenied => 403,

            Self::UnsupportedCodec | Self::UnsupportedFormat | Self::NotImplemented => 501,

            Self::GpuNotAvailable
            | Self::GpuContextError
            | Self::ShaderCompilationError
            | Self::TextureError
            | Self::DecodeError
            | Self::EncodeError
            | Self::InvalidMediaFile
            | Self::MediaNotReady
            | Self::IoError
            | Self::InternalError
            | Self::Unknown => 500,

            Self::StreamTimeout => 504,

            Self::ServiceOverloaded => 503,

            Self::TaskAlreadyCancelled | Self::TaskAlreadyCompleted => 409,
        }
    }
}

/// API error response
#[derive(Debug, Clone, Serialize, Deserialize, Error)]
#[error("{message}")]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ApiError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }

    // Convenience constructors
    pub fn resource_not_found(id: &str) -> Self {
        Self::new(
            ErrorCode::ResourceNotFound,
            format!("Resource not found: {}", id),
        )
    }

    pub fn stream_not_found(id: &str) -> Self {
        Self::new(
            ErrorCode::StreamNotFound,
            format!("Stream not found: {}", id),
        )
    }

    pub fn task_not_found(id: &str) -> Self {
        Self::new(ErrorCode::TaskNotFound, format!("Task not found: {}", id))
    }

    pub fn invalid_parameter(param: &str, reason: &str) -> Self {
        Self::new(
            ErrorCode::InvalidParameter,
            format!("Invalid parameter '{}': {}", param, reason),
        )
    }

    pub fn missing_parameter(param: &str) -> Self {
        Self::new(
            ErrorCode::MissingParameter,
            format!("Missing required parameter: {}", param),
        )
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InternalError, message)
    }

    pub fn decode_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DecodeError, message)
    }

    pub fn encode_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::EncodeError, message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_http_status() {
        assert_eq!(ErrorCode::ResourceNotFound.http_status(), 404);
        assert_eq!(ErrorCode::StreamNotFound.http_status(), 404);
        assert_eq!(ErrorCode::TaskNotFound.http_status(), 404);
        assert_eq!(ErrorCode::InvalidParameter.http_status(), 400);
        assert_eq!(ErrorCode::MissingParameter.http_status(), 400);
        assert_eq!(ErrorCode::ValidationError.http_status(), 400);
        assert_eq!(ErrorCode::InternalError.http_status(), 500);
        assert_eq!(ErrorCode::GpuNotAvailable.http_status(), 500);
        assert_eq!(ErrorCode::GpuContextError.http_status(), 500);
    }

    #[test]
    fn test_api_error_new() {
        let err = ApiError::new(ErrorCode::DecodeError, "bad frame");
        assert_eq!(err.code, ErrorCode::DecodeError);
        assert_eq!(err.message, "bad frame");
        assert!(err.details.is_none());
    }

    #[test]
    fn test_api_error_with_details() {
        let err = ApiError::new(ErrorCode::InternalError, "oops")
            .with_details(serde_json::json!({"file": "test.mp4"}));
        assert!(err.details.is_some());
        assert_eq!(err.details.unwrap()["file"], "test.mp4");
    }

    #[test]
    fn test_api_error_convenience_constructors() {
        let err = ApiError::resource_not_found("vid_123");
        assert_eq!(err.code, ErrorCode::ResourceNotFound);
        assert!(err.message.contains("vid_123"));

        let err = ApiError::stream_not_found("stream_1");
        assert_eq!(err.code, ErrorCode::StreamNotFound);

        let err = ApiError::task_not_found("task_1");
        assert_eq!(err.code, ErrorCode::TaskNotFound);

        let err = ApiError::invalid_parameter("fps", "must be positive");
        assert_eq!(err.code, ErrorCode::InvalidParameter);
        assert!(err.message.contains("fps"));
        assert!(err.message.contains("must be positive"));

        let err = ApiError::missing_parameter("path");
        assert_eq!(err.code, ErrorCode::MissingParameter);
        assert!(err.message.contains("path"));

        let err = ApiError::internal("something broke");
        assert_eq!(err.code, ErrorCode::InternalError);

        let err = ApiError::decode_error("corrupt frame");
        assert_eq!(err.code, ErrorCode::DecodeError);

        let err = ApiError::encode_error("encoder failed");
        assert_eq!(err.code, ErrorCode::EncodeError);
    }

    #[test]
    fn test_api_error_display() {
        let err = ApiError::new(ErrorCode::DecodeError, "bad frame");
        assert_eq!(format!("{}", err), "bad frame");
    }

    #[test]
    fn test_api_error_serde_roundtrip() {
        let err = ApiError::new(ErrorCode::ResourceNotFound, "not found")
            .with_details(serde_json::json!({"id": "abc"}));
        let json = serde_json::to_string(&err).unwrap();
        let parsed: ApiError = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, ErrorCode::ResourceNotFound);
        assert_eq!(parsed.message, "not found");
        assert!(parsed.details.is_some());
    }
}
