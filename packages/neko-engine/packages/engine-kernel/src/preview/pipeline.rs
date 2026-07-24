//! Preview Pipeline - Zero-copy GPU pipeline for real-time H.264 preview
//!
//! Reuses GpuExportPipeline for GPU processing, adds H.264 encoding for streaming.
//!
//! Data flow (macOS zero-copy):
//! ```text
//! GpuExportPipeline (decode → composite → IOSurface)
//!     → VideoToolbox H.264 Encode → H.264 NAL units → WebSocket
//! ```

// TODO(P2): keep the encoded preview path available while current preview
// routing uses the sink-based GPU frame backend.
#![allow(dead_code)]

use std::sync::Arc;

use crate::domain::Timeline;
use crate::encoder::{
    global_encoder_pool, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwAccelEncoder,
    VideoCodec,
};
use crate::error::{Error, Result};
use crate::export::{ExportSettings, GpuExportPipeline, GpuPipelineTiming};
use neko_engine_gpu::GpuContext;
use neko_engine_types::{GpuFrameLease, VideoGpuFrame};

/// Preview pipeline configuration
#[derive(Debug, Clone, PartialEq)]
pub struct PreviewPipelineConfig {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Bitrate in bits per second (default: 2 Mbps for preview)
    pub bitrate: u64,
    /// GOP size (keyframe interval)
    pub gop_size: u32,
    /// WebCodecs decoder preference hint echoed by media streams.
    pub decoder_preference: Option<String>,
}

impl Default for PreviewPipelineConfig {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            fps: 30.0,
            bitrate: 2_000_000, // 2 Mbps for preview
            gop_size: 30,       // 1 second GOP
            decoder_preference: None,
        }
    }
}

/// Encoded preview frame
#[derive(Debug, Clone)]
pub struct PreviewFrame {
    /// H.264 NAL unit data
    pub data: Vec<u8>,
    /// Presentation timestamp in microseconds
    pub pts: i64,
    /// Decode timestamp in microseconds
    pub dts: i64,
    /// Whether this is a keyframe (IDR)
    pub is_keyframe: bool,
}

impl From<&EncodedPacket> for PreviewFrame {
    fn from(packet: &EncodedPacket) -> Self {
        Self {
            data: packet.data.clone(),
            pts: packet.pts,
            dts: packet.dts,
            is_keyframe: packet.is_keyframe,
        }
    }
}

/// Preview Pipeline - Wraps GpuExportPipeline + H.264 encoder
///
/// Reuses the export pipeline for all GPU processing:
/// - Hardware video decoding
/// - Multi-layer GPU compositing
/// - Zero-copy RGBA→NV12 conversion (IOSurface on macOS)
///
/// Adds H.264 encoding for real-time streaming.
pub struct PreviewPipeline {
    /// GPU export pipeline (handles decode + composite + NV12 conversion)
    gpu_pipeline: GpuExportPipeline,
    /// H.264 encoder
    encoder: HwAccelEncoder,
    /// Configuration
    config: PreviewPipelineConfig,
    /// Frame counter for PTS calculation
    frame_count: u64,
    /// Whether encoder is initialized
    encoder_initialized: bool,
}

impl PreviewPipeline {
    /// Create a new preview pipeline from timeline
    pub fn new(
        timeline: Timeline,
        ctx: Arc<GpuContext>,
        config: PreviewPipelineConfig,
    ) -> Result<Self> {
        // Create export settings from preview config
        let export_settings = ExportSettings {
            width: config.width,
            height: config.height,
            fps: config.fps,
            video_codec: neko_engine_types::VideoCodec::H264,
            video_bitrate: Some(config.bitrate),
            audio_codec: neko_engine_types::AudioCodec::Aac,
            audio_bitrate: None,
            audio_sample_rate: 48_000,
            hw_encoder: neko_engine_types::HwEncoderType::Auto,
            time_range: None,
            preset: neko_engine_types::EncoderPreset::default(),
            use_zero_copy_gpu: true, // Enable zero-copy for preview
        };

        let gpu_pipeline = GpuExportPipeline::new(timeline, export_settings, ctx)?;
        let encoder = HwAccelEncoder::new();

        Ok(Self {
            gpu_pipeline,
            encoder,
            config,
            frame_count: 0,
            encoder_initialized: false,
        })
    }

    /// Initialize the pipeline (open all decoders)
    pub fn initialize(&mut self) -> Result<()> {
        self.gpu_pipeline.initialize()?;
        self.ensure_encoder_initialized()?;
        Ok(())
    }

    /// Initialize GPU composition resources without opening the rollback encoder.
    pub fn initialize_gpu_only(&mut self) -> Result<()> {
        self.gpu_pipeline.initialize()
    }

