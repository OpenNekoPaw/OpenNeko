//! EffectsController - handles effects:* actions

use crate::controllers::utils::{base64_decode, base64_encode};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::gpu::ParamDef;
use neko_engine_kernel::contracts::services::{EffectRegistry, IEffectsService};
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for custom shader effect actions
pub struct EffectsController {
    effects_service: Option<Arc<dyn IEffectsService>>,
    effect_registry: Arc<EffectRegistry>,
}

impl EffectsController {
    /// Create a new EffectsController
    pub fn new(
        effects_service: Option<Arc<dyn IEffectsService>>,
        effect_registry: Arc<EffectRegistry>,
    ) -> Self {
        Self {
            effects_service,
            effect_registry,
        }
    }

    fn require_service(&self) -> ApiResult<&dyn IEffectsService> {
        self.effects_service
            .as_ref()
            .map(|s| s.as_ref())
            .ok_or_else(|| {
                ApiError::ServiceError("Effects service unavailable (no GPU)".to_string())
            })
    }
}

/// Options for effects:apply
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ApplyOptions {
    /// Base64-encoded RGBA frame data
    data: Option<String>,
    /// Frame width
    width: Option<u32>,
    /// Frame height
    height: Option<u32>,
    /// Shader ID (preset or custom)
    shader_id: Option<String>,
    /// Shader-specific parameters
    #[serde(default)]
    params: Value,
}

/// Options for effects:info
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct InfoOptions {
    shader_id: Option<String>,
}

/// Options for effects:register
#[derive(Debug, Deserialize, Default)]
struct RegisterOptions {
    /// Unique shader ID
    id: Option<String>,
    /// WGSL shader source code
    code: Option<String>,
    /// Parameter definitions
    #[serde(default)]
    params: Vec<ParamDefInput>,
}

#[derive(Debug, Deserialize, Default)]
struct ParamDefInput {
    name: String,
    #[serde(default)]
    default: f64,
    #[serde(default)]
    min: f64,
    #[serde(default = "default_max")]
    max: f64,
}

fn default_max() -> f64 {
    1.0
}

