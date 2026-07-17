//! PreviewsController - handles previews:* JSON actions.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::preview::{
    PreviewFileRegistry, PreviewVariantRequest, RegisterPreviewAssetRequest, RegisterRequest,
    RegisterResponse, UpdatePreviewAssetMetadataRequest,
};
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

pub struct PreviewsController {
    registry: Arc<PreviewFileRegistry>,
}

impl PreviewsController {
    pub fn new(registry: Arc<PreviewFileRegistry>) -> Self {
        Self { registry }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TokenOptions {
    token: Option<String>,
    file_path: Option<String>,
    source: Option<String>,
}

impl Controller for PreviewsController {
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
            "register-token" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let file_path = opts.file_path.or(opts.source).ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "filePath or source required for previews:register-token".to_string(),
                    )
                })?;
                let token = self.registry.register(PathBuf::from(file_path))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(RegisterResponse { token })?,
                ))
            }
            "unregister-token" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let token = resource_id
                    .map(ToOwned::to_owned)
                    .or(opts.token)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest(
                            "token required for previews:unregister-token".to_string(),
                        )
                    })?;
                self.registry.unregister_token(&token)?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "released": true }),
                ))
            }
            "register-asset" => {
                let request: RegisterPreviewAssetRequest = parse_payload(options, body)?;
                let manifest = self.registry.register_asset(request)?;
                Ok(ActionResponse::ok("", serde_json::to_value(manifest)?))
            }
            "request-variant" | "generate" => {
                let asset_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(format!("asset id required for previews:{action}"))
                })?;
                let request: PreviewVariantRequest = parse_payload(options, body)?;
                let variant = self.registry.request_variant(asset_id, request)?;
                Ok(ActionResponse::ok("", serde_json::to_value(variant)?))
            }
            "update-metadata" => {
                let asset_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "asset id required for previews:update-metadata".to_string(),
                    )
                })?;
                let request: UpdatePreviewAssetMetadataRequest = parse_payload(options, body)?;
                let manifest = self.registry.update_asset_metadata(asset_id, request)?;
                Ok(ActionResponse::ok("", serde_json::to_value(manifest)?))
            }
            "unregister" => {
                let opts: TokenOptions = parse_payload(options, body)?;
                let asset_id_or_token = resource_id
                    .map(ToOwned::to_owned)
                    .or(opts.token)
                    .ok_or_else(|| {
                        ApiError::InvalidRequest(
                            "asset id or token required for previews:unregister".to_string(),
                        )
                    })?;
                self.registry.unregister_asset(&asset_id_or_token)?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "released": true }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::PREVIEWS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::PREVIEWS
    }
}

fn parse_payload<T: DeserializeOwned>(options: Value, body: Option<Value>) -> ApiResult<T> {
    let value = match body {
        Some(Value::Null) | None => options,
        Some(value) => value,
    };
    serde_json::from_value(value).map_err(|error| ApiError::InvalidRequest(error.to_string()))
}

impl From<RegisterRequest> for TokenOptions {
    fn from(request: RegisterRequest) -> Self {
        Self {
            token: None,
            file_path: Some(request.file_path),
            source: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use tempfile::tempdir;

    #[tokio::test]
    async fn register_asset_and_variant_actions_share_registry_state() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.jpg");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(4, 2, Rgb([20, 40, 60]));
        image.save(&image_path).expect("save image");
        let registry = Arc::new(PreviewFileRegistry::with_allowed_roots(vec![dir
            .path()
            .to_path_buf()]));
        let controller = PreviewsController::new(registry.clone());

        let response = controller
            .handle(
                "register-asset",
                None,
                serde_json::json!({
                    "source": image_path.to_string_lossy(),
                    "kind": "image"
                }),
                None,
            )
            .await
            .expect("register asset");
        assert!(response.is_ok());
        let manifest = response.data.expect("manifest");
        let asset_id = manifest["assetId"].as_str().expect("asset id");

        let response = controller
            .handle(
                "request-variant",
                Some(asset_id),
                serde_json::json!({
                    "role": "thumbnail",
                    "width": 128,
                    "height": 64,
                    "format": "png"
                }),
                None,
            )
            .await
            .expect("request variant");
        assert!(response.is_ok());
        let token = response.data.expect("variant")["token"]
            .as_str()
            .expect("variant token")
            .to_string();
        assert!(registry
            .lookup_token(&token)
            .expect("lookup token")
            .is_some());
    }

    #[tokio::test]
    async fn register_token_action_returns_token() {
        let dir = tempdir().expect("tempdir");
        let file_path = dir.path().join("preview.mp4");
        std::fs::write(&file_path, b"media").expect("write media");
        let registry = Arc::new(PreviewFileRegistry::with_allowed_roots(vec![dir
            .path()
            .to_path_buf()]));
        let controller = PreviewsController::new(registry);

        let response = controller
            .handle(
                "register-token",
                None,
                serde_json::json!({ "filePath": file_path.to_string_lossy() }),
                None,
            )
            .await
            .expect("register token");

        assert!(response.is_ok());
        assert!(response.data.unwrap()["token"].is_string());
    }
}
