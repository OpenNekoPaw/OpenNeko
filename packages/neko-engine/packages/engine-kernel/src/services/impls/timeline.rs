//! TimelineService implementation
//!
//! Provides timeline composition and playback operations.
//! Supports GPU-accelerated compositing, H.264 preview streaming,
//! and full playback control (pause/resume/speed/loop/seek).

use crate::domain::{
    BezierControlPoint, ElementMask, FrameData, JviLoader, MaskShapeData, MediaReference,
    StreamConfig, Timeline, TimelineProjectInfo,
};
use crate::error::{Error, Result};
use crate::export::{AudioMixer, EffectDispatcher, ExportSettings, ExportStats};
use crate::monitor::SystemMonitor;
use crate::preview::{
    DefaultPreviewRenderBackendFactory, PreviewPipelineConfig, PreviewRenderBackendFactory,
};
use crate::services::impls::snapshot_sink::SnapshotSink;
use crate::services::impls::stream_loop::{
    eof_idle_wait, normalize_stream_fps, pack_pcm_f32le_stream_frame, ActiveStreams, PlaybackState,
    StreamLoopHandle, StreamPlaybackDelegate, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use crate::services::impls::stream_sink::StreamSink;
use crate::services::pipeline_sink::PipelineSink;
use crate::services::{
    IStreamPlayback, ITaskService, ITimelineService, StreamStats, TimelineStreamResult,
};
use crate::telemetry::metrics::{FrameStatsCollector, FrameTiming};
use async_trait::async_trait;
use neko_engine_audio::dsp::speed_resampler::SpeedResampler;
use neko_engine_codec::decoder::{Decoder, HwAccelDecoder, HwAccelType};
#[allow(deprecated)]
use neko_engine_gpu::GpuTransitionProcessor;
use neko_engine_gpu::{
    ColorSpace, CompositeLayer, GpuCompositor, GpuContext, GpuElementMask, GpuMaskBezierPoint,
    GpuMaskShape, GpuPermit, LayerPixelFormat, MaskRasterizer, Nv12Renderer, Nv12TextureImporter,
    PipelinePriority, Transform2D, TransitionParams, TransitionType,
};
use neko_engine_types::{
    BlendMode, FrameFormat, LoopRegion, PipelineOutput, StreamId, VideoOutput, VideoRawFrame,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};
use tokio_util::sync::CancellationToken;

#[cfg(test)]
mod tests;

/// Convert IEEE 754 half-precision float (f16) to single-precision float (f32)
fn f16_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exponent = ((bits >> 10) & 0x1F) as u32;
    let mantissa = (bits & 0x3FF) as u32;

    if exponent == 0 {
        if mantissa == 0 {
            // Signed zero
            f32::from_bits(sign << 31)
        } else {
            // Subnormal: convert to normalized f32
            let mut m = mantissa;
            let mut e = 0i32;
            while (m & 0x400) == 0 {
                m <<= 1;
                e += 1;
            }
            let f32_exp = (127 - 15 - e) as u32;
            let f32_mantissa = (m & 0x3FF) << 13;
            f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
        }
    } else if exponent == 31 {
        // Inf or NaN
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (0xFF << 23) | f32_mantissa)
    } else {
        // Normalized: rebias exponent from f16 bias (15) to f32 bias (127)
        let f32_exp = exponent + 127 - 15;
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
    }
}

fn mix_speed_adjusted_timeline_audio(
    mixer: &mut AudioMixer,
    resampler: &SpeedResampler,
    start_time: f64,
    frame_duration: f64,
    speed: f64,
) -> Result<Option<crate::export::MixedAudioFrame>> {
    let output_frames = (frame_duration * mixer.sample_rate() as f64).round() as usize;
    let source_frames_needed = (output_frames as f64 * speed).ceil().max(1.0) as usize;
    let channels = mixer.channels() as usize;
    let mut accumulated = Vec::with_capacity(source_frames_needed * channels);
    let mut mix_time = start_time;

    while accumulated.len() < source_frames_needed * channels {
        match mixer.mix_frame(mix_time)? {
            Some(frame) => {
                let remaining = source_frames_needed * channels - accumulated.len();
                let take = remaining.min(frame.data.len());
                accumulated.extend_from_slice(&frame.data[..take]);
                mix_time += frame_duration;
            }
            None => break,
        }
    }

    if accumulated.is_empty() {
        return Ok(Some(crate::export::MixedAudioFrame {
            data: vec![0.0; output_frames * channels],
            samples: output_frames,
            timestamp: start_time,
            sample_rate: mixer.sample_rate(),
            channels: mixer.channels(),
        }));
    }

    let data = resampler.resample(&accumulated, output_frames);
    Ok(Some(crate::export::MixedAudioFrame {
        data,
        samples: output_frames,
        timestamp: start_time,
        sample_rate: mixer.sample_rate(),
        channels: mixer.channels(),
    }))
}

/// TimelineService implementation
///
/// Provides timeline composition, H.264 preview streaming, and playback control.
pub struct TimelineService {
    /// GPU context for compositing
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
    /// Delegate for stream playback control (stop/pause/resume/speed/seek/loop)
    playback: StreamPlaybackDelegate,
    /// Stats watch receivers keyed by video stream_id
    stats_receivers: Arc<RwLock<HashMap<String, watch::Receiver<StreamStats>>>>,
    /// Current timeline per stream (for incremental operations)
    current_timelines: Arc<RwLock<HashMap<String, Timeline>>>,
    /// Factory for timeline preview render backends.
    preview_render_factory: Option<Arc<dyn PreviewRenderBackendFactory>>,
}

impl TimelineService {
    /// Create a new TimelineService
    pub fn new(
        gpu_ctx: Option<Arc<GpuContext>>,
        task_service: Arc<dyn ITaskService + Send + Sync>,
    ) -> Self {
        let preview_render_factory = gpu_ctx.as_ref().map(|ctx| {
            Arc::new(DefaultPreviewRenderBackendFactory::new(Arc::clone(ctx)))
                as Arc<dyn PreviewRenderBackendFactory>
        });
        Self::with_preview_render_factory(gpu_ctx, task_service, preview_render_factory)
    }

