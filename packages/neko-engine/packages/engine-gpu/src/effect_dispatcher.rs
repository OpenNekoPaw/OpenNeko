//! GPU texture-to-texture effect dispatcher.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::{
    BlurParams, BlurType, ChromaKeyParams, ChromaticAberrationParams, ColorCorrectionTexParams,
    CustomShaderProcessor, FilmGrainParams, GlowParams, GpuBlurProcessor, GpuContext, GpuEffect,
    GpuEffectContext, GpuEffectParams, GpuStyleProcessor, LumaKeyParams, SharpenParams,
    VignetteParams,
};

/// Dispatches `ElementEffect` instances to GPU processors via texture-to-texture pipeline.
///
/// All effects operate entirely on GPU textures; no CPU readback fallback occurs
/// inside the normal effect chain.
pub struct EffectDispatcher {
    ctx: Arc<GpuContext>,
    registry: HashMap<String, Box<dyn GpuEffect>>,
}

impl EffectDispatcher {
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let mut dispatcher = Self {
            ctx,
            registry: HashMap::new(),
        };
        dispatcher.register_builtin_effects()?;
        Ok(dispatcher)
    }

    /// Register a GPU effect implementation by its stable id.
    pub fn register_effect(&mut self, effect: Box<dyn GpuEffect>) -> Result<()> {
        let id = effect.id().to_string();
        if self.registry.contains_key(&id) {
            return Err(Error::InvalidParameter(format!(
                "GPU effect '{}' is already registered",
                id
            )));
        }
        self.registry.insert(id, effect);
        Ok(())
    }

    /// Return true when an effect id can be resolved from the registry.
    pub fn has_effect(&self, effect_id: &str) -> bool {
        self.registry.contains_key(effect_id)
    }

    /// Snapshot of registered effect ids, sorted for deterministic tests/logging.
    pub fn registered_effect_ids(&self) -> Vec<&str> {
        let mut ids: Vec<&str> = self.registry.keys().map(String::as_str).collect();
        ids.sort_unstable();
        ids
    }

    fn register_builtin_effects(&mut self) -> Result<()> {
        let blur = Arc::new(Mutex::new(GpuBlurProcessor::new(self.ctx.clone())?));
        let style = Arc::new(Mutex::new(GpuStyleProcessor::new(self.ctx.clone())?));
        let shader = Arc::new(Mutex::new(CustomShaderProcessor::new(self.ctx.clone())?));

        self.register_effect(Box::new(GaussianBlurEffect::new(blur.clone())))?;
        self.register_effect(Box::new(MotionBlurEffect::new(blur.clone())))?;
        self.register_effect(Box::new(RadialBlurEffect::new(blur.clone())))?;
        self.register_effect(Box::new(SharpenEffect::new(blur)))?;

        self.register_effect(Box::new(VignetteEffect::new(style.clone())))?;
        self.register_effect(Box::new(GlowEffect::new(style.clone())))?;
        self.register_effect(Box::new(ChromaticAberrationEffect::new(style.clone())))?;
        self.register_effect(Box::new(FilmGrainEffect::new(style.clone())))?;
        self.register_effect(Box::new(ColorCorrectionEffect::new(style.clone())))?;
        self.register_effect(Box::new(LumaKeyEffect::new(style.clone())))?;
        self.register_effect(Box::new(ChromaKeyEffect::new(style)))?;

        for (effect_id, shader_id) in [
            ("pixelate", "pixelate"),
            ("edge_detect", "edge_detect"),
            ("edge-detect", "edge_detect"),
            ("posterize", "posterize"),
            ("noise", "noise"),
            ("rgb_split", "rgb_split"),
            ("rgb-split", "rgb_split"),
            ("wave_distort", "wave_distort"),
            ("wave-distort", "wave_distort"),
        ] {
            self.register_effect(Box::new(ShaderPresetEffect::new(
                effect_id,
                shader_id,
                shader.clone(),
            )))?;
        }

        Ok(())
    }

    /// Apply all enabled effects on a GPU texture, returning the processed texture.
    pub fn apply_effects_gpu(
        &mut self,
        input: &wgpu::Texture,
        width: u32,
        height: u32,
        effects: &[neko_engine_types::ElementEffect],
    ) -> Result<wgpu::Texture> {
        let mut sorted: Vec<&neko_engine_types::ElementEffect> =
            effects.iter().filter(|e| e.enabled).collect();
        sorted.sort_by_key(|e| e.order);

        debug_assert!(
            !sorted.is_empty(),
            "apply_effects_gpu called with no enabled effects"
        );

        let ping = Self::create_effect_texture(&self.ctx, width, height);
        let pong = Self::create_effect_texture(&self.ctx, width, height);
        let textures = [ping, pong];
        let mut src_is_input = true;
        let mut dst_idx: usize = 0;

        for (i, fx) in sorted.iter().enumerate() {
            let dst = &textures[dst_idx];
            let src: &wgpu::Texture = if src_is_input {
                input
            } else {
                &textures[1 - dst_idx]
            };

            self.apply_single_tex(src, dst, fx)?;

            src_is_input = false;
            if i + 1 < sorted.len() {
                dst_idx = 1 - dst_idx;
            }
        }

        let (first, second) = {
            let mut iter = textures.into_iter();
            (iter.next().unwrap(), iter.next().unwrap())
        };
        if dst_idx == 0 {
            Ok(first)
        } else {
            Ok(second)
        }
    }

    fn apply_single_tex(
        &mut self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        fx: &neko_engine_types::ElementEffect,
    ) -> Result<()> {
        let effect = self
            .registry
            .get_mut(&fx.effect_type)
            .ok_or_else(|| Error::UnknownEffect(fx.effect_type.clone()))?;

        effect.apply_tex(GpuEffectContext {
            input,
            output,
            params: GpuEffectParams::new(&fx.parameters),
        })
    }

    fn create_effect_texture(ctx: &GpuContext, w: u32, h: u32) -> wgpu::Texture {
        ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("EffectTex"),
            size: wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        })
    }

    /// Build a 5x256 float curves array from JSON-encoded curve LUT strings in params.
    fn build_curves_data(params: &serde_json::Map<String, serde_json::Value>) -> Vec<f32> {
        let mut data = vec![0.0f32; 5 * 256];
        for (slot, key) in [
            (0usize, "curve_rgb"),
            (1, "curve_r"),
            (2, "curve_g"),
            (3, "curve_b"),
            (4, "curve_luma"),
        ] {
            if let Some(json_str) = params.get(key).and_then(|v| v.as_str()) {
                if let Ok(values) = serde_json::from_str::<Vec<f64>>(json_str) {
                    for (i, &v) in values.iter().enumerate().take(256) {
                        data[slot * 256 + i] = v as f32;
                    }
                }
            } else {
                for i in 0..256 {
                    data[slot * 256 + i] = i as f32 / 255.0;
                }
            }
        }
        data
    }

    fn parse_hex_color(hex: &str) -> (f32, f32, f32) {
        let s = hex.trim_start_matches('#');
        let (r, g, b) = if s.len() == 6 {
            let r = u8::from_str_radix(&s[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&s[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&s[4..6], 16).unwrap_or(0);
            (r, g, b)
        } else if s.len() == 3 {
            let r = u8::from_str_radix(&s[0..1], 16).unwrap_or(0);
            let g = u8::from_str_radix(&s[1..2], 16).unwrap_or(0);
            let b = u8::from_str_radix(&s[2..3], 16).unwrap_or(0);
            (r * 17, g * 17, b * 17)
        } else {
            (0, 255, 0)
        };
        (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0)
    }

    /// Apply effects to a CPU pixel buffer (upload, GPU effects, readback).
    pub fn apply_effects_from_pixels(
        &mut self,
        pixels: Vec<u8>,
        width: u32,
        height: u32,
        effects: &[neko_engine_types::ElementEffect],
    ) -> Result<Vec<u8>> {
        if !effects.iter().any(|e| e.enabled) {
            return Ok(pixels);
        }

        let input_tex = self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("EffectsFromPixels Input"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &input_tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &pixels,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        let output_tex = self.apply_effects_gpu(&input_tex, width, height, effects)?;
        self.ctx.read_texture_sync(&output_tex, width, height)
    }
}

type SharedBlurProcessor = Arc<Mutex<GpuBlurProcessor>>;
type SharedStyleProcessor = Arc<Mutex<GpuStyleProcessor>>;
type SharedShaderProcessor = Arc<Mutex<CustomShaderProcessor>>;

fn lock_processor<'a, T>(processor: &'a Arc<Mutex<T>>, name: &str) -> Result<MutexGuard<'a, T>> {
    processor
        .lock()
        .map_err(|_| Error::Other(format!("{} processor mutex poisoned", name)))
}