    /// Update configuration (e.g., resolution change).
    /// Flushes the old encoder and returns any remaining frames before resetting.
    pub fn update_config(&mut self, config: PreviewPipelineConfig) -> Result<Vec<PreviewFrame>> {
        let mut flushed = Vec::new();
        if self.config.width != config.width || self.config.height != config.height {
            tracing::info!(
                "PreviewPipeline: resolution change {}x{} -> {}x{}, flushing & resetting encoder",
                self.config.width,
                self.config.height,
                config.width,
                config.height
            );
            // Flush old encoder to retrieve any buffered frames (e.g. B-frames)
            if self.encoder_initialized {
                match self.encoder.flush() {
                    Ok(packets) => {
                        flushed = packets.iter().map(PreviewFrame::from).collect();
                        if !flushed.is_empty() {
                            tracing::info!(
                                "PreviewPipeline: flushed {} frames from old encoder",
                                flushed.len()
                            );
                        }
                    }
                    Err(e) => {
                        tracing::warn!("PreviewPipeline: encoder flush failed: {}", e);
                    }
                }
                // Return old encoder to pool
                let mut old_config = EncoderConfig::new(
                    self.config.width,
                    self.config.height,
                    self.config.fps,
                    VideoCodec::H264,
                );
                old_config.gop_size = Some(self.config.gop_size);
                old_config.max_b_frames = Some(0);
                let encoder = std::mem::take(&mut self.encoder);
                global_encoder_pool().release(encoder, old_config);
            }
            self.encoder_initialized = false;
            self.frame_count = 0;
            self.gpu_pipeline
                .update_resolution(config.width, config.height);
        }
        self.config = config;
        Ok(flushed)
    }

    /// Update only GPU output configuration for the sink-based path.
    pub fn update_gpu_config(&mut self, config: PreviewPipelineConfig) {
        if self.config.width != config.width || self.config.height != config.height {
            self.gpu_pipeline
                .update_resolution(config.width, config.height);
            self.frame_count = 0;
        }
        self.config = config;
    }

    /// Hot-update timeline data without recreating the pipeline.
    /// Delegates to GpuExportPipeline which opens decoders for new sources.
    pub fn update_timeline(&mut self, timeline: Timeline) {
        self.gpu_pipeline.update_timeline(timeline);
    }

    /// Initialize encoder with current config (using encoder pool)
    fn ensure_encoder_initialized(&mut self) -> Result<()> {
        if self.encoder_initialized {
            return Ok(());
        }

        let mut encoder_config = EncoderConfig::new(
            self.config.width,
            self.config.height,
            self.config.fps,
            VideoCodec::H264,
        );
        encoder_config.bitrate = self.config.bitrate;
        encoder_config.gop_size = Some(self.config.gop_size);
        encoder_config.use_zero_copy_gpu = true; // Enable zero-copy for preview
                                                 // Preview-optimized: disable B-frames to eliminate pipeline delay,
                                                 // use baseline profile (no B-frames support), and fastest preset
        encoder_config.max_b_frames = Some(0);
        encoder_config.profile = Some("baseline".to_string());
        encoder_config.preset = EncoderPreset::Ultrafast;

        self.encoder = global_encoder_pool().acquire(&encoder_config)?;
        self.encoder_initialized = true;

        tracing::info!(
            "Preview encoder initialized: {}x{} @ {}fps, {}kbps, hw={}",
            self.config.width,
            self.config.height,
            self.config.fps,
            self.config.bitrate / 1000,
            self.encoder.is_hw_active()
        );

        Ok(())
    }

    /// Render frame at given time and encode to H.264
    ///
    /// Uses GpuExportPipeline for all GPU processing, then encodes to H.264.
    /// Returns H.264 NAL units ready for WebSocket streaming.
    #[cfg(target_os = "macos")]
    pub fn render_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<PreviewFrame>> {
        self.ensure_encoder_initialized()?;

        // Use GpuExportPipeline to process frame to an encoder-ready GPU handle.
        let gpu_handle = self
            .gpu_pipeline
            .process_frame_to_gpu_handle(time, background_color)?;

        // Encode to H.264 through the platform GPU bridge handle.
        let pts = (self.frame_count as f64 * 1_000_000.0 / self.config.fps) as i64;
        let packets = self
            .encoder
            .encode_frame_gpu(gpu_handle.native_encoder_handle()?, pts)?;

        self.frame_count += 1;

        Ok(packets.iter().map(PreviewFrame::from).collect())
    }

