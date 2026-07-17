//! GPU Export Pipeline - GPU-centric multi-source video export
//!
//! Orchestrates the full GPU pipeline for timeline-based video export:
//!
//! ```text
//! HwAccelDecoder[N] → Nv12TextureImporter → Nv12RenderCache
//!   → GpuLayer → TextureCompositor → RGBA texture → NV12 (GPU) → Encoder
//! ```
//!
//! All compositing stays on GPU. macOS export uses an IOSurface-backed
//! zero-copy path; CPU/NV12 helpers are retained only for diagnostics and
//! non-macOS fallback work.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use crate::domain::{
    Element, ElementType, ShapeElementData, ShapeFillData, ShapeGradientData, ShapeGradientStop,
    ShapeShadowData, ShapeStrokeData, Timeline,
};
use crate::error::{Error, Result};
use crate::telemetry::spans::span;
use neko_engine_codec::decoder::{global_pool, HwAccelDecoder, HwAccelType};
use neko_engine_gpu::{
    EffectDispatcher, GpuContext, GpuLayer, GpuLayerBuilder, GpuShapeElementData, GpuShapeFillData,
    GpuShapeGradientData, GpuShapeGradientStop, GpuShapeShadowData, GpuShapeStrokeData,
    Nv12OutputBuffers, Nv12RenderCache, Nv12TextureImporter, RgbaToNv12Converter, ShapeRasterizer,
    TextRenderer, TextureCompositeResult, TextureCompositor, TextureTransitionProcessor,
    Transform2D, TransitionParams, TransitionType,
};
use neko_engine_gpu::{GpuPipelineTiming, LayerTexturePool, Nv12FrameResult};
use neko_engine_types::{BlendMode, GpuOutputHandle, TrackType};

use super::types::ExportSettings;

#[cfg(test)]
mod tests;

/// GPU-centric export pipeline (Facade)
///
/// Orchestrates multi-source decoding, GPU compositing, and output
/// for timeline-based video export. Replaces the former `TimelineDecoder`
/// which mixed decoding and compositing responsibilities.
///
/// All visual processing stays on GPU textures until the final NV12 readback.
pub struct GpuExportPipeline {
    /// Shared GPU context
    ctx: Arc<GpuContext>,
    /// Video decoders keyed by source path
    decoders: HashMap<String, HwAccelDecoder>,
    /// NV12 texture importer (hardware decoder → wgpu)
    nv12_importer: Nv12TextureImporter,
    /// NV12 → RGBA renderer (pure GPU render pipeline)
    nv12_renderer: Nv12RenderCache,
    /// Multi-layer GPU texture compositor
    compositor: TextureCompositor,
    /// RGBA → NV12 converter for encoder output
    #[allow(dead_code)]
    rgba_to_nv12: RgbaToNv12Converter,
    /// Timeline data
    timeline: Timeline,
    /// Export settings
    settings: ExportSettings,
    /// Total frames to export
    total_frames: u64,
    /// Output width
    output_width: u32,
    /// Output height
    output_height: u32,
    /// Cached NV12 output buffers (reused across frames)
    nv12_output_cache: Option<Nv12OutputBuffers>,
    /// Texture pool for layer textures (reused across frames)
    layer_texture_pool: LayerTexturePool,
    /// Text renderer for text elements (lazy-initialized)
    text_renderer: Option<TextRenderer>,
    /// Shape rasterizer for shape elements (lazy-initialized)
    shape_rasterizer: Option<ShapeRasterizer>,
    /// Effect dispatcher for per-element GPU effects (None when GPU unavailable)
    effect_dispatcher: Option<EffectDispatcher>,
    /// Texture-based transition processor for GPU zero-copy transitions
    transition_processor: TextureTransitionProcessor,
    /// Zero-copy RGBA→NV12 converter (macOS only, outputs to IOSurface)
    #[cfg(target_os = "macos")]
    zerocopy_converter: Option<neko_engine_gpu::RgbaToNv12TextureConverter>,
}

impl GpuExportPipeline {
    /// Create a new GPU export pipeline
    pub fn new(timeline: Timeline, settings: ExportSettings, ctx: Arc<GpuContext>) -> Result<Self> {
        let total_frames = timeline.total_frames_at_fps(settings.fps);
        let output_width = settings.width;
        let output_height = settings.height;

        let nv12_importer = Nv12TextureImporter::new(ctx.clone());
        let nv12_renderer = Nv12RenderCache::new(ctx.clone())?;
        let compositor = TextureCompositor::new(ctx.clone())?;
        let rgba_to_nv12 = RgbaToNv12Converter::new(ctx.clone())?;
        let effect_dispatcher = EffectDispatcher::new(ctx.clone()).ok();
        let transition_processor = TextureTransitionProcessor::new(ctx.clone())?;

        Ok(Self {
            ctx,
            decoders: HashMap::new(),
            nv12_importer,
            nv12_renderer,
            compositor,
            rgba_to_nv12,
            timeline,
            settings,
            total_frames,
            output_width,
            output_height,
            nv12_output_cache: None,
            layer_texture_pool: LayerTexturePool::new(),
            text_renderer: None,
            shape_rasterizer: None,
            effect_dispatcher,
            transition_processor,
            #[cfg(target_os = "macos")]
            zerocopy_converter: None,
        })
    }