struct GaussianBlurEffect {
    processor: SharedBlurProcessor,
}

impl GaussianBlurEffect {
    fn new(processor: SharedBlurProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for GaussianBlurEffect {
    fn id(&self) -> &'static str {
        "gaussian-blur"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let radius = ctx.params.get_f32("radius", 10.0);
        lock_processor(&self.processor, self.id())?.apply_blur_tex(
            ctx.input,
            ctx.output,
            &BlurParams {
                blur_type: BlurType::Gaussian as u32,
                radius,
                strength: 1.0,
                samples: 32,
                ..Default::default()
            },
        )
    }
}

struct MotionBlurEffect {
    processor: SharedBlurProcessor,
}

impl MotionBlurEffect {
    fn new(processor: SharedBlurProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for MotionBlurEffect {
    fn id(&self) -> &'static str {
        "motion-blur"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let distance = ctx.params.get_f32("distance", 20.0);
        let angle = ctx.params.get_f32("angle", 0.0).to_radians();
        lock_processor(&self.processor, self.id())?.apply_blur_tex(
            ctx.input,
            ctx.output,
            &BlurParams {
                blur_type: BlurType::Directional as u32,
                radius: distance,
                direction_x: angle.cos(),
                direction_y: angle.sin(),
                ..Default::default()
            },
        )
    }
}

struct RadialBlurEffect {
    processor: SharedBlurProcessor,
}

impl RadialBlurEffect {
    fn new(processor: SharedBlurProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for RadialBlurEffect {
    fn id(&self) -> &'static str {
        "radial-blur"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let amount = ctx.params.get_f32("amount", 20.0) / 100.0;
        let center_x = ctx.params.get_f32("centerX", 50.0) / 100.0;
        let center_y = ctx.params.get_f32("centerY", 50.0) / 100.0;
        lock_processor(&self.processor, self.id())?.apply_blur_tex(
            ctx.input,
            ctx.output,
            &BlurParams {
                blur_type: BlurType::Radial as u32,
                center_x,
                center_y,
                strength: amount,
                ..Default::default()
            },
        )
    }
}

struct SharpenEffect {
    processor: SharedBlurProcessor,
}

impl SharpenEffect {
    fn new(processor: SharedBlurProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for SharpenEffect {
    fn id(&self) -> &'static str {
        "sharpen"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let amount = ctx.params.get_f32("amount", 1.0);
        let radius = ctx.params.get_f32("radius", 1.0);
        let threshold = ctx.params.get_f32("threshold", 0.0);
        lock_processor(&self.processor, self.id())?.apply_sharpen_tex(
            ctx.input,
            ctx.output,
            &SharpenParams::with_options(amount, radius, threshold),
        )
    }
}

struct VignetteEffect {
    processor: SharedStyleProcessor,
}

impl VignetteEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for VignetteEffect {
    fn id(&self) -> &'static str {
        "vignette"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let amount = ctx.params.get_f32("amount", 0.5);
        let radius = ctx.params.get_f32("radius", 0.5);
        let softness = ctx.params.get_f32("softness", 0.5);
        let roundness = ctx.params.get_f32("roundness", 1.0);
        lock_processor(&self.processor, self.id())?.apply_vignette_tex(
            ctx.input,
            ctx.output,
            &VignetteParams::with_options(amount, radius, softness, roundness),
        )
    }
}

struct GlowEffect {
    processor: SharedStyleProcessor,
}

impl GlowEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for GlowEffect {
    fn id(&self) -> &'static str {
        "glow"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let intensity = ctx.params.get_f32("intensity", 0.5);
        let threshold = ctx.params.get_f32("threshold", 0.5);
        let radius = ctx.params.get_f32("radius", 10.0);
        lock_processor(&self.processor, self.id())?.apply_glow_tex(
            ctx.input,
            ctx.output,
            &GlowParams::with_options(intensity, threshold, radius),
        )
    }
}

struct ChromaticAberrationEffect {
    processor: SharedStyleProcessor,
}

impl ChromaticAberrationEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for ChromaticAberrationEffect {
    fn id(&self) -> &'static str {
        "chromatic-aberration"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let amount = ctx.params.get_f32("amount", 0.01);
        let angle = ctx.params.get_f32("angle", 0.0);
        let center_x = ctx.params.get_f32("centerX", 0.5);
        let center_y = ctx.params.get_f32("centerY", 0.5);
        lock_processor(&self.processor, self.id())?.apply_chromatic_aberration_tex(
            ctx.input,
            ctx.output,
            &ChromaticAberrationParams::with_options(amount, angle, center_x, center_y),
        )
    }
}

struct FilmGrainEffect {
    processor: SharedStyleProcessor,
}

impl FilmGrainEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for FilmGrainEffect {
    fn id(&self) -> &'static str {
        "film-grain"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let amount = ctx.params.get_f32("amount", 0.1);
        let size = ctx.params.get_f32("size", 1.0);
        let time = ctx.params.get_f32("time", 0.0);
        let color_amount = ctx.params.get_f32("colorAmount", 0.0);
        lock_processor(&self.processor, self.id())?.apply_film_grain_tex(
            ctx.input,
            ctx.output,
            &FilmGrainParams::with_options(amount, size, time, color_amount),
        )
    }
}

