//! GPU effect registry contract.
//!
//! `GpuEffect` implementations operate on existing GPU textures and must not
//! perform CPU readback/upload fallback inside the normal effect chain.

use crate::error::GpuResult as Result;

/// Parameter view passed to a registered GPU effect.
#[derive(Clone, Copy)]
pub struct GpuEffectParams<'a> {
    values: &'a serde_json::Map<String, serde_json::Value>,
}

impl<'a> GpuEffectParams<'a> {
    pub fn new(values: &'a serde_json::Map<String, serde_json::Value>) -> Self {
        Self { values }
    }

    pub fn as_map(&self) -> &'a serde_json::Map<String, serde_json::Value> {
        self.values
    }

    pub fn get_f32(&self, key: &str, default: f32) -> f32 {
        self.values
            .get(key)
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(default)
    }

    pub fn get_bool(&self, key: &str, default: bool) -> bool {
        self.values
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(default)
    }

    pub fn get_str(&self, key: &str) -> Option<&'a str> {
        self.values.get(key).and_then(|v| v.as_str())
    }
}

/// Texture-to-texture inputs for one GPU effect invocation.
pub struct GpuEffectContext<'a> {
    pub input: &'a wgpu::Texture,
    pub output: &'a wgpu::Texture,
    pub params: GpuEffectParams<'a>,
}

/// Two-input texture context for registered GPU transition effects.
pub struct GpuTransitionContext<'a> {
    pub from: &'a wgpu::Texture,
    pub to: &'a wgpu::Texture,
    pub output: &'a wgpu::Texture,
    pub params: GpuEffectParams<'a>,
    pub progress: f32,
}

/// Registered GPU effect contract.
pub trait GpuEffect {
    /// Stable effect id used by timeline `ElementEffect::effect_type`.
    fn id(&self) -> &'static str;

    /// Apply this effect without leaving the GPU texture path.
    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()>;

    /// Reserved cost signal for later GPU budget optimization.
    fn estimated_cost(&self) -> u32 {
        0
    }

    /// Reserved in-place capability signal for later texture reuse optimization.
    fn supports_in_place(&self) -> bool {
        false
    }
}

/// Registered two-input GPU transition contract.
pub trait GpuTransitionEffect {
    /// Stable transition id used by transition metadata.
    fn id(&self) -> &'static str;

    /// Apply this transition without leaving the GPU texture path.
    fn apply_transition_tex(&mut self, ctx: GpuTransitionContext<'_>) -> Result<()>;

    /// Clamp caller-provided progress into the shader-supported range.
    fn normalize_progress(&self, progress: f32) -> f32 {
        progress.clamp(0.0, 1.0)
    }

    /// Reserved cost signal for later GPU budget optimization.
    fn estimated_cost(&self) -> u32 {
        0
    }
}