    /// Create a TimelineService with an injected preview render backend factory.
    pub fn with_preview_render_factory(
        gpu_ctx: Option<Arc<GpuContext>>,
        _task_service: Arc<dyn ITaskService + Send + Sync>,
        preview_render_factory: Option<Arc<dyn PreviewRenderBackendFactory>>,
    ) -> Self {
        let active_streams = Arc::new(ActiveStreams::new());
        let playback = StreamPlaybackDelegate::new(active_streams.clone());
        Self {
            gpu_ctx,
            active_streams,
            playback,
            stats_receivers: Arc::new(RwLock::new(HashMap::new())),
            current_timelines: Arc::new(RwLock::new(HashMap::new())),
            preview_render_factory,
        }
    }

    async fn set_quality_inner(
        &self,
        stream_id: &StreamId,
        width: u32,
        height: u32,
        bitrate: Option<u64>,
        fps: Option<f64>,
    ) -> Result<()> {
        if !self.active_streams.contains(stream_id).await {
            return Err(Error::Other(format!(
                "Stream '{}' not found for set_quality",
                stream_id.as_str()
            )));
        }

        // Auto-calculate bitrate from resolution if not specified: ~4 bits/pixel
        let bitrate = bitrate.unwrap_or_else(|| (width as u64) * (height as u64) * 4);
        let fps = normalize_stream_fps(fps.unwrap_or(30.0));
        let gop_size = (fps as u32).max(1);

        let config = PreviewPipelineConfig {
            width,
            height,
            fps,
            bitrate,
            gop_size,
            decoder_preference: None,
        };

        tracing::info!(
            "Setting quality for stream '{}': {}x{} @ {}kbps",
            stream_id.as_str(),
            width,
            height,
            bitrate / 1000
        );

        self.playback.update_config(stream_id, config).await
    }

