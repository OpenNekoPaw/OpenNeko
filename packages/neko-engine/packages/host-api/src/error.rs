//! API error types

use neko_engine_types::ErrorCode;
use thiserror::Error;

/// API result type
pub type ApiResult<T> = Result<T, ApiError>;

/// API error type
#[derive(Error, Debug)]
pub enum ApiError {
    /// Resource not found
    #[error("Resource not found: {0}")]
    NotFound(String),

    /// Invalid request
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    /// Unknown action
    #[error("Unknown action: {group}:{action}")]
    UnknownAction { group: String, action: String },

    /// Service error
    #[error("Service error: {0}")]
    ServiceError(String),

    /// Stream error
    #[error("Stream error: {0}")]
    StreamError(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    SerializationError(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}

impl ApiError {
    /// Convert to error code
    pub fn code(&self) -> ErrorCode {
        match self {
            ApiError::NotFound(_) => ErrorCode::ResourceNotFound,
            ApiError::InvalidRequest(_) => ErrorCode::InvalidParameter,
            ApiError::UnknownAction { .. } => ErrorCode::InvalidParameter,
            ApiError::ServiceError(_) => ErrorCode::InternalError,
            ApiError::StreamError(_) => ErrorCode::StreamNotFound,
            ApiError::SerializationError(_) => ErrorCode::ValidationError,
            ApiError::Internal(_) => ErrorCode::InternalError,
        }
    }

    /// Convert to API error response
    pub fn to_response(&self) -> neko_engine_types::ApiError {
        neko_engine_types::ApiError {
            code: self.code(),
            message: self.to_string(),
            details: None,
        }
    }
}

impl From<neko_engine_kernel::error::Error> for ApiError {
    fn from(e: neko_engine_kernel::error::Error) -> Self {
        match e {
            neko_engine_kernel::error::Error::UnsupportedCapability(message)
            | neko_engine_kernel::error::Error::UnsupportedOutput(message)
            | neko_engine_kernel::error::Error::UnknownEffect(message) => {
                ApiError::InvalidRequest(message)
            }
            neko_engine_kernel::error::Error::AlreadyCompleted(message) => {
                ApiError::InvalidRequest(message)
            }
            other => ApiError::ServiceError(other.to_string()),
        }
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        ApiError::SerializationError(e.to_string())
    }
}