    /// Initialize all required video decoders from the pool
    pub fn initialize(&mut self) -> Result<()> {
        let sources = self.timeline.get_media_sources();
        let pool = global_pool();

        for src in sources {
            let mut guard = pool.acquire(&src, HwAccelType::Auto)?;
            let decoder = guard
                .take_decoder()
                .ok_or_else(|| Error::Other("Decoder guard was empty".to_string()))?;

            tracing::info!(
                "Acquired pooled HW decoder for {}: hw={}",
                src,
                decoder.is_hw_active()
            );
            self.decoders.insert(src, decoder);
        }

        Ok(())
    }

    /// Hot-update timeline data for an active pipeline.
    /// Opens decoders for any new media sources via pool, keeps existing decoders intact.
    pub fn update_timeline(&mut self, timeline: Timeline) {
        // Open decoders for new sources that don't exist yet
        let new_sources = timeline.get_media_sources();
        let pool = global_pool();
        for src in &new_sources {
            if !self.decoders.contains_key(src) {
                match pool.acquire(src, HwAccelType::Auto) {
                    Ok(mut guard) => {
                        if let Some(decoder) = guard.take_decoder() {
                            tracing::info!(
                                "Hot-update: acquired pooled decoder for new source {}",
                                src
                            );
                            self.decoders.insert(src.clone(), decoder);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Hot-update: failed to acquire decoder for {}: {}", src, e);
                    }
                }
            }
        }

        // Update timeline and recalculate duration
        self.total_frames = timeline.total_frames_at_fps(self.settings.fps);
        self.timeline = timeline;
    }

    /// Get total frames to export
    pub fn total_frames(&self) -> u64 {
        self.total_frames
    }

    /// Hot-update output resolution (for preview quality changes).
    /// Invalidates NV12 output cache and texture pool so they are
    /// re-allocated at the new size on the next frame.
    pub fn update_resolution(&mut self, width: u32, height: u32) {
        if self.output_width == width && self.output_height == height {
            return;
        }
        tracing::info!(
            "GpuExportPipeline: resolution {}x{} -> {}x{}",
            self.output_width,
            self.output_height,
            width,
            height
        );
        self.output_width = width;
        self.output_height = height;
        self.settings.width = width;
        self.settings.height = height;
        // Invalidate cached buffers sized for the old resolution
        self.nv12_output_cache = None;
    }

    /// Get output dimensions
    pub fn output_dimensions(&self) -> (u32, u32) {
        (self.output_width, self.output_height)
    }

    /// Process a single frame entirely on GPU
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → GpuLayer → Composite
    /// Returns the composited result as a GPU texture.
    #[tracing::instrument(
        skip(self),
        fields(
            time = %format!("{:.3}s", time),
        )
    )]
    #[allow(dead_code)]
    pub fn process_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<TextureCompositeResult> {
        let mut timing = GpuPipelineTiming::default();
        self.process_frame_timed(time, background_color, &mut timing)
    }

    /// Process a single frame with detailed timing breakdown
    ///
    /// Same as `process_frame` but populates timing information.
    fn process_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
        timing: &mut GpuPipelineTiming,
    ) -> Result<TextureCompositeResult> {
        // Mark frame boundary for Tracy
        crate::telemetry::spans::mark_frame_boundary();

        // Release textures from previous frame back to pool
        self.layer_texture_pool.release_all();

        let media_elements = {
            let _span = tracing::debug_span!(span::DECODE_VISIBLE_MEDIA).entered();
            self.collect_visible_media(time)
        };
        tracing::debug!(
            "Found {} visible media elements at time {:.2}s",
            media_elements.len(),
            time
        );

        let mut gpu_layers: Vec<GpuLayer> = Vec::new();
        {
            let _span =
                tracing::debug_span!(span::GPU_PIPELINE, layers = media_elements.len()).entered();
            for (media, z_idx) in &media_elements {
                if let Some(layer) = self.decode_to_gpu_layer_timed(media, time, *z_idx, timing)? {
                    gpu_layers.push(layer);
                }
            }
        }

        // Render text elements on top of media layers
        let text_z_start = media_elements.len() as i32;
        let text_elements = self.collect_visible_text(time, text_z_start);
        if !text_elements.is_empty() {
            tracing::debug!(
                "Rendering {} text elements at time {:.2}s",
                text_elements.len(),
                time
            );
            for (text, z_idx) in &text_elements {
                if let Some(layer) = self.render_text_to_gpu_layer(text, *z_idx) {
                    gpu_layers.push(layer);
                }
            }
        }

        // Render subtitle elements after text.
        let subtitle_z_start = (media_elements.len() + text_elements.len()) as i32;
        let subtitle_elements = self.collect_visible_subtitles(time, subtitle_z_start);
        if !subtitle_elements.is_empty() {
            tracing::debug!(
                "Rendering {} subtitle elements at time {:.2}s",
                subtitle_elements.len(),
                time
            );
            for (subtitle, z_idx) in &subtitle_elements {
                if let Some(layer) = self.render_subtitle_to_gpu_layer(subtitle, *z_idx) {
                    gpu_layers.push(layer);
                }
            }
        }

        // Render shape elements (vector graphics)
        let shape_z_start =
            (media_elements.len() + text_elements.len() + subtitle_elements.len()) as i32;
        let shape_elements = self.collect_visible_shapes(time, shape_z_start);
        if !shape_elements.is_empty() {
            tracing::debug!(
                "Rendering {} shape elements at time {:.2}s",
                shape_elements.len(),
                time
            );
            for (shape, z_idx) in &shape_elements {
                if let Some(layer) = self.render_shape_to_gpu_layer(shape, *z_idx) {
                    gpu_layers.push(layer);
                }
            }
        }

        tracing::debug!("Created {} GPU layers for compositing", gpu_layers.len());

        // Apply transitions: blend paired layers via texture-based GPU transition
        self.apply_transitions(&media_elements, &mut gpu_layers)?;

        let layer_refs: Vec<&GpuLayer> = gpu_layers.iter().collect();
        let result = {
            let start = Instant::now();
            let _span = tracing::debug_span!(
                span::COMPOSITE,
                width = self.output_width,
                height = self.output_height,
                layer_count = layer_refs.len()
            )
            .entered();
            let result = self.compositor.composite(
                &layer_refs,
                self.output_width,
                self.output_height,
                background_color,
            );
            timing.composite_ns += start.elapsed().as_nanos() as u64;
            result
        };

        Ok(result?)
    }

    /// Process a single frame and read back to CPU
    ///
    /// Calls `process_frame()` then reads the GPU texture to CPU memory.
    /// CPU readback is used only by diagnostic and non-zero-copy fallback paths.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[allow(dead_code)]
    pub fn process_frame_to_cpu(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame(time, background_color)?;
        let _span = tracing::debug_span!(span::CPU_READBACK).entered();
        Ok(self
            .ctx
            .read_texture_sync(&result.texture, result.width, result.height)?)
    }

    /// Process a single frame and convert to NV12 format for encoding
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert
    /// The RGBA→NV12 conversion is done on GPU via compute shader.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[allow(dead_code)]
    pub fn process_frame_to_nv12(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame_to_nv12_timed(time, background_color)?;
        Ok(result.data)
    }

    /// Process a single frame to NV12 with detailed timing breakdown
    ///
    /// Returns NV12 data along with timing for each pipeline stage.
    /// Use this method when you need performance metrics.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[allow(dead_code)]
    pub fn process_frame_to_nv12_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Nv12FrameResult> {
        let mut timing = GpuPipelineTiming::default();

        // Process frame with internal timing
        let result = self.process_frame_timed(time, background_color, &mut timing)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Reuse or create NV12 output buffers (cached for performance)
        let needs_new_buffers = match &self.nv12_output_cache {
            Some(cache) => cache.width != result.width || cache.height != result.height,
            None => true,
        };
        if needs_new_buffers {
            self.nv12_output_cache = Some(
                self.rgba_to_nv12
                    .create_output_buffers(result.width, result.height),
            );
        }
        let nv12_output = self.nv12_output_cache.as_ref().unwrap();

        // Convert RGBA to NV12 on GPU (BT.709 for HD video)
        {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::RGBA_TO_NV12).entered();
            self.rgba_to_nv12.convert(&texture_view, nv12_output, 1)?;
            timing.rgba_to_nv12_ns = start.elapsed().as_nanos() as u64;
        }

        // Read NV12 data back to CPU
        let data = {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::CPU_READBACK).entered();
            let data = self.rgba_to_nv12.read_nv12_data_blocking(nv12_output)?;
            timing.cpu_readback_ns = start.elapsed().as_nanos() as u64;
            data
        };

        Ok(Nv12FrameResult {
            data,
            gpu_handle: None,
            width: result.width,
            height: result.height,
            timing,
        })
    }

    /// Process a single frame and return an encoder-ready GPU handle.
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert → IOSurface
    /// The output IOSurface can be passed directly to VideoToolbox encoder.
    ///
    /// Returns the IOSurface handle that can be used with `HwAccelEncoder::encode_frame_gpu()`.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[allow(dead_code)]
    pub fn process_frame_to_gpu_handle(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<GpuOutputHandle> {
        let result = self.process_frame_to_gpu_handle_timed(time, background_color)?;
        result.gpu_handle.ok_or_else(|| {
            Error::UnsupportedCapability(
                "GPU export path did not return an encoder-ready handle".to_string(),
            )
        })
    }

    /// Process a single frame to an encoder-ready GPU handle with timing breakdown.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[cfg(target_os = "macos")]
    pub fn process_frame_to_gpu_handle_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Nv12FrameResult> {
        use neko_engine_gpu::RgbaToNv12TextureConverter;

        let mut timing = GpuPipelineTiming::default();

        let result = self.process_frame_timed(time, background_color, &mut timing)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Lazy initialize zero-copy converter
        if self.zerocopy_converter.is_none() {
            self.zerocopy_converter = Some(RgbaToNv12TextureConverter::new(self.ctx.clone())?);
            tracing::info!("Initialized zero-copy RGBA→NV12 converter (IOSurface output)");
        }

        let converter = self.zerocopy_converter.as_mut().unwrap();

        // Convert RGBA to NV12 and return an encoder-ready platform handle.
        let gpu_handle = {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::RGBA_TO_NV12, zerocopy = true).entered();
            let handle = converter.convert_to_encoder_handle(
                &texture_view,
                result.width,
                result.height,
                1,
            )?;
            timing.rgba_to_nv12_ns = start.elapsed().as_nanos() as u64;
            handle
        };

        Ok(Nv12FrameResult {
            data: Vec::new(),
            gpu_handle: Some(gpu_handle),
            width: result.width,
            height: result.height,
            timing,
        })
    }

    /// Process a single frame to an encoder-ready GPU handle with timing breakdown.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    #[cfg(not(target_os = "macos"))]
    pub fn process_frame_to_gpu_handle_timed(
        &mut self,
        time: f64,
        _background_color: [f32; 4],
    ) -> Result<Nv12FrameResult> {
        let _ = time;
        Err(Error::UnsupportedCapability(format!(
            "GPU zero-copy export is not implemented on {}",
            std::env::consts::OS
        )))
    }

    /// Close all decoders and return them to the pool for reuse
    pub fn close(&mut self) {
        let pool = global_pool();
        for (src, decoder) in self.decoders.drain() {
            tracing::debug!("Returning decoder for {} to pool", src);
            pool.return_decoder(decoder, &src, HwAccelType::Auto);
        }
    }

    // =========================================================================
    // Internal methods
    // =========================================================================

    /// Apply texture-based transitions between paired layers.
    ///
    /// Scans media elements for transition info, pre-composites each pair to
    /// canvas-sized textures, applies the GPU transition effect, and replaces
    /// the pair with a single blended layer.
    fn apply_transitions(
        &self,
        media_elements: &[(Element, i32)],
        gpu_layers: &mut Vec<GpuLayer>,
    ) -> Result<()> {
        // Collect transition pairs: (from_layer_idx, to_layer_idx, type, progress)
        let mut transition_pairs: Vec<(usize, usize, String, f64)> = Vec::new();
        for (idx, (element, _)) in media_elements.iter().enumerate() {
            if let Some(ref trans) = element.transition {
                let to_idx = trans.paired_layer_index;
                if to_idx < gpu_layers.len() && idx < gpu_layers.len() && idx != to_idx {
                    transition_pairs.push((
                        idx,
                        to_idx,
                        trans.transition_type.clone(),
                        trans.progress,
                    ));
                }
            }
        }

        if transition_pairs.is_empty() {
            return Ok(());
        }

        tracing::debug!("Processing {} transition pair(s)", transition_pairs.len());

        let mut removal_indices: Vec<usize> = Vec::new();

        for (from_idx, to_idx, transition_type, progress) in &transition_pairs {
            let from_idx = *from_idx;
            let to_idx = *to_idx;

            // Pre-composite each layer individually to canvas-sized Rgba16Float texture
            let from_result = self.compositor.composite(
                &[&gpu_layers[from_idx]],
                self.output_width,
                self.output_height,
                [0.0, 0.0, 0.0, 0.0], // transparent background
            )?;
            let to_result = self.compositor.composite(
                &[&gpu_layers[to_idx]],
                self.output_width,
                self.output_height,
                [0.0, 0.0, 0.0, 0.0],
            )?;

            // Apply GPU transition
            let params =
                TransitionParams::new(TransitionType::from_str(transition_type), *progress as f32);

            let (blended_texture, _blended_view) = self.transition_processor.apply_transition(
                &from_result.view,
                &to_result.view,
                self.output_width,
                self.output_height,
                &params,
            )?;

            // Replace from_layer with blended result (identity transform, full canvas)
            gpu_layers[from_idx] = GpuLayer::from_rgba(
                blended_texture,
                self.output_width,
                self.output_height,
                neko_engine_gpu::Transform2D {
                    x: self.output_width as f32 / 2.0,
                    y: self.output_height as f32 / 2.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation: 0.0,
                    anchor_x: 0.5,
                    anchor_y: 0.5,
                    _padding: 0.0,
                },
                1.0,
                BlendMode::Normal,
                gpu_layers[from_idx].z_index,
            );

            // Mark to_layer for removal
            removal_indices.push(to_idx);
        }

        // Remove consumed to_layers in reverse order to maintain valid indices
        removal_indices.sort_unstable();
        removal_indices.dedup();
        for idx in removal_indices.into_iter().rev() {
            if idx < gpu_layers.len() {
                gpu_layers.remove(idx);
            }
        }

        Ok(())
    }

    /// Collect visible media elements at a given time
    fn collect_visible_media(&self, time: f64) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = 0i32;

        for track in &self.timeline.tracks {
            // Skip muted tracks and non-video tracks (Media is alias for Video)
            if track.muted || !matches!(track.track_type, TrackType::Video | TrackType::Media) {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                if element.is_media() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Collect visible text elements at a given time
    fn collect_visible_text(&self, time: f64, z_index_start: i32) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = z_index_start;

        for track in &self.timeline.tracks {
            if track.muted {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                if element.is_text() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Collect visible subtitle elements at a given time
    fn collect_visible_subtitles(&self, time: f64, z_index_start: i32) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = z_index_start;

        for track in &self.timeline.tracks {
            if track.muted {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                if element.is_subtitle() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Collect visible shape elements at a given time
    fn collect_visible_shapes(&self, time: f64, z_index_start: i32) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = z_index_start;

        for track in &self.timeline.tracks {
            if track.muted {
                continue;
            }
            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }
                if element.is_shape() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Match webview preview semantics: values in [0, 1] are normalized project
    /// coordinates, otherwise treat them as absolute pixels.
    fn project_coord_to_pixels(value: f32, axis_size: u32) -> f32 {
        if (0.0..=1.0).contains(&value) {
            value * axis_size as f32
        } else {
            value
        }
    }

    /// Resolve text-like element transforms using the same normalized-coordinate
    /// rules as the webview preview overlay.
    fn resolve_text_like_transform(
        &self,
        element: &Element,
        default_x: f32,
        default_y: f32,
    ) -> Transform2D {
        if !element.transform.is_identity() {
            let mut transform = Self::element_transform_2d(element);
            transform.x = Self::project_coord_to_pixels(transform.x, self.output_width);
            transform.y = Self::project_coord_to_pixels(transform.y, self.output_height);
            transform
        } else {
            Transform2D {
                x: default_x,
                y: default_y,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation: 0.0,
                anchor_x: 0.5,
                anchor_y: 0.5,
                _padding: 0.0,
            }
        }
    }

    fn element_transform_2d(element: &Element) -> Transform2D {
        Transform2D {
            x: element.transform.x,
            y: element.transform.y,
            scale_x: element.transform.scale_x,
            scale_y: element.transform.scale_y,
            rotation: element.transform.rotation,
            anchor_x: element.transform.anchor_x,
            anchor_y: element.transform.anchor_y,
            _padding: 0.0,
        }
    }

    fn gpu_shape_data(data: &ShapeElementData) -> GpuShapeElementData {
        GpuShapeElementData {
            shape_type: data.shape_type.clone(),
            shape_params: data.shape_params.clone(),
            fill: Self::gpu_shape_fill(&data.fill),
            stroke: Self::gpu_shape_stroke(&data.stroke),
            shadow: Self::gpu_shape_shadow(&data.shadow),
        }
    }

    fn gpu_shape_fill(fill: &ShapeFillData) -> GpuShapeFillData {
        GpuShapeFillData {
            fill_type: fill.fill_type.clone(),
            color: fill.color.clone(),
            gradient: fill.gradient.as_ref().map(Self::gpu_shape_gradient),
            opacity: fill.opacity,
        }
    }

    fn gpu_shape_gradient(gradient: &ShapeGradientData) -> GpuShapeGradientData {
        GpuShapeGradientData {
            gradient_type: gradient.gradient_type.clone(),
            stops: gradient
                .stops
                .iter()
                .map(Self::gpu_shape_gradient_stop)
                .collect(),
            angle: gradient.angle,
            center_x: gradient.center_x,
            center_y: gradient.center_y,
            radius: gradient.radius,
        }
    }

    fn gpu_shape_gradient_stop(stop: &ShapeGradientStop) -> GpuShapeGradientStop {
        GpuShapeGradientStop {
            offset: stop.offset,
            color: stop.color.clone(),
        }
    }

    fn gpu_shape_stroke(stroke: &ShapeStrokeData) -> GpuShapeStrokeData {
        GpuShapeStrokeData {
            enabled: stroke.enabled,
            color: stroke.color.clone(),
            width: stroke.width,
            opacity: stroke.opacity,
            line_cap: stroke.line_cap.clone(),
            line_join: stroke.line_join.clone(),
            miter_limit: stroke.miter_limit,
            dash_array: stroke.dash_array.clone(),
            dash_offset: stroke.dash_offset,
        }
    }

    fn gpu_shape_shadow(shadow: &ShapeShadowData) -> GpuShapeShadowData {
        GpuShapeShadowData {
            enabled: shadow.enabled,
            color: shadow.color.clone(),
            blur: shadow.blur,
            offset_x: shadow.offset_x,
            offset_y: shadow.offset_y,
        }
    }

    /// Render a shape element to a GpuLayer via CPU rasterization
    fn render_shape_to_gpu_layer(&mut self, element: &Element, z_index: i32) -> Option<GpuLayer> {
        let shape_data = match &element.element_type {
            ElementType::Shape(s) => s,
            _ => return None,
        };

        // Lazy-initialize shape rasterizer
        if self.shape_rasterizer.is_none() {
            self.shape_rasterizer = Some(ShapeRasterizer::new(self.ctx.clone()));
        }
        let rasterizer = self.shape_rasterizer.as_ref().unwrap();

        let gpu_shape = Self::gpu_shape_data(shape_data);
        let rasterized = rasterizer.rasterize(&gpu_shape, self.output_width, self.output_height)?;

        let width = rasterized.width;
        let height = rasterized.height;
        let texture = rasterizer.upload_to_texture(&rasterized);

        let transform = if !element.transform.is_identity() {
            Self::element_transform_2d(element)
        } else {
            neko_engine_gpu::Transform2D {
                x: self.output_width as f32 / 2.0,
                y: self.output_height as f32 / 2.0,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation: 0.0,
                anchor_x: 0.5,
                anchor_y: 0.5,
                _padding: 0.0,
            }
        };

        let layer = GpuLayerBuilder::new()
            .transform(transform)
            .opacity(element.opacity as f32)
            .z_index(z_index)
            .build_from_rgba(texture, width, height);

        tracing::debug!(
            "Rendered shape '{}' ({}) to {}x{} texture (z_index={})",
            element.name,
            shape_data.shape_type,
            width,
            height,
            z_index
        );

        Some(layer)
    }

    /// Render a text element to a GpuLayer
    fn render_text_to_gpu_layer(&mut self, element: &Element, z_index: i32) -> Option<GpuLayer> {
        let text_data = match &element.element_type {
            ElementType::Text(t) => t,
            _ => return None,
        };

        // Lazy-initialize text renderer
        if self.text_renderer.is_none() {
            self.text_renderer = Some(TextRenderer::new(self.ctx.clone()));
        }

        let renderer = self.text_renderer.as_mut().unwrap();

        // Build text style from Phase 2 fields
        let style_opts = neko_engine_gpu::TextStyle {
            line_height: Some(text_data.line_height),
            text_decoration: Some(text_data.text_decoration.clone()),
            stroke_color: Some(text_data.stroke_color.clone()),
            stroke_width: Some(text_data.stroke_width),
            shadow: text_data
                .shadow
                .as_ref()
                .map(|s| neko_engine_gpu::TextShadowStyle {
                    color: s.color.clone(),
                    offset_x: s.offset_x,
                    offset_y: s.offset_y,
                    blur: s.blur,
                }),
            background_color: Some(text_data.background_color.clone()),
        };

        // Rasterize text to RGBA buffer with full styling
        let rasterized = renderer.rasterize_styled(
            &text_data.content,
            &text_data.font_family,
            text_data.font_size,
            &text_data.color,
            &text_data.font_weight,
            &text_data.font_style,
            Some(self.output_width as f32),
            &style_opts,
        )?;

        let width = rasterized.width;
        let height = rasterized.height;

        // Upload to GPU texture
        let texture = renderer.upload_to_texture(&rasterized);

        let transform = self.resolve_text_like_transform(
            element,
            self.output_width as f32 / 2.0,
            self.output_height as f32 / 2.0,
        );

        let layer = GpuLayerBuilder::new()
            .transform(transform)
            .opacity(element.opacity as f32)
            .z_index(z_index)
            .build_from_rgba(texture, width, height);

        tracing::debug!(
            "Rendered text '{}' to {}x{} texture (z_index={})",
            text_data.content,
            width,
            height,
            z_index
        );

        Some(layer)
    }

    /// Render a subtitle element to a GpuLayer (reuses TextRenderer)
    fn render_subtitle_to_gpu_layer(
        &mut self,
        element: &Element,
        z_index: i32,
    ) -> Option<GpuLayer> {
        let sub_data = match &element.element_type {
            ElementType::Subtitle(s) => s,
            _ => return None,
        };

        // Lazy-initialize text renderer (shared with render_text_to_gpu_layer)
        if self.text_renderer.is_none() {
            self.text_renderer = Some(TextRenderer::new(self.ctx.clone()));
        }
        let renderer = self.text_renderer.as_mut().unwrap();

        // Map SubtitleElementData fields → TextStyle
        let style_opts = neko_engine_gpu::TextStyle {
            line_height: Some(1.4), // Subtitles use wider line spacing for readability
            text_decoration: None,
            stroke_color: Some(sub_data.stroke_color.clone()),
            stroke_width: Some(sub_data.stroke_width),
            shadow: sub_data
                .shadow
                .as_ref()
                .map(|s| neko_engine_gpu::TextShadowStyle {
                    color: s.color.clone(),
                    offset_x: s.offset_x,
                    offset_y: s.offset_y,
                    blur: s.blur,
                }),
            background_color: Some(sub_data.background_color.clone()),
        };

        let rasterized = renderer.rasterize_styled(
            &sub_data.text,
            &sub_data.font_family,
            sub_data.font_size,
            &sub_data.color,
            "normal", // Subtitles have no font_weight field
            "normal", // Subtitles have no font_style field
            Some(self.output_width as f32),
            &style_opts,
        )?;

        let width = rasterized.width;
        let height = rasterized.height;
        let texture = renderer.upload_to_texture(&rasterized);

        let transform = self.resolve_text_like_transform(
            element,
            self.output_width as f32 / 2.0,
            self.output_height as f32 * 0.85,
        );

        let layer = GpuLayerBuilder::new()
            .transform(transform)
            .opacity(element.opacity as f32)
            .z_index(z_index)
            .build_from_rgba(texture, width, height);

        tracing::debug!(
            "Rendered subtitle '{}' to {}x{} texture (z_index={})",
            sub_data.text,
            width,
            height,
            z_index
        );

        Some(layer)
    }

    /// Decode a media element to a GPU layer with timing breakdown
    fn decode_to_gpu_layer_timed(
        &mut self,
        element: &Element,
        timeline_time: f64,
        z_index: i32,
        timing: &mut GpuPipelineTiming,
    ) -> Result<Option<GpuLayer>> {
        let src = element
            .source_path()
            .ok_or_else(|| Error::Other("Element has no source path".to_string()))?;

        let decoder = self
            .decoders
            .get_mut(&src)
            .ok_or_else(|| Error::Other(format!("No decoder found for source: {}", src)))?;

        let source_time = element.get_source_time(timeline_time);

        // Debug: Log seek time
        if timeline_time < 0.2 || (timeline_time > 30.0 && timeline_time < 30.2) {
            tracing::debug!(
                "Seeking to source_time={:.2}s for timeline_time={:.2}s",
                source_time,
                timeline_time
            );
        }

        // Step 1: Hardware decode → NV12 GPU texture
        let nv12_texture = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::HW_DECODE).entered();
            let result = match decoder.decode_gpu_at(source_time)? {
                Some(tex) => tex,
                None => {
                    tracing::warn!("No frame at source time {:.2}s for {}", source_time, src);
                    return Ok(None);
                }
            };
            timing.hw_decode_ns += start.elapsed().as_nanos() as u64;
            result
        };

        let width = nv12_texture.width;
        let height = nv12_texture.height;

        // Step 2: Import NV12 GPU texture → wgpu textures
        let imported = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::NV12_IMPORT).entered();
            let result = self.nv12_importer.import(&nv12_texture)?;
            timing.nv12_import_ns += start.elapsed().as_nanos() as u64;
            result
        };

        // Step 3: NV12 → RGBA on GPU (render pipeline)
        let rgba_texture = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::NV12_TO_RGBA).entered();
            let result = self.nv12_renderer.render(&imported);
            timing.nv12_to_rgba_ns += start.elapsed().as_nanos() as u64;
            result
        };

        // Step 3.5: Apply per-element visual effects (GPU texture-to-texture, Phase 3)
        // No CPU round-trip: all effects run on GPU, output stays as wgpu::Texture.
        let has_enabled_effects = element.effects.iter().any(|e| e.enabled);
        let effects_applied_texture: Option<wgpu::Texture> = if has_enabled_effects {
            if let Some(ref mut dispatcher) = self.effect_dispatcher {
                let _span =
                    tracing::trace_span!("EFFECT_DISPATCH", effects = element.effects.len())
                        .entered();
                match dispatcher.apply_effects_gpu(rgba_texture, width, height, &element.effects) {
                    Ok(tex) => Some(tex),
                    Err(e @ neko_engine_gpu::GpuError::UnknownEffect(_)) => return Err(e.into()),
                    Err(e) => {
                        tracing::error!("GPU effect dispatch failed: {}, using original frame", e);
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None
        };
        let effective_rgba = effects_applied_texture.as_ref().unwrap_or(rgba_texture);

        // Step 4 + 5: Obtain an owned texture for the GpuLayer.
        //
        // When effects were applied (Rgba8Unorm output), use the effect texture directly —
        // no pool copy needed (we already own it and the compositor handles any float format).
        //
        // When no effects, copy the Rgba16Float rgba_texture into a pooled texture to
        // avoid per-frame allocation (pool reuses Rgba16Float textures across frames).
        let owned_texture: wgpu::Texture = if let Some(effect_tex) = effects_applied_texture {
            // Effects path: effect output is owned, skip pool
            effect_tex
        } else {
            // No-effects path: copy rgba_texture (Rgba16Float) to pool texture (same format)
            let tex_idx = self.layer_texture_pool.acquire(&self.ctx, width, height);
            {
                let _span = tracing::trace_span!(span::GPU_SUBMIT).entered();
                let dst = self.layer_texture_pool.get(tex_idx);
                let mut encoder =
                    self.ctx
                        .device()
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                            label: Some("Texture Copy Encoder"),
                        });

                encoder.copy_texture_to_texture(
                    wgpu::ImageCopyTexture {
                        texture: effective_rgba,
                        mip_level: 0,
                        origin: wgpu::Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    wgpu::ImageCopyTexture {
                        texture: dst,
                        mip_level: 0,
                        origin: wgpu::Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    wgpu::Extent3d {
                        width,
                        height,
                        depth_or_array_layers: 1,
                    },
                );
                self.ctx.queue().submit(std::iter::once(encoder.finish()));
            }
            self.layer_texture_pool.take_last_in_use().unwrap()
        };

        // Calculate transform: always apply fit-to-canvas base scaling
        // JVI transform semantics:
        //   x/y: normalized position (0-1), where 0.5 = center
        //   scaleX/scaleY: relative to fit-to-canvas size (1.0 = 100% fit)
        //   anchorX/anchorY: normalized anchor point (0-1)
        let mut transform = Self::element_transform_2d(element);
        if element.transform.is_identity() {
            // No transform specified: auto-scale to fit output (letterbox + center)
            let scale_x = self.output_width as f32 / width as f32;
            let scale_y = self.output_height as f32 / height as f32;
            let scale = scale_x.min(scale_y);
            transform.scale_x = scale;
            transform.scale_y = scale;
            transform.x = self.output_width as f32 / 2.0;
            transform.y = self.output_height as f32 / 2.0;
            transform.anchor_x = 0.5;
            transform.anchor_y = 0.5;
        } else {
            // JVI transform: convert normalized coords to pixel coords
            // and apply fit-to-canvas base scaling to scaleX/scaleY
            let fit_scale_x = self.output_width as f32 / width as f32;
            let fit_scale_y = self.output_height as f32 / height as f32;
            let fit_scale = fit_scale_x.min(fit_scale_y);

            // scaleX: 1.0 means "fit to canvas", user scale is relative to that
            transform.scale_x *= fit_scale;
            transform.scale_y *= fit_scale;

            // x/y: normalized (0-1) → pixel coordinates
            transform.x *= self.output_width as f32;
            transform.y *= self.output_height as f32;
        }

        let layer = {
            let _span = tracing::trace_span!(span::LAYER_RENDER).entered();
            GpuLayerBuilder::new()
                .transform(transform)
                .opacity(element.opacity as f32)
                .blend_mode(element.blend_mode)
                .z_index(z_index)
                .build_from_rgba(owned_texture, width, height)
        };

        Ok(Some(layer))
    }
}

impl Drop for GpuExportPipeline {
    fn drop(&mut self) {
        self.close();
    }
}