struct ColorCorrectionEffect {
    processor: SharedStyleProcessor,
}

impl ColorCorrectionEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for ColorCorrectionEffect {
    fn id(&self) -> &'static str {
        "color-correction"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let brightness = ctx.params.get_f32("brightness", 0.0);
        let contrast = ctx.params.get_f32("contrast", 1.0);
        let saturation = ctx.params.get_f32("saturation", 1.0);
        let exposure = ctx.params.get_f32("exposure", 0.0);
        let gamma = ctx.params.get_f32("gamma", 1.0);
        let hue_shift = ctx.params.get_f32("hueShift", 0.0);
        let vibrance = ctx.params.get_f32("vibrance", 0.0);
        let temperature = ctx.params.get_f32("temperature", 0.0);
        let tint = ctx.params.get_f32("tint", 0.0);
        let highlights = ctx.params.get_f32("highlights", 0.0);
        let shadows = ctx.params.get_f32("shadows", 0.0);
        let whites = ctx.params.get_f32("whites", 0.0);
        let blacks = ctx.params.get_f32("blacks", 0.0);

        let cw_enabled = if ctx.params.get_bool("cw_enabled", false) {
            1.0
        } else {
            0.0
        };
        let cw_shadows = [
            ctx.params.get_f32("cw_shadows_r", 0.5),
            ctx.params.get_f32("cw_shadows_g", 0.5),
            ctx.params.get_f32("cw_shadows_b", 0.5),
            ctx.params.get_f32("cw_shadows_brightness", 0.0),
        ];
        let cw_midtones = [
            ctx.params.get_f32("cw_midtones_r", 0.5),
            ctx.params.get_f32("cw_midtones_g", 0.5),
            ctx.params.get_f32("cw_midtones_b", 0.5),
            ctx.params.get_f32("cw_midtones_brightness", 0.0),
        ];
        let cw_highlights = [
            ctx.params.get_f32("cw_highlights_r", 0.5),
            ctx.params.get_f32("cw_highlights_g", 0.5),
            ctx.params.get_f32("cw_highlights_b", 0.5),
            ctx.params.get_f32("cw_highlights_brightness", 0.0),
        ];

