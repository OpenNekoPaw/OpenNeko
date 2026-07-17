//! ColorCorrectionController - handles color-correction:* actions
//!
//! Manages 3D LUT upload/removal. Uploaded LUTs are stored in the process-level
//! `LutRegistry` singleton and consumed by `EffectDispatcher` at render time.

use crate::controllers::utils::base64_decode;
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::gpu::Lut3DData;
use neko_engine_kernel::contracts::gpu::LutRegistry;
use neko_engine_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

/// Controller for 3D LUT color correction actions
pub struct ColorCorrectionController;

impl Default for ColorCorrectionController {
    fn default() -> Self {
        Self::new()
    }
}

impl ColorCorrectionController {
    pub fn new() -> Self {
        Self
    }
}

// =============================================================================
// Options structs
// =============================================================================

/// Options for color-correction:upload_lut
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UploadLutOptions {
    /// Display name for the LUT (e.g., file name without extension)
    name: Option<String>,
}

/// Body for color-correction:upload_lut
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UploadLutBody {
    /// Base64-encoded UTF-8 `.cube` file content
    data: Option<String>,
}

/// Options for color-correction:remove_lut
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RemoveLutOptions {
    lut_id: Option<String>,
}

// =============================================================================
// Controller impl
// =============================================================================

impl Controller for ColorCorrectionController {
    fn group(&self) -> &'static str {
        "color-correction"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["upload_lut", "remove_lut", "list_luts"]
    }

    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "upload_lut" => {
                let opts: UploadLutOptions = serde_json::from_value(options).unwrap_or_default();
                let body_val = body.unwrap_or(Value::Null);
                let body_opts: UploadLutBody = serde_json::from_value(body_val).unwrap_or_default();

                let data_b64 = body_opts.data.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "color-correction:upload_lut requires body.data (base64 .cube content)"
                            .to_string(),
                    )
                })?;

                // Decode base64 → UTF-8 .cube text
                let raw_bytes = base64_decode(&data_b64)
                    .map_err(|e| ApiError::InvalidRequest(format!("base64 decode failed: {e}")))?;
                let cube_text = String::from_utf8(raw_bytes).map_err(|e| {
                    ApiError::InvalidRequest(format!(".cube file is not valid UTF-8: {e}"))
                })?;

                // Parse .cube
                let lut = Lut3DData::from_cube(&cube_text)
                    .map_err(|e| ApiError::InvalidRequest(format!(".cube parse error: {e}")))?;

                // Generate ID and store in global registry
                let lut_id = Uuid::new_v4().to_string();
                let name = opts.name.unwrap_or_else(|| lut_id.clone());
                LutRegistry::global().insert(lut_id.clone(), lut);

                tracing::info!("Uploaded 3D LUT '{}' (id={})", name, lut_id);

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({
                        "lutId": lut_id,
                        "name": name,
                    }),
                ))
            }

            "remove_lut" => {
                let opts: RemoveLutOptions = serde_json::from_value(options).unwrap_or_default();
                let lut_id = opts.lut_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "color-correction:remove_lut requires options.lutId".to_string(),
                    )
                })?;

                let removed = LutRegistry::global().remove(&lut_id);
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "removed": removed }),
                ))
            }

            "list_luts" => {
                let ids = LutRegistry::global().list_ids();
                Ok(ActionResponse::ok("", serde_json::json!({ "lutIds": ids })))
            }

            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }
}