    /// Render frame (non-macOS rollback path).
    #[cfg(not(target_os = "macos"))]
    pub fn render_frame(
        &mut self,
        _time: f64,
        _background_color: [f32; 4],
    ) -> Result<Vec<PreviewFrame>> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy GPU preview encoding is not implemented on {}",
            std::env::consts::OS
        )))
    }

    /// Render frame with detailed timing breakdown (macOS zero-copy)
    #[cfg(target_os = "macos")]
    pub fn render_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<(Vec<PreviewFrame>, GpuPipelineTiming, u64)> {
        self.ensure_encoder_initialized()?;

        let gpu_result = self
            .gpu_pipeline
            .process_frame_to_gpu_handle_timed(time, background_color)?;

        let timing = gpu_result.timing;
        let gpu_handle = gpu_result.gpu_handle.ok_or_else(|| {
            Error::UnsupportedCapability(
                "GPU preview output did not return an encoder-ready handle".to_string(),
            )
        })?;

        // PTS based on actual timeline time, not frame_count
        let pts = (time * 1_000_000.0) as i64;
        let encode_start = std::time::Instant::now();
        let packets = self
            .encoder
            .encode_frame_gpu(gpu_handle.native_encoder_handle()?, pts)?;
        let encode_ns = encode_start.elapsed().as_nanos() as u64;

        self.frame_count += 1;

        Ok((
            packets.iter().map(PreviewFrame::from).collect(),
            timing,
            encode_ns,
        ))
    }

    /// Render a GPU-resident frame with detailed timing breakdown.
    #[cfg(target_os = "macos")]
    pub fn render_gpu_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<(VideoGpuFrame, GpuPipelineTiming)> {
        let gpu_result = self
            .gpu_pipeline
            .process_frame_to_gpu_handle_timed(time, background_color)?;
        let timing = gpu_result.timing;
        let gpu_handle = gpu_result.gpu_handle.ok_or_else(|| {
            Error::UnsupportedCapability(
                "GPU preview output did not return an encoder-ready handle".to_string(),
            )
        })?;

        let frame = VideoGpuFrame {
            lease: GpuFrameLease::new(gpu_handle),
            pts: (time * 1_000_000.0) as i64,
            duration: (1_000_000.0 / self.config.fps) as i64,
            frame_index: self.frame_count,
            width: gpu_result.width,
            height: gpu_result.height,
            force_keyframe: false,
            diagnostics: None,
        };

        self.frame_count += 1;
        Ok((frame, timing))
    }

    /// Render a GPU-resident frame with detailed timing breakdown.
    #[cfg(not(target_os = "macos"))]
    pub fn render_gpu_frame_timed(
        &mut self,
        _time: f64,
        _background_color: [f32; 4],
    ) -> Result<(VideoGpuFrame, GpuPipelineTiming)> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy GPU preview output is not implemented on {}",
            std::env::consts::OS
        )))
    }

    /// Render frame with detailed timing breakdown (non-macOS rollback path)
    #[cfg(not(target_os = "macos"))]
    pub fn render_frame_timed(
        &mut self,
        _time: f64,
        _background_color: [f32; 4],
    ) -> Result<(Vec<PreviewFrame>, GpuPipelineTiming, u64)> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy GPU preview encoding is not implemented on {}",
            std::env::consts::OS
        )))
    }

    /// Flush encoder and get remaining packets
    pub fn flush(&mut self) -> Result<Vec<PreviewFrame>> {
        let packets = self.encoder.flush()?;
        Ok(packets.iter().map(PreviewFrame::from).collect())
    }

    /// Reset frame counter (e.g., on seek)
    pub fn reset_frame_counter(&mut self) {
        self.frame_count = 0;
    }

    /// Check if hardware encoding is active
    pub fn is_hw_active(&self) -> bool {
        self.encoder.is_hw_active()
    }

    /// Close all resources, returning encoder to pool
    pub fn close(&mut self) {
        self.gpu_pipeline.close();

        // Return encoder to pool if it was initialized
        if self.encoder_initialized {
            let mut encoder_config = EncoderConfig::new(
                self.config.width,
                self.config.height,
                self.config.fps,
                VideoCodec::H264,
            );
            encoder_config.gop_size = Some(self.config.gop_size);
            encoder_config.max_b_frames = Some(0);

            // Swap out the encoder and release to pool
            let encoder = std::mem::take(&mut self.encoder);
            global_encoder_pool().release(encoder, encoder_config);
            self.encoder_initialized = false;
        }
    }
}

impl Drop for PreviewPipeline {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_config_default() {
        let config = PreviewPipelineConfig::default();
        assert_eq!(config.width, 1920);
        assert_eq!(config.height, 1080);
        assert_eq!(config.fps, 30.0);
        assert_eq!(config.bitrate, 2_000_000);
    }
}