        let hsl_count = ctx.params.get_f32("hsl_count", 0.0);
        let mut hsl_data = [[0.0f32; 4]; 8];
        let count = (hsl_count as usize).min(8);
        for (i, item) in hsl_data.iter_mut().enumerate().take(count) {
            *item = [
                ctx.params.get_f32(&format!("hsl_{}_target", i), 0.0),
                ctx.params.get_f32(&format!("hsl_{}_hue", i), 0.0),
                ctx.params.get_f32(&format!("hsl_{}_sat", i), 0.0),
                ctx.params.get_f32(&format!("hsl_{}_lum", i), 0.0),
            ];
        }

        let has_curves = if ctx.params.get_bool("curves_enabled", false) {
            1.0
        } else {
            0.0
        };
        let lut_id = ctx.params.get_str("lut_id").map(str::to_string);
        let lut_intensity = ctx.params.get_f32("lut_intensity", 1.0);
        let lut_enabled = if lut_id.is_some() { 1.0 } else { 0.0 };

        let curves_data = if has_curves > 0.0 {
            Some(EffectDispatcher::build_curves_data(ctx.params.as_map()))
        } else {
            None
        };

        let cc_params = ColorCorrectionTexParams {
            brightness,
            exposure,
            contrast,
            highlights,
            shadows,
            whites,
            blacks,
            temperature,
            tint,
            saturation,
            vibrance,
            gamma,
            hue_shift,
            cw_enabled,
            curves_enabled: has_curves,
            lut_enabled,
            lut_intensity,
            hsl_count,
            _pad0: 0.0,
            _pad1: 0.0,
            cw_shadows,
            cw_midtones,
            cw_highlights,
            hsl_data,
        };