    fn element_transform_2d(element: &crate::domain::Element) -> Transform2D {
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

    fn gpu_masks(masks: &[ElementMask]) -> Vec<GpuElementMask> {
        masks
            .iter()
            .map(|mask| GpuElementMask {
                shape: Self::gpu_mask_shape(&mask.shape),
                inverted: mask.inverted,
                feather: mask.feather,
                expansion: mask.expansion,
                opacity: mask.opacity,
                blend_mode: mask.blend_mode.clone(),
            })
            .collect()
    }

    fn gpu_mask_shape(shape: &MaskShapeData) -> GpuMaskShape {
        match shape {
            MaskShapeData::Rectangle {
                center_x,
                center_y,
                width,
                height,
                rotation,
                corner_radius,
            } => GpuMaskShape::Rectangle {
                center_x: *center_x,
                center_y: *center_y,
                width: *width,
                height: *height,
                rotation: *rotation,
                corner_radius: *corner_radius,
            },
            MaskShapeData::Ellipse {
                center_x,
                center_y,
                width,
                height,
                rotation,
            } => GpuMaskShape::Ellipse {
                center_x: *center_x,
                center_y: *center_y,
                width: *width,
                height: *height,
                rotation: *rotation,
            },
            MaskShapeData::Polygon { points } => GpuMaskShape::Polygon {
                points: points.clone(),
            },
            MaskShapeData::Bezier {
                control_points,
                closed,
            } => GpuMaskShape::Bezier {
                control_points: control_points
                    .iter()
                    .map(Self::gpu_mask_bezier_point)
                    .collect(),
                closed: *closed,
            },
        }
    }

    fn gpu_mask_bezier_point(point: &BezierControlPoint) -> GpuMaskBezierPoint {
        GpuMaskBezierPoint {
            position: point.position,
            handle_in: point.handle_in,
            handle_out: point.handle_out,
        }
    }

    /// Read texture data back to CPU buffer as RGBA8 (4 bytes per pixel)
    ///
    /// Delegates to GpuContext::read_texture_sync for the raw readback,
    /// then converts Rgba16Float (8 bytes/pixel) to RGBA8 (4 bytes/pixel) if needed.
    fn read_texture_to_rgba8(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let raw = ctx.read_texture_sync(texture, width, height)?;

        if texture.format() == wgpu::TextureFormat::Rgba16Float {
            Ok(Self::rgba16float_to_rgba8(&raw))
        } else {
            Ok(raw)
        }
    }

    /// Convert Rgba16Float pixel data to RGBA8
    ///
    /// Each Rgba16Float pixel is 8 bytes (4 × f16), converted to 4 bytes (4 × u8).
    fn rgba16float_to_rgba8(data: &[u8]) -> Vec<u8> {
        let pixel_count = data.len() / 8;
        let mut output = Vec::with_capacity(pixel_count * 4);
        for chunk in data.chunks_exact(8) {
            let r = f16_to_f32(u16::from_le_bytes([chunk[0], chunk[1]]));
            let g = f16_to_f32(u16::from_le_bytes([chunk[2], chunk[3]]));
            let b = f16_to_f32(u16::from_le_bytes([chunk[4], chunk[5]]));
            let a = f16_to_f32(u16::from_le_bytes([chunk[6], chunk[7]]));
            output.push((r.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((g.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((b.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((a.clamp(0.0, 1.0) * 255.0) as u8);
        }
        output
    }
}

#[async_trait]
impl IStreamPlayback for TimelineService {
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        // Clean up stats receiver before stopping
        {
            let mut receivers = self.stats_receivers.write().await;
            receivers.remove(stream_id.as_str());
        }
        // Clean up stored timeline
        self.current_timelines
            .write()
            .await
            .remove(stream_id.as_str());
        self.playback.stop_stream(stream_id).await
    }

    async fn pause(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.pause(stream_id).await
    }

    async fn resume(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.resume(stream_id).await
    }

    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        self.playback.set_speed(stream_id, speed).await
    }

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.playback.seek(stream_id, time_seconds).await
    }

    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()> {
        self.playback.set_loop(stream_id, region).await
    }
}

#[async_trait]
impl ITimelineService for TimelineService {
    async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo> {
        let path = jvi_path.to_path_buf();

        // Load and parse .nkv file in blocking task (file I/O)
        let info = tokio::task::spawn_blocking(move || -> Result<TimelineProjectInfo> {
            let loader = JviLoader::new();
            let (timeline_data, settings) = loader.load(&path)?;

            // Count elements across all tracks
            let element_count: usize = timeline_data.tracks.iter().map(|t| t.elements.len()).sum();

            // Calculate duration: use explicit duration if set, otherwise from elements
            let duration = timeline_data.effective_duration();

            // Collect media references and check file existence
            let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
            let mut media_references = Vec::new();

            for track in &timeline_data.tracks {
                for element in &track.elements {
                    let (element_id, src, media_type) = match &element.element_type {
                        crate::domain::ElementType::Media(m) => {
                            (element.id.clone(), m.src.clone(), "video".to_string())
                        }
                        crate::domain::ElementType::Audio(a) => {
                            (element.id.clone(), a.src.clone(), "audio".to_string())
                        }
                        crate::domain::ElementType::Text(_) => {
                            (element.id.clone(), String::new(), "text".to_string())
                        }
                        _ => (element.id.clone(), String::new(), "other".to_string()),
                    };

                    // Only add media references for elements with source files
                    if !src.is_empty() {
                        let resolved_path = if Path::new(&src).is_absolute() {
                            PathBuf::from(&src)
                        } else {
                            base_dir.join(&src)
                        };
                        let exists = resolved_path.exists();

                        media_references.push(MediaReference {
                            element_id,
                            path: resolved_path.to_string_lossy().to_string(),
                            exists,
                            media_type,
                        });
                    }
                }
            }

            // Read project name and version from raw JSON
            // (JviLoader converts to Timeline which doesn't preserve these)
            let raw_content = std::fs::read_to_string(&path)
                .map_err(|e| Error::Other(format!("Failed to re-read JVI file: {}", e)))?;
            let raw_json: serde_json::Value = serde_json::from_str(&raw_content)
                .map_err(|e| Error::Other(format!("Failed to re-parse JVI JSON: {}", e)))?;

            let name = raw_json
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let version = raw_json
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("1.0")
                .to_string();

            Ok(TimelineProjectInfo {
                name,
                version,
                width: settings.width,
                height: settings.height,
                fps: settings.fps,
                duration,
                track_count: timeline_data.tracks.len(),
                element_count,
                media_references,
            })
        })
        .await
        .map_err(|e| Error::Other(format!("Timeline probe task failed: {}", e)))??;

        Ok(info)
    }

    async fn composite(&self, timeline: &Timeline, frame_number: u64) -> Result<FrameData> {
        let gpu_ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU context required for compositing".to_string()))?
            .clone();

        let time = frame_number as f64 / timeline.fps;
        let width = timeline.resolution.width;
        let height = timeline.resolution.height;

        // Collect visible elements at this time (Vec for indexed access in transition processing)
        let visible_elements = timeline.elements_at_time(time);

        // Decode each element's frame and build composite layers
        let mut layers: Vec<CompositeLayer> = Vec::new();

        for (z_index, element) in visible_elements.iter().enumerate() {
            let source_path = match element.source_path() {
                Some(path) => path,
                None => continue, // Skip non-media elements (text, shape, etc.)
            };

            let source_time = element.get_source_time(time);
            let ctx = gpu_ctx.clone();

            // Decode frame in blocking task
            let decoded_rgba =
                tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, u32, u32)> {
                    let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
                    let media_info = decoder.open(&source_path)?;
                    let src_width = media_info.width;
                    let src_height = media_info.height;

                    let gpu_texture = decoder.decode_gpu_at(source_time)?.ok_or_else(|| {
                        Error::Other(format!(
                            "No frame at time {} for {}",
                            source_time, source_path
                        ))
                    })?;

                    // NV12 → RGBA via GPU
                    let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                    let nv12_texture = importer.import(&gpu_texture)?;

                    let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                    let output_texture = renderer.create_output_texture(src_width, src_height);
                    let output_view =
                        output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                    renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                    let rgba_data =
                        Self::read_texture_to_rgba8(&ctx, &output_texture, src_width, src_height)?;

                    Ok((rgba_data, src_width, src_height))
                })
                .await
                .map_err(|e| Error::Other(format!("Element decode task failed: {}", e)))??;

            let (mut rgba_data, src_width, src_height) = decoded_rgba;

            // Apply effects to decoded RGBA frame (GPU texture-to-texture via EffectDispatcher)
            if element.effects.iter().any(|e| e.enabled) {
                let original = rgba_data.clone();
                rgba_data = match EffectDispatcher::new(gpu_ctx.clone()) {
                    Ok(mut dispatcher) => {
                        match dispatcher.apply_effects_from_pixels(
                            rgba_data,
                            src_width,
                            src_height,
                            &element.effects,
                        ) {
                            Ok(processed) => processed,
                            Err(e @ neko_engine_gpu::GpuError::UnknownEffect(_)) => {
                                return Err(e.into())
                            }
                            Err(e) => {
                                tracing::warn!("Effects processing failed for element '{}', using unprocessed frame: {}", element.id, e);
                                original
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to create EffectDispatcher for composite: {}", e);
                        original
                    }
                };
            }

            // Build transform — apply same coordinate conversion as GpuExportPipeline
            let mut transform = Self::element_transform_2d(element);
            if element.transform.is_identity() {
                // No transform specified: auto-scale to fit output (letterbox + center)
                let scale_x = width as f32 / src_width as f32;
                let scale_y = height as f32 / src_height as f32;
                let scale = scale_x.min(scale_y);
                transform.scale_x = scale;
                transform.scale_y = scale;
                transform.x = width as f32 / 2.0;
                transform.y = height as f32 / 2.0;
                transform.anchor_x = 0.5;
                transform.anchor_y = 0.5;
            } else {
                // JVI transform: convert normalized coords to pixel coords
                // and apply fit-to-canvas base scaling to scaleX/scaleY
                let fit_scale_x = width as f32 / src_width as f32;
                let fit_scale_y = height as f32 / src_height as f32;
                let fit_scale = fit_scale_x.min(fit_scale_y);

                // scaleX: 1.0 means "fit to canvas", user scale is relative to that
                transform.scale_x *= fit_scale;
                transform.scale_y *= fit_scale;

                // x/y: normalized (0-1) → pixel coordinates
                transform.x *= width as f32;
                transform.y *= height as f32;
            }

            // Rasterize masks to grayscale data for GPU compositor
            let (mask_data, mask_inverted) = if !element.masks.is_empty() {
                match MaskRasterizer::new(gpu_ctx.clone()) {
                    Ok(rasterizer) => {
                        let masks = Self::gpu_masks(&element.masks);
                        match rasterizer.rasterize_masks(&masks, src_width, src_height) {
                            Ok(data) if !data.is_empty() => {
                                // Use inverted flag from first mask (primary)
                                let inverted = element.masks[0].inverted;
                                (Some(data), inverted)
                            }
                            Ok(_) => (None, false),
                            Err(e) => {
                                tracing::warn!(
                                    "Mask rasterization failed for element '{}': {}",
                                    element.id,
                                    e
                                );
                                (None, false)
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to create MaskRasterizer: {}", e);
                        (None, false)
                    }
                }
            } else {
                (None, false)
            };

            layers.push(CompositeLayer {
                data: rgba_data,
                width: src_width,
                height: src_height,
                pixel_format: LayerPixelFormat::Rgba,
                transform,
                opacity: element.opacity as f32,
                blend_mode: element.blend_mode,
                z_index: z_index as i32,
                mask: mask_data,
                mask_inverted,
            });
        }

        // Process transitions: blend paired layers via GpuTransitionProcessor
        // Transition info comes from the TS composite path (pre-calculated progress)
        // NOTE: This uses the legacy buffer-based path. The new texture-based pipeline
        // uses TextureTransitionProcessor in gpu_export_pipeline.rs instead.
        let mut transition_skip: std::collections::HashSet<usize> =
            std::collections::HashSet::new();
        {
            // Collect transition pairs: (from_layer_index, to_layer_index, transition_info)
            let mut transition_pairs: Vec<(usize, usize, String, f64)> = Vec::new();
            for (idx, element) in visible_elements.iter().enumerate() {
                if let Some(ref trans) = element.transition {
                    let to_idx = trans.paired_layer_index;
                    if to_idx < layers.len() && idx < layers.len() && idx != to_idx {
                        transition_pairs.push((
                            idx,
                            to_idx,
                            trans.transition_type.clone(),
                            trans.progress,
                        ));
                    }
                }
            }

            for (from_idx, to_idx, transition_type, progress) in &transition_pairs {
                let from_idx = *from_idx;
                let to_idx = *to_idx;

                // Composite each layer individually to canvas-sized RGBA
                let compositor = GpuCompositor::new(gpu_ctx.clone())?;
                let from_result = compositor.composite(
                    &[layers[from_idx].clone()],
                    width,
                    height,
                    [0.0, 0.0, 0.0, 0.0],
                )?;
                let to_result = compositor.composite(
                    &[layers[to_idx].clone()],
                    width,
                    height,
                    [0.0, 0.0, 0.0, 0.0],
                )?;

                // Apply GPU transition
                let params = TransitionParams::new(
                    TransitionType::from_str(transition_type),
                    *progress as f32,
                );

                #[allow(deprecated)]
                let blended = match GpuTransitionProcessor::new(gpu_ctx.clone()) {
                    Ok(processor) => {
                        match processor.apply_transition(
                            &from_result.data,
                            &to_result.data,
                            width,
                            height,
                            &params,
                        ) {
                            Ok(data) => data,
                            Err(e) => {
                                tracing::warn!("Transition processing failed: {}", e);
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to create TransitionProcessor: {}", e);
                        continue;
                    }
                };

                // Replace from_layer with blended result (full canvas, identity transform)
                layers[from_idx] = CompositeLayer {
                    data: blended,
                    width,
                    height,
                    pixel_format: LayerPixelFormat::Rgba,
                    transform: neko_engine_gpu::Transform2D {
                        x: width as f32 / 2.0,
                        y: height as f32 / 2.0,
                        scale_x: 1.0,
                        scale_y: 1.0,
                        rotation: 0.0,
                        anchor_x: 0.5,
                        anchor_y: 0.5,
                        _padding: 0.0,
                    },
                    opacity: 1.0,
                    blend_mode: BlendMode::Normal,
                    z_index: layers[from_idx].z_index,
                    mask: None,
                    mask_inverted: false,
                };

                // Mark to_layer for removal (will be skipped during final composite)
                transition_skip.insert(to_idx);
            }
        }

        // Remove transition-consumed layers (iterate in reverse to maintain indices)
        let mut skip_indices: Vec<usize> = transition_skip.into_iter().collect();
        skip_indices.sort_unstable_by(|a, b| b.cmp(a));
        for idx in skip_indices {
            if idx < layers.len() {
                layers.remove(idx);
            }
        }

        // Composite all layers
        let compositor = GpuCompositor::new(gpu_ctx)?;
        let result = compositor.composite(&layers, width, height, [0.0, 0.0, 0.0, 1.0])?;

        let (snapshot_sink, snapshot_rx) = SnapshotSink::new();
        snapshot_sink.submit(PipelineOutput::video(VideoOutput::RawFrame(
            VideoRawFrame {
                data: result.data,
                width: result.width,
                height: result.height,
                format: FrameFormat::Rgba,
                pts: (time * 1_000_000.0) as i64,
                duration: (1_000_000.0 / timeline.fps) as i64,
            },
        )))?;
        let snapshot = SnapshotSink::recv(snapshot_rx).await?;

        Ok(FrameData {
            data: snapshot.data,
            width: snapshot.width,
            height: snapshot.height,
            format: snapshot.format,
            timestamp: snapshot.pts as f64 / 1_000_000.0,
            diagnostics: None,
        })
    }

    async fn start_stream(
        &self,
        timeline: &Timeline,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<TimelineStreamResult> {
        let gpu_ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU context required for timeline streaming".to_string()))?
            .clone();

        let mut fps = normalize_stream_fps(config.fps);
        let width = config.resolution.width;
        let height = config.resolution.height;
        let mut timeline = timeline.clone();

        // Auto-calculate duration from elements if not explicitly set
        if timeline.duration <= 0.0 {
            timeline.duration = timeline.calculated_duration();
            tracing::info!(
                "Timeline duration auto-calculated from elements: {:.3}s",
                timeline.duration
            );
        }

        // === Shared infrastructure for both loops ===
        let cancel = CancellationToken::new();
        let initial_state = PlaybackState {
            paused: config.initial_paused,
            ..PlaybackState::default()
        };
        let (state_tx, state_rx) = watch::channel(initial_state);

        // Video broadcast channel
        let (video_tx, video_rx) = broadcast::channel::<FrameData>(64);
        let video_stream_id = StreamId::new(&format!("{}-video", session_id));

        // Audio broadcast channel
        let (audio_tx, audio_rx) = broadcast::channel::<FrameData>(64);
        let audio_stream_id = StreamId::new(&format!("{}-audio", session_id));

        // Stats watch channel (latest snapshot, polled on demand)
        let (stats_tx, stats_rx) = watch::channel(StreamStats::default());

        // === Video loop: PreviewPipeline (persistent decoder pool + GPU resources) + StreamSink ===
        let video_cancel = cancel.clone();
        let video_state_rx = state_rx.clone();
        let video_timeline = timeline.clone();
        let video_gpu_ctx = gpu_ctx.clone();
        let preview_render_factory = self
            .preview_render_factory
            .clone()
            .unwrap_or_else(|| Arc::new(DefaultPreviewRenderBackendFactory::new(gpu_ctx.clone())));
        let video_budget = video_gpu_ctx.budget_controller().clone();
        let video_start_time = config.start_time;
        let video_stats_tx = stats_tx.clone();
        let mut video_duration = timeline.duration;
        let video_streams_clone = self.active_streams.clone();
        let video_stream_id_clone = video_stream_id.clone();
        let video_join = tokio::task::spawn_blocking(move || {
            let budget_pipeline_id = format!("timeline-preview:{}", video_stream_id_clone.as_str());
            let _budget_guard = video_budget
                .register_pipeline(budget_pipeline_id.clone(), PipelinePriority::Interactive);
            // Create PreviewPipeline and StreamSink.
            let preview_config = PreviewPipelineConfig {
                width,
                height,
                fps,
                bitrate: 4_000_000,            // 4 Mbps for timeline preview
                gop_size: (fps as u32).max(1), // 1 second GOP
                decoder_preference: None,
            };

            let mut pipeline = match preview_render_factory
                .create(video_timeline.clone(), preview_config.clone())
            {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("Failed to create PreviewPipeline: {}", e);
                    return;
                }
            };

            if let Err(e) = pipeline.initialize_gpu_only() {
                tracing::error!("Failed to initialize PreviewPipeline: {}", e);
                return;
            }

            let stream_sink = match StreamSink::new(preview_config.clone(), video_tx.clone()) {
                Ok(sink) => sink,
                Err(e) => {
                    tracing::error!("Failed to create StreamSink: {}", e);
                    return;
                }
            };

            tracing::info!(
                "PreviewPipeline initialized: {}x{} @ {}fps, hw={}",
                width,
                height,
                fps,
                pipeline.is_hw_active()
            );

            let mut pacer = WallClockPacer::new(fps, 1.0);
            let mut current_speed = 1.0;
            let mut current_time = video_start_time;
            let mut last_seek_seq: u64 = 0;
            let timeline = video_timeline;
            let background_color = [0.0_f32, 0.0, 0.0, 1.0];
            let mut stats = FrameStatsCollector::new(std::time::Duration::from_secs(10));
            let mut system_monitor = SystemMonitor::new();
            let mut video_frame_idx: u64 = 0;
            let mut last_timeline_seq: u64 = 0;
            let mut last_config_seq: u64 = 0;

            loop {
                // Check cancellation
                if video_cancel.is_cancelled() {
                    break;
                }

                // Read playback state
                let state = video_state_rx.borrow().clone();

                // Handle timeline hot-update (dedup via sequence counter)
                if state.timeline_seq != last_timeline_seq {
                    last_timeline_seq = state.timeline_seq;
                    if let Some(new_tl) = &state.timeline_update {
                        let new_timeline = (**new_tl).clone();
                        tracing::info!(
                            "Video loop: hot-updating timeline (seq={})",
                            state.timeline_seq
                        );
                        pipeline.update_timeline(new_timeline.clone());
                        video_duration = new_timeline.duration;
                    }
                }

                // Handle config hot-update (resolution/bitrate change)
                if state.config_seq != last_config_seq {
                    last_config_seq = state.config_seq;
                    if let Some(new_config) = &state.config_update {
                        tracing::info!(
                            "Video loop: hot-updating config (seq={}): {}x{} @ {}kbps",
                            state.config_seq,
                            new_config.width,
                            new_config.height,
                            new_config.bitrate / 1000
                        );
                        pipeline.update_gpu_config(new_config.clone());
                        let update_result = stream_sink.reconfigure(new_config.clone());

                        match update_result {
                            Ok(()) => {
                                fps = new_config.fps;
                                pacer.reset();
                            }
                            Err(e) => tracing::error!("Video loop: failed to update config: {}", e),
                        }
                    }
                }

                // Handle seek (dedup via monotonic sequence counter)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        current_time = time;
                        pipeline.reset_frame_counter();
                        pacer.reset();
                    }
                }

                // Handle pause
                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    pacer.reset();
                    continue;
                }

                // Handle speed change
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.reset();
                }

                // Handle loop region
                if let Some(region) = &state.loop_region {
                    if current_time >= region.out_point {
                        current_time = region.in_point;
                        pacer.reset();
                    }
                }

                // Check timeline duration
                if current_time > timeline.duration && timeline.duration > 0.0 {
                    if let Some(region) = &state.loop_region {
                        current_time = region.in_point;
                        pacer.reset();
                    } else {
                        // No loop: enter EOF idle wait for seek
                        match eof_idle_wait(
                            &video_cancel,
                            &video_state_rx,
                            last_seek_seq,
                            EOF_IDLE_TIMEOUT,
                        ) {
                            Some(time) => {
                                current_time = time;
                                pacer.reset();
                                continue;
                            }
                            None => break, // Cancelled or timeout
                        }
                    }
                }

                // Render frame via PreviewPipeline with timing.
                match video_budget
                    .acquire_permit(budget_pipeline_id.clone(), PipelinePriority::Interactive)
                {
                    GpuPermit::Proceed => {}
                    GpuPermit::Queued { retry_after, .. }
                    | GpuPermit::Paused { retry_after, .. } => {
                        std::thread::sleep(retry_after);
                        pacer.reset();
                        continue;
                    }
                }

                let frame_start = std::time::Instant::now();
                let render_result = pipeline
                    .render_gpu_frame_timed(current_time, background_color)
                    .and_then(|(mut gpu_frame, gpu_timing)| {
                        let submit_start = std::time::Instant::now();
                        gpu_frame.pts = (current_time * 1_000_000.0) as i64;
                        gpu_frame.duration = (1_000_000.0 / fps * current_speed) as i64;
                        stream_sink
                            .submit(PipelineOutput::video(VideoOutput::gpu_frame(gpu_frame)))?;
                        let submit_ns = submit_start.elapsed().as_nanos() as u64;
                        Ok((gpu_timing, submit_ns, submit_ns))
                    });

                match render_result {
                    Ok((gpu_timing, submit_ns, encode_ns)) => {
                        video_budget.report_frame_time(
                            budget_pipeline_id.clone(),
                            PipelinePriority::Interactive,
                            frame_start.elapsed(),
                        );
                        video_budget.observe_submitted_work_done(
                            budget_pipeline_id.clone(),
                            PipelinePriority::Interactive,
                            video_gpu_ctx.queue(),
                        );
                        let timing = FrameTiming {
                            hw_decode_ns: gpu_timing.hw_decode_ns,
                            nv12_import_ns: gpu_timing.nv12_import_ns,
                            nv12_to_rgba_ns: gpu_timing.nv12_to_rgba_ns,
                            composite_ns: gpu_timing.composite_ns,
                            rgba_to_nv12_ns: gpu_timing.rgba_to_nv12_ns,
                            cpu_readback_ns: gpu_timing.cpu_readback_ns,
                            decode_ns: gpu_timing.hw_decode_ns,
                            gpu_ns: gpu_timing.total_ns(),
                            encode_submit_ns: submit_ns,
                            encode_ns,
                            total_ns: frame_start.elapsed().as_nanos() as u64,
                            ..Default::default()
                        };
                        stats.record_frame(timing);
                    }
                    Err(e) => {
                        video_budget.report_frame_time(
                            budget_pipeline_id.clone(),
                            PipelinePriority::Interactive,
                            frame_start.elapsed(),
                        );
                        tracing::warn!(
                            "PreviewPipeline render error at {:.3}s: {}",
                            current_time,
                            e
                        );
                    }
                }

                // Sample system resources and push stats periodically (every 30 frames ≈ 1s at 30fps)
                video_frame_idx += 1;
                if video_frame_idx.is_multiple_of(30) {
                    system_monitor.sample();

                    let avg_timing = stats.avg_timing();
                    let stream_stats = StreamStats {
                        video: ExportStats {
                            hw_decode_ms: avg_timing.hw_decode_ns as f64 / 1_000_000.0,
                            nv12_import_ms: avg_timing.nv12_import_ns as f64 / 1_000_000.0,
                            nv12_to_rgba_ms: avg_timing.nv12_to_rgba_ns as f64 / 1_000_000.0,
                            composite_ms: avg_timing.composite_ns as f64 / 1_000_000.0,
                            rgba_to_nv12_ms: avg_timing.rgba_to_nv12_ns as f64 / 1_000_000.0,
                            cpu_readback_ms: avg_timing.cpu_readback_ns as f64 / 1_000_000.0,
                            encode_submit_ms: avg_timing.encode_submit_ns as f64 / 1_000_000.0,
                            decode_time_ms: avg_timing.decode_ns / 1_000_000,
                            composite_time_ms: avg_timing.gpu_ns / 1_000_000,
                            encode_time_ms: avg_timing.encode_ns as f64 / 1_000_000.0,
                            mux_time_ms: 0,
                            avg_fps: stats.current_fps(),
                            peak_memory_bytes: system_monitor.peak_memory(),
                            cpu_usage_percent: system_monitor.avg_cpu_usage(),
                            gpu_usage_percent: system_monitor.avg_gpu_usage(),
                            vram_usage_bytes: system_monitor.peak_vram(),
                        },
                        audio_mix_ms: 0.0,
                        audio_fps: 0.0,
                        current_time,
                        total_duration: video_duration,
                        peak_memory_bytes: system_monitor.peak_memory(),
                        cpu_usage_percent: system_monitor.avg_cpu_usage(),
                    };
                    let _ = video_stats_tx.send_replace(stream_stats);
                }

                current_time += (1.0 / fps) * current_speed;
                pacer.wait_for_next_frame();
            }

            // Log final performance summary with system resource stats
            stats.log_final_summary();
            let avg_timing = stats.avg_timing();
            let video_stats = ExportStats {
                hw_decode_ms: avg_timing.hw_decode_ns as f64 / 1_000_000.0,
                nv12_import_ms: avg_timing.nv12_import_ns as f64 / 1_000_000.0,
                nv12_to_rgba_ms: avg_timing.nv12_to_rgba_ns as f64 / 1_000_000.0,
                composite_ms: avg_timing.composite_ns as f64 / 1_000_000.0,
                rgba_to_nv12_ms: avg_timing.rgba_to_nv12_ns as f64 / 1_000_000.0,
                cpu_readback_ms: avg_timing.cpu_readback_ns as f64 / 1_000_000.0,
                encode_submit_ms: avg_timing.encode_submit_ns as f64 / 1_000_000.0,
                decode_time_ms: avg_timing.decode_ns / 1_000_000,
                composite_time_ms: avg_timing.gpu_ns / 1_000_000,
                encode_time_ms: avg_timing.encode_ns as f64 / 1_000_000.0,
                mux_time_ms: 0,
                avg_fps: stats.current_fps(),
                peak_memory_bytes: system_monitor.peak_memory(),
                cpu_usage_percent: system_monitor.avg_cpu_usage(),
                gpu_usage_percent: system_monitor.avg_gpu_usage(),
                vram_usage_bytes: system_monitor.peak_vram(),
            };
            tracing::info!(
                "=== Video Stream ExportStats ===\n{}",
                serde_json::to_string_pretty(&video_stats).unwrap_or_default()
            );
            if let Err(e) = stream_sink.flush() {
                tracing::warn!("StreamSink flush failed: {}", e);
            }
            if let Err(e) = stream_sink.close() {
                tracing::warn!("StreamSink close failed: {}", e);
            }
            pipeline.close();

            // Self-cleanup: remove handle (and linked audio) from ActiveStreams
            let rt = tokio::runtime::Handle::current();
            rt.block_on(video_streams_clone.remove(video_stream_id_clone.as_str()));
        });

        // === Audio mixing loop (new, uses shared state) ===
        let audio_cancel = cancel.clone();
        let audio_state_rx = state_rx.clone();
        let audio_timeline = timeline.clone();
        let audio_fps = fps;
        let audio_start_time = config.start_time;
        let audio_join = tokio::task::spawn_blocking(move || {
            // Build minimal ExportSettings (only fps is needed by AudioMixer)
            let settings = ExportSettings {
                width: 0,
                height: 0,
                fps: audio_fps,
                video_codec: Default::default(),
                video_bitrate: None,
                audio_codec: Default::default(),
                audio_bitrate: None,
                hw_encoder: Default::default(),
                time_range: None,
                preset: Default::default(),
                use_zero_copy_gpu: false,
            };

            let mut mixer = AudioMixer::new(audio_timeline.clone(), &settings);
            if let Err(e) = mixer.initialize() {
                tracing::error!("Failed to initialize AudioMixer: {}", e);
                return;
            }

            // Wait for WebSocket subscriber to connect before producing frames.
            // Without this delay, frames are sent into an empty broadcast channel
            // and lost before the client can subscribe.
            let wait_start = std::time::Instant::now();
            while audio_tx.receiver_count() == 0 {
                if audio_cancel.is_cancelled() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
                if wait_start.elapsed() > std::time::Duration::from_secs(5) {
                    tracing::warn!("Audio loop: timed out waiting for subscriber, starting anyway");
                    break;
                }
            }
            tracing::info!(
                "Audio loop: subscriber ready after {:.0}ms",
                wait_start.elapsed().as_millis()
            );

            let sample_rate = mixer.sample_rate();
            let channels = mixer.channels();
            let mut pacer = WallClockPacer::new(audio_fps, 1.0);
            let mut resampler = SpeedResampler::new(channels as usize);
            let mut current_speed = 1.0;
            let frame_duration = 1.0 / audio_fps;
            let mut current_time = audio_start_time;
            let mut last_seek_seq: u64 = 0;
            let mut last_timeline_seq: u64 = 0;
            let mut total_frames: u64 = 0;
            let mut total_mix_ns: u64 = 0;
            let loop_start = std::time::Instant::now();
            // Fade-in ramp after seek: number of samples remaining for linear ramp
            // 5ms at 48kHz = 240 samples — eliminates click/pop at seek boundary
            let fade_in_samples_total = (sample_rate as f64 * 0.005) as usize; // 5ms
            let mut fade_in_remaining: usize = 0;

            loop {
                // Check cancellation
                if audio_cancel.is_cancelled() {
                    break;
                }

                // Read playback state
                let state = audio_state_rx.borrow().clone();

                // Handle timeline hot-update (dedup via sequence counter)
                if state.timeline_seq != last_timeline_seq {
                    last_timeline_seq = state.timeline_seq;
                    if let Some(new_tl) = &state.timeline_update {
                        tracing::info!(
                            "Audio loop: hot-updating timeline (seq={})",
                            state.timeline_seq
                        );
                        mixer.update_timeline((**new_tl).clone());
                        resampler = SpeedResampler::new(mixer.channels() as usize);
                    }
                }

                // Handle seek (dedup via monotonic sequence counter)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        current_time = time;
                        pacer.reset();
                        // Apply fade-in ramp to smooth seek transition
                        fade_in_remaining = fade_in_samples_total;
                    }
                }

                // Handle pause
                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    pacer.reset();
                    continue;
                }

                // Handle speed change
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.reset();
                }

                // Handle loop region
                if let Some(region) = &state.loop_region {
                    if current_time >= region.out_point {
                        current_time = region.in_point;
                        pacer.reset();
                    }
                }

                // Check timeline duration
                if current_time > audio_timeline.duration && audio_timeline.duration > 0.0 {
                    if let Some(region) = &state.loop_region {
                        current_time = region.in_point;
                        pacer.reset();
                    } else {
                        // No loop: enter EOF idle wait for seek
                        match eof_idle_wait(
                            &audio_cancel,
                            &audio_state_rx,
                            last_seek_seq,
                            EOF_IDLE_TIMEOUT,
                        ) {
                            Some(time) => {
                                current_time = time;
                                pacer.reset();
                                continue;
                            }
                            None => break, // Cancelled or timeout
                        }
                    }
                }

                // Mix one frame of audio. At non-1x preview speed, consume a
                // speed-scaled timeline window and resample it back to one
                // output frame so Web Audio receives continuous PCM instead of
                // duplicate/overlapping queued buffers.
                let mix_start = std::time::Instant::now();
                let speed_is_unity = (current_speed - 1.0).abs() < 0.001;
                let mix_result = if speed_is_unity {
                    mixer.mix_frame(current_time)
                } else {
                    mix_speed_adjusted_timeline_audio(
                        &mut mixer,
                        &resampler,
                        current_time,
                        frame_duration,
                        current_speed,
                    )
                };

                match mix_result {
                    Ok(Some(mut mixed)) => {
                        total_mix_ns += mix_start.elapsed().as_nanos() as u64;
                        total_frames += 1;

                        // Apply fade-in ramp after seek to eliminate click/pop
                        if fade_in_remaining > 0 {
                            let ch = channels as usize;
                            let total = fade_in_samples_total;
                            for i in 0..mixed.samples {
                                if fade_in_remaining == 0 {
                                    break;
                                }
                                let progress = 1.0 - (fade_in_remaining as f32 / total as f32);
                                let gain = progress * progress; // quadratic ease-in
                                for c in 0..ch {
                                    let idx = i * ch + c;
                                    if idx < mixed.data.len() {
                                        mixed.data[idx] *= gain;
                                    }
                                }
                                fade_in_remaining -= 1;
                            }
                        }

                        // Cast f32 data to raw bytes
                        let pcm_bytes: &[u8] = bytemuck::cast_slice(&mixed.data);
                        let frame_pts = current_time;
                        let media_duration = frame_duration * current_speed;
                        let frame = pack_pcm_f32le_stream_frame(
                            pcm_bytes,
                            frame_pts,
                            media_duration,
                            sample_rate,
                            channels,
                        );
                        let _ = audio_tx.send(frame);
                    }
                    Ok(None) => {
                        tracing::warn!("Audio mix returned None at {:.3}s", current_time);
                    }
                    Err(e) => {
                        tracing::warn!("Audio mix error at {:.3}s: {}", current_time, e);
                    }
                }

                current_time += frame_duration * current_speed;
                pacer.wait_for_next_frame();
            }

            // Log minimal audio summary
            let elapsed = loop_start.elapsed().as_secs_f64();
            let avg_mix_ms = if total_frames > 0 {
                total_mix_ns as f64 / total_frames as f64 / 1_000_000.0
            } else {
                0.0
            };
            tracing::info!(
                "Audio stream ended: {} frames in {:.1}s, avg mix {:.2}ms/frame",
                total_frames,
                elapsed,
                avg_mix_ms
            );

            mixer.close();
        });

        // Store paired handles
        let video_handle = StreamLoopHandle {
            stream_id: video_stream_id.clone(),
            cancel: cancel.clone(),
            state_tx: state_tx.clone(),
            join_handle: video_join,
            linked_stream_id: None,
        };
        let audio_handle = StreamLoopHandle {
            stream_id: audio_stream_id.clone(),
            cancel,
            state_tx,
            join_handle: audio_join,
            linked_stream_id: None,
        };
        self.active_streams
            .insert_paired(video_handle, audio_handle)
            .await;

        // Store stats receiver for polling via get_stream_stats()
        {
            let mut receivers = self.stats_receivers.write().await;
            receivers.insert(video_stream_id.as_str().to_string(), stats_rx.clone());
        }

        // Store initial timeline for incremental operations
        self.current_timelines
            .write()
            .await
            .insert(video_stream_id.as_str().to_string(), timeline.clone());

        Ok(TimelineStreamResult {
            video_stream_id,
            video_rx,
            audio_stream_id,
            audio_rx,
            stats_rx,
        })
    }

