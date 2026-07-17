//! Effects service trait

use crate::error::Result;
use neko_engine_gpu::{ParamDef, PresetShaderMeta};

/// Effects service interface
///
/// Handles custom shader effect operations.
#[allow(async_fn_in_trait)]
pub trait IEffectsService: Send + Sync {
    /// List all available shader presets
    fn list_presets(&self) -> Vec<PresetShaderMeta>;

    /// Get parameter definitions for a specific shader
    fn get_shader_info(&self, shader_id: &str) -> Option<PresetShaderMeta>;

    /// Apply a shader effect to RGBA frame data
    fn apply_effect(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<Vec<u8>>;

    /// Register a custom WGSL shader at runtime
    fn register_shader(&self, id: &str, wgsl_source: &str, param_defs: Vec<ParamDef>)
        -> Result<()>;
}