        lock_processor(&self.processor, self.id())?.apply_color_correction_tex(
            ctx.input,
            ctx.output,
            &cc_params,
            curves_data.as_deref(),
            lut_id.as_deref(),
        )
    }
}

struct LumaKeyEffect {
    processor: SharedStyleProcessor,
}

impl LumaKeyEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for LumaKeyEffect {
    fn id(&self) -> &'static str {
        "luma-key"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let threshold = ctx.params.get_f32("threshold", 50.0) / 100.0;
        let softness = ctx.params.get_f32("softness", 10.0) / 100.0;
        let invert = ctx.params.get_bool("invert", false);
        lock_processor(&self.processor, self.id())?.apply_luma_key_tex(
            ctx.input,
            ctx.output,
            &LumaKeyParams::with_options(threshold, softness, invert),
        )
    }
}

struct ChromaKeyEffect {
    processor: SharedStyleProcessor,
}

impl ChromaKeyEffect {
    fn new(processor: SharedStyleProcessor) -> Self {
        Self { processor }
    }
}

impl GpuEffect for ChromaKeyEffect {
    fn id(&self) -> &'static str {
        "chroma-key"
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let key_color = ctx.params.get_str("keyColor").unwrap_or("#00ff00");
        let (key_r, key_g, key_b) = EffectDispatcher::parse_hex_color(key_color);
        let similarity = ctx.params.get_f32("similarity", 30.0) / 200.0;
        let smoothness = ctx.params.get_f32("smoothness", 10.0) / 500.0;
        let spill = ctx.params.get_f32("spillSuppression", 50.0) / 100.0;
        lock_processor(&self.processor, self.id())?.apply_chroma_key_tex(
            ctx.input,
            ctx.output,
            &ChromaKeyParams::with_options(key_r, key_g, key_b, similarity, smoothness, spill),
        )
    }
}

struct ShaderPresetEffect {
    effect_id: &'static str,
    shader_id: &'static str,
    processor: SharedShaderProcessor,
}

impl ShaderPresetEffect {
    fn new(
        effect_id: &'static str,
        shader_id: &'static str,
        processor: SharedShaderProcessor,
    ) -> Self {
        Self {
            effect_id,
            shader_id,
            processor,
        }
    }
}

impl GpuEffect for ShaderPresetEffect {
    fn id(&self) -> &'static str {
        self.effect_id
    }

    fn apply_tex(&mut self, ctx: GpuEffectContext<'_>) -> Result<()> {
        let params = serde_json::Value::Object(ctx.params.as_map().clone());
        lock_processor(&self.processor, self.id())?.apply_preset_tex(
            ctx.input,
            ctx.output,
            self.shader_id,
            &params,
        )
    }
}
