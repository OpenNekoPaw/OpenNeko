//! Bridge module - Thin NAPI bridge functions that delegate to EngineApi
//!
//! This module provides standalone NAPI functions that construct ActionRequest
//! and dispatch through the EngineApi singleton. These functions serve as the
//! migration path from the legacy MediaProcessor API to the unified MVC architecture.
//!
//! ## Phase A (current)
//! Stateless functions: probe, extract_subtitles, extract_frame, gpu_info,
//! audio_info, generate_waveform, get_keyframes
//!
//! ## Phase B (future)
//! Stateful Session class migration
//!
//! ## Phase C (future)
//! GPU processing functions migration

use napi_derive::napi;
use neko_engine_types::ActionRequest;
use serde_json::json;

/// Get or initialize the global engine instance for bridge functions
async fn get_bridge_engine() -> napi::Result<std::sync::Arc<neko_host_api::EngineApi>> {
    crate::engine::init_tracing();
    crate::engine::get_engine().await
}

#[cfg(test)]
fn bridge_engine_cell() -> &'static tokio::sync::OnceCell<std::sync::Arc<neko_host_api::EngineApi>>
{
    crate::engine::shared_engine_cell()
}

/// Helper: dispatch an ActionRequest and return JSON string
async fn dispatch_to_json(request: ActionRequest) -> napi::Result<String> {
    let engine = get_bridge_engine().await?;
    let response = engine.dispatch(request).await;
    serde_json::to_string(&response)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {}", e)))
}

// ============================================================================
// Phase A: Stateless bridge functions
// ============================================================================

/// Probe media file metadata via the unified API
///
/// Maps to: videos:probe
///
/// Returns JSON ActionResponse with media metadata (streams, duration, format, etc.)
#[napi]
pub async fn bridge_probe_media(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "probe").with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Extract all subtitle tracks from a media file via the unified API
///
/// Maps to: videos:extract (type=subtitles)
///
/// Returns JSON ActionResponse with extracted subtitle tracks
#[napi]
pub async fn bridge_extract_subtitles(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "extract").with_options(json!({
        "source": path,
        "type": "subtitles"
    }));

    dispatch_to_json(request).await
}

/// Extract a single frame from video via the unified API
///
/// Maps to: videos:capture
///
/// Returns JSON ActionResponse with base64-encoded frame data
#[napi]
pub async fn bridge_extract_frame(
    path: String,
    time: f64,
    quality: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
) -> napi::Result<String> {
    let mut opts = json!({
        "source": path,
        "time": time,
        "quality": quality.unwrap_or(85),
        "format": "jpeg",
    });

    if let Some(w) = width {
        opts["width"] = json!(w);
    }
    if let Some(h) = height {
        opts["height"] = json!(h);
    }

    let request = ActionRequest::new("videos", "capture").with_options(opts);

    dispatch_to_json(request).await
}

/// Get GPU information via the unified API
///
/// Maps to: nodes:gpu
///
/// Returns JSON ActionResponse with GPU device info
#[napi]
pub async fn bridge_gpu_info() -> napi::Result<String> {
    let request = ActionRequest::new("nodes", "gpu");
    dispatch_to_json(request).await
}

/// Get audio file information via the unified API
///
/// Maps to: audios:probe
///
/// Returns JSON ActionResponse with audio metadata (codec, sample rate, channels, etc.)
#[napi]
pub async fn bridge_audio_info(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("audios", "probe").with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Generate waveform data for a media file via the unified API
///
/// Maps to: videos:waveform
///
/// Returns JSON ActionResponse with waveform sample data
#[napi]
pub async fn bridge_generate_waveform(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "waveform").with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Get keyframe timestamps from a video file via the unified API
///
/// Maps to: videos:keyframes
///
/// Returns JSON ActionResponse with keyframe timestamp list
#[napi]
pub async fn bridge_get_keyframes(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "keyframes").with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

// ============================================================================
// Phase B: Additional bridge functions
// ============================================================================

// ============================================================================
// Phase C: Effects bridge functions
// ============================================================================

/// List available shader effects via the unified API
///
/// Maps to: effects:list
///
/// Returns JSON ActionResponse with available preset and custom shaders
#[napi]
pub async fn bridge_effects_list() -> napi::Result<String> {
    let request = ActionRequest::new("effects", "list");
    dispatch_to_json(request).await
}

/// Get shader info via the unified API
///
/// Maps to: effects:info
///
/// Returns JSON ActionResponse with shader parameter definitions
#[napi]
pub async fn bridge_effects_info(shader_id: String) -> napi::Result<String> {
    let request =
        ActionRequest::new("effects", "info").with_options(json!({ "shaderId": shader_id }));
    dispatch_to_json(request).await
}

/// Apply a shader effect to RGBA frame data via the unified API
///
/// Maps to: effects:apply
///
/// Returns JSON ActionResponse with processed base64-encoded RGBA data
#[napi]
pub async fn bridge_effects_apply(
    data_base64: String,
    width: u32,
    height: u32,
    shader_id: String,
    params_json: Option<String>,
) -> napi::Result<String> {
    let params: serde_json::Value = params_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!({}));

    let request = ActionRequest::new("effects", "apply").with_options(json!({
        "data": data_base64,
        "width": width,
        "height": height,
        "shaderId": shader_id,
        "params": params,
    }));

    dispatch_to_json(request).await
}

/// Register a custom WGSL shader via the unified API
///
/// Maps to: effects:register
///
/// Returns JSON ActionResponse confirming registration
#[napi]
pub async fn bridge_effects_register(
    id: String,
    code: String,
    params_json: Option<String>,
) -> napi::Result<String> {
    let params: serde_json::Value = params_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(json!([]));

    let request = ActionRequest::new("effects", "register").with_options(json!({
        "shaderId": id,
        "code": code,
        "params": params,
    }));

    dispatch_to_json(request).await
}

// ============================================================================
// Phase B: Additional bridge functions
// ============================================================================

/// Encode RGBA pixel data to JPEG via the unified API
///
/// Maps to: images:encode
///
/// Returns JSON ActionResponse with base64-encoded JPEG data
#[napi]
pub async fn bridge_encode_jpeg(
    rgba_data_base64: String,
    width: u32,
    height: u32,
    quality: Option<u32>,
) -> napi::Result<String> {
    let request = ActionRequest::new("images", "encode").with_options(json!({
        "data": rgba_data_base64,
        "width": width,
        "height": height,
        "quality": quality.unwrap_or(85),
    }));

    dispatch_to_json(request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_and_native_engine_share_the_same_singleton_cell() {
        let native_ptr = crate::engine::shared_engine_cell() as *const _;
        let bridge_ptr = bridge_engine_cell() as *const _;

        assert_eq!(native_ptr, bridge_ptr);
    }
}