impl Controller for EffectsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list" => {
                let service = self.require_service()?;
                let presets = service.list_presets();
                let response = serde_json::to_value(&presets)?;
                Ok(ActionResponse::ok("", response))
            }
            "list-capabilities" => {
                let response = serde_json::to_value(self.effect_registry.list_capabilities())?;
                Ok(ActionResponse::ok("", response))
            }
            "info" => {
                let opts: InfoOptions = serde_json::from_value(options).unwrap_or_default();
                let shader_id = opts.shader_id.ok_or_else(|| {
                    ApiError::InvalidRequest("shader_id required for effects:info".to_string())
                })?;

                let service = self.require_service()?;
                let info = service.get_shader_info(&shader_id).ok_or_else(|| {
                    ApiError::NotFound(format!("Shader not found: {}", shader_id))
                })?;

                let response = serde_json::to_value(&info)?;
                Ok(ActionResponse::ok("", response))
            }
            "apply" => {
                let opts: ApplyOptions = serde_json::from_value(options).unwrap_or_default();

                let data_b64 = opts.data.ok_or_else(|| {
                    ApiError::InvalidRequest("data required for effects:apply".to_string())
                })?;
                let width = opts.width.ok_or_else(|| {
                    ApiError::InvalidRequest("width required for effects:apply".to_string())
                })?;
                let height = opts.height.ok_or_else(|| {
                    ApiError::InvalidRequest("height required for effects:apply".to_string())
                })?;
                let shader_id = opts.shader_id.ok_or_else(|| {
                    ApiError::InvalidRequest("shader_id required for effects:apply".to_string())
                })?;

                let rgba_data = base64_decode(&data_b64)
                    .map_err(|e| ApiError::InvalidRequest(format!("Invalid base64 data: {}", e)))?;

                let service = self.require_service()?;
                let result =
                    service.apply_effect(&rgba_data, width, height, &shader_id, &opts.params)?;

                let response = serde_json::json!({
                    "width": width,
                    "height": height,
                    "shaderId": shader_id,
                    "size": result.len(),
                    "data": base64_encode(&result),
                });

                Ok(ActionResponse::ok("", response))
            }
            "register" => {
                let opts: RegisterOptions = serde_json::from_value(options).unwrap_or_default();

                let id = opts.id.ok_or_else(|| {
                    ApiError::InvalidRequest("id required for effects:register".to_string())
                })?;
                let code = opts.code.ok_or_else(|| {
                    ApiError::InvalidRequest("code required for effects:register".to_string())
                })?;

                let param_defs: Vec<ParamDef> = opts
                    .params
                    .into_iter()
                    .map(|p| ParamDef {
                        name: p.name,
                        default: p.default as f32,
                        min: p.min as f32,
                        max: p.max as f32,
                    })
                    .collect();

                let service = self.require_service()?;
                service
                    .register_shader(&id, &code, param_defs)
                    .map_err(|e| {
                        ApiError::ServiceError(format!("Shader registration failed: {}", e))
                    })?;

                let response = serde_json::json!({
                    "id": id,
                    "registered": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "effects".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::EFFECTS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::EFFECTS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> EffectsController {
        EffectsController::new(None, Arc::new(EffectRegistry::with_builtins()))
    }

    #[tokio::test]
    async fn test_effects_controller_list_no_gpu() {
        let controller = create_test_controller();
        let result = controller.handle("list", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_effects_controller_unknown_action() {
        let controller = create_test_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_effects_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"apply"));
        assert!(actions.contains(&"list"));
        assert!(actions.contains(&"list-capabilities"));
        assert!(actions.contains(&"info"));
        assert!(actions.contains(&"register"));
    }

    #[tokio::test]
    async fn test_list_capabilities_no_gpu_returns_builtin_metadata() {
        let controller = create_test_controller();
        let response = controller
            .handle("list-capabilities", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
        let data = response.data.unwrap();
        let caps = data.as_array().unwrap();
        assert!(caps.iter().any(|cap| cap["id"] == "gaussian-blur"));
        assert!(caps.iter().any(|cap| cap["id"] == "gain"));
    }

    #[test]
    fn test_apply_options_camel_case_deserialization() {
        let json = serde_json::json!({
            "data": "AQID",
            "width": 100,
            "height": 200,
            "shaderId": "pixelate",
            "params": {"pixel_size": 8.0}
        });

        let opts: ApplyOptions = serde_json::from_value(json).unwrap();
        assert_eq!(opts.shader_id, Some("pixelate".to_string()));
        assert_eq!(opts.width, Some(100));
        assert_eq!(opts.height, Some(200));
        assert_eq!(opts.data, Some("AQID".to_string()));
    }

    #[test]
    fn test_info_options_camel_case_deserialization() {
        let json = serde_json::json!({ "shaderId": "edge_detect" });

        let opts: InfoOptions = serde_json::from_value(json).unwrap();
        assert_eq!(opts.shader_id, Some("edge_detect".to_string()));
    }

    #[test]
    fn test_register_options_deserialization() {
        let json = serde_json::json!({
            "id": "my_shader",
            "code": "@compute fn main() {}",
            "params": [{"name": "amount", "default": 0.5, "min": 0.0, "max": 1.0}]
        });

        let opts: RegisterOptions = serde_json::from_value(json).unwrap();
        assert_eq!(opts.id, Some("my_shader".to_string()));
        assert_eq!(opts.code, Some("@compute fn main() {}".to_string()));
        assert_eq!(opts.params.len(), 1);
        assert_eq!(opts.params[0].name, "amount");
    }

    #[tokio::test]
    async fn test_apply_missing_shader_id() {
        let controller = create_test_controller();
        let json = serde_json::json!({
            "data": "AQID",
            "width": 100,
            "height": 200
        });
        let result = controller.handle("apply", None, json, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_info_missing_shader_id() {
        let controller = create_test_controller();
        let result = controller
            .handle("info", None, serde_json::json!({}), None)
            .await;
        assert!(result.is_err());
    }
}