    async fn get_stream_stats(&self, stream_id: &StreamId) -> Option<StreamStats> {
        let receivers = self.stats_receivers.read().await;
        receivers
            .get(stream_id.as_str())
            .map(|rx| rx.borrow().clone())
    }

    async fn set_quality(
        &self,
        stream_id: &StreamId,
        width: u32,
        height: u32,
        bitrate: Option<u64>,
        fps: Option<f64>,
    ) -> Result<()> {
        self.set_quality_inner(stream_id, width, height, bitrate, fps)
            .await
    }

    async fn update_stream(&self, stream_id: &StreamId, timeline: &Timeline) -> Result<()> {
        // Hot-update timeline data via PlaybackState watch channel.
        // Video/audio loops detect timeline_seq change and call update_timeline()
        // on their respective pipelines (PreviewPipeline / AudioMixer).

        // Verify stream exists in ActiveStreams
        if !self.active_streams.contains(stream_id).await {
            return Err(Error::Other(format!(
                "Stream '{}' not found for update",
                stream_id.as_str()
            )));
        }

        let timeline_arc = std::sync::Arc::new(timeline.clone());

        tracing::info!(
            "Hot-updating stream '{}' timeline via PlaybackState",
            stream_id.as_str()
        );

        self.playback
            .update_timeline(stream_id, timeline_arc)
            .await?;

        // Store current timeline for incremental operations
        self.current_timelines
            .write()
            .await
            .insert(stream_id.as_str().to_string(), timeline.clone());

        Ok(())
    }

    async fn apply_operation_to_stream(
        &self,
        stream_id: &StreamId,
        operation: &crate::domain::operations::EditOperationEnvelope,
        base_dir: Option<&std::path::Path>,
    ) -> Result<bool> {
        use crate::domain::operations::ApplyResult;

        let mut timelines = self.current_timelines.write().await;
        let timeline = match timelines.get_mut(stream_id.as_str()) {
            Some(tl) => tl,
            None => {
                tracing::warn!(
                    "No stored timeline for stream '{}', cannot apply operation incrementally",
                    stream_id.as_str()
                );
                return Ok(false);
            }
        };

        match timeline.try_apply_operation_with_base_dir(operation, base_dir)? {
            ApplyResult::Applied => {
                let timeline_arc = Arc::new(timeline.clone());
                // Release lock before async call
                drop(timelines);
                self.playback
                    .update_timeline(stream_id, timeline_arc)
                    .await?;
                Ok(true)
            }
            ApplyResult::Unsupported => Ok(false),
        }
    }
}
