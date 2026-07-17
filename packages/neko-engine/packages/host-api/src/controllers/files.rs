//! FilesController - handles files:* metadata and token actions.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use neko_engine_types::registry;
use neko_engine_types::{ActionResponse, RegisterFileRequest};
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

pub struct FilesController {
    registry: Arc<FileAccessRegistry>,
}

impl FilesController {
    pub fn new(registry: Arc<FileAccessRegistry>) -> Self {
        Self { registry }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TokenOptions {
    token: Option<String>,
    path: Option<String>,
    source: Option<String>,
    file_path: Option<String>,
}

impl Controller for FilesController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        match action {
            "register" => {
                let request: RegisterFileRequest = parse_payload(options, body)?;
                let path = request.local_path().ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "path, filePath, or source required for files:register".to_string(),
                    )
                })?;
                let registered = self
                    .registry
                    .register(PathBuf::from(path), request.purpose())?;
                Ok(ActionResponse::ok("", serde_json::to_value(registered)?))
            }
            "unregister" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let token = resource_id
                    .map(ToOwned::to_owned)
                    .or(opts.token)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest("token required for files:unregister".to_string())
                    })?;
                self.registry.unregister_token(&token)?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "released": true }),
                ))
            }
            "stat" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let token = resource_id
                    .map(ToOwned::to_owned)
                    .or(opts.token)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest("token required for files:stat".to_string())
                    })?;
                let registered = self
                    .registry
                    .stat_token(&token)?
                    .ok_or_else(|| ApiError::NotFound(format!("File token not found: {token}")))?;
                Ok(ActionResponse::ok("", serde_json::to_value(registered)?))
            }
            "resolve" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let path = opts
                    .path
                    .or(opts.file_path)
                    .or(opts.source)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest(
                            "path, filePath, or source required for files:resolve".to_string(),
                        )
                    })?;
                let resolved = self.registry.resolve_path(PathBuf::from(path))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "path": resolved.to_string_lossy() }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::FILES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::FILES
    }
}

fn parse_payload<T: serde::de::DeserializeOwned>(
    options: Value,
    body: Option<Value>,
) -> ApiResult<T> {
    let value = match body {
        Some(Value::Null) | None => options,
        Some(value) => value,
    };
    serde_json::from_value(value).map_err(|error| ApiError::InvalidRequest(error.to_string()))
}
