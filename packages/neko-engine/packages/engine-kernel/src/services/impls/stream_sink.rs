//! Stream sink for realtime preview output.

use std::sync::Mutex;
use std::time::Instant;

use tokio::sync::broadcast;

use crate::domain::FrameData;
use crate::encoder::{
    global_encoder_pool, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwAccelEncoder,
    HwEncoderType, VideoCodec,
};
use crate::error::{Error, Result};
use crate::preview::PreviewPipelineConfig;
use crate::services::pipeline_sink::PipelineSink;
use neko_engine_types::{FrameFormat, GpuRenderPath, PipelineOutput, VideoGpuFrame, VideoOutput};

/// Realtime H.264 stream sink.
pub struct StreamSink {
    state: Mutex<StreamSinkState>,
    tx: broadcast::Sender<FrameData>,
}

struct StreamSinkState {
    encoder: Option<HwAccelEncoder>,
    config: PreviewPipelineConfig,
    encoder_config: EncoderConfig,
    width: u32,
    height: u32,
    fps: f64,
    closed: bool,
}

impl StreamSink {
    /// Create a stream sink for preview output.
    pub fn new(config: PreviewPipelineConfig, tx: broadcast::Sender<FrameData>) -> Result<Self> {
        let encoder_config = preview_encoder_config(&config);
        let encoder = acquire_preview_encoder(&encoder_config)?;

        Ok(Self {
            state: Mutex::new(StreamSinkState {
                encoder: Some(encoder),
                width: config.width,
                height: config.height,
                fps: config.fps,
                config,
                encoder_config,
                closed: false,
            }),
            tx,
        })
    }

    /// Reconfigure encoder state, retiring the previous hardware session before
    /// opening the replacement. This avoids blocking on a new hardware encoder
    /// while the old one still owns the platform encoder resource.
    pub fn reconfigure(&self, config: PreviewPipelineConfig) -> Result<()> {
        let new_encoder_config = preview_encoder_config(&config);

        let retired = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
            if state.closed {
                return Err(Error::Other("StreamSink is closed".to_string()));
            }

            if state.encoder.is_some()
                && state.width == config.width
                && state.height == config.height
                && (state.fps - config.fps).abs() < f64::EPSILON
                && state.config.bitrate == config.bitrate
                && state.config.gop_size == config.gop_size
            {
                state.config = config;
                return Ok(());
            }

            state.encoder.take().map(|encoder| {
                (
                    encoder,
                    state.encoder_config.clone(),
                    state.width,
                    state.height,
                    state.fps,
                )
            })
        };

        if let Some((old_encoder, old_config, old_width, old_height, old_fps)) = retired {
            global_encoder_pool().discard(old_encoder);
            tracing::debug!(
                "StreamSink retired encoder before reconfigure ({}x{} @ {:.2}fps, {}bps, previous_runtime={}x{} @ {:.2}fps)",
                old_config.width,
                old_config.height,
                old_config.fps,
                old_config.bitrate,
                old_width,
                old_height,
                old_fps
            );
        }

        let new_encoder = acquire_preview_encoder(&new_encoder_config)?;

        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            global_encoder_pool().discard(new_encoder);
            return Err(Error::Other("StreamSink is closed".to_string()));
        }

        state.encoder = Some(new_encoder);
        state.width = config.width;
        state.height = config.height;
        state.fps = config.fps;
        state.config = config;
        state.encoder_config = new_encoder_config;
        Ok(())
    }

    /// Whether the encoder is currently open.
    pub fn is_open(&self) -> bool {
        self.state
            .lock()
            .map(|state| !state.closed && state.encoder.is_some())
            .unwrap_or(false)
    }

    fn submit_gpu_frame(&self, frame: VideoGpuFrame) -> Result<()> {
        let submit_started = Instant::now();
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Err(Error::Other("StreamSink is closed".to_string()));
        }

        let width = state.width;
        let height = state.height;
        let fps = state.fps;
        let gpu_handle = frame.lease.native_encoder_handle()?;
        let encoder = state.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        if !encoder.supports_gpu_input() {
            return Err(Error::UnsupportedCapability(format!(
                "encoder does not support zero-copy GPU input for '{}'",
                frame.lease.handle().kind()
            )));
        }

        let encode_started = Instant::now();
        let packets = if frame.force_keyframe {
            encoder.encode_keyframe_gpu(gpu_handle, frame.pts)?
        } else {
            encoder.encode_frame_gpu(gpu_handle, frame.pts)?
        };
        let encode_time_ms = encode_started.elapsed().as_secs_f32() * 1000.0;
        for mut packet in packets {
            packet.pts = frame.pts;
            packet.dts = frame.pts;
            if packet.duration <= 0 {
                packet.duration = frame.duration;
            }
            let mut diagnostics = frame.diagnostics.clone();
            if let Some(diagnostics) = diagnostics.as_mut() {
                diagnostics.encode_time_ms = encode_time_ms;
                diagnostics.stream_submit_time_ms = submit_started.elapsed().as_secs_f32() * 1000.0;
                diagnostics.render_path = if encoder.is_zero_copy_active() {
                    GpuRenderPath::GpuZeroCopy
                } else {
                    GpuRenderPath::PartialZeroCopy
                };
            }
            let output = pack_encoded_packet(&packet, width, height, fps, diagnostics);
            let _ = self.tx.send(output);
        }

        Ok(())
    }

    fn flush_encoder(
        &self,
        encoder: &mut HwAccelEncoder,
        width: u32,
        height: u32,
        fps: f64,
    ) -> Result<()> {
        let packets = encoder.flush()?;
        for packet in packets {
            let output = pack_encoded_packet(&packet, width, height, fps, None);
            let _ = self.tx.send(output);
        }
        Ok(())
    }
}

impl PipelineSink for StreamSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(output.as_video(), Some(VideoOutput::GpuFrame(_)))
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(video) => match *video {
                VideoOutput::GpuFrame(frame) => self.submit_gpu_frame(*frame),
                other => Err(Error::UnsupportedOutput(format!(
                    "StreamSink accepts only VideoOutput::GpuFrame, got {:?}",
                    other
                ))),
            },
            other => Err(Error::UnsupportedOutput(format!(
                "StreamSink accepts only VideoOutput::GpuFrame, got {:?}",
                other
            ))),
        }
    }

    fn flush(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Ok(());
        }

        let width = state.width;
        let height = state.height;
        let fps = state.fps;
        if let Some(encoder) = state.encoder.as_mut() {
            self.flush_encoder(encoder, width, height, fps)?;
        }
        Ok(())
    }

    fn close(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("StreamSink state lock poisoned".to_string()))?;
        if state.closed {
            return Ok(());
        }

        let width = state.width;
        let height = state.height;
        let fps = state.fps;
        let mut flush_result = Ok(());
        if let Some(mut encoder) = state.encoder.take() {
            flush_result = self.flush_encoder(&mut encoder, width, height, fps);
            global_encoder_pool().discard(encoder);
        }
        state.closed = true;
        flush_result
    }
}

impl Drop for StreamSink {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

fn preview_encoder_config(config: &PreviewPipelineConfig) -> EncoderConfig {
    let mut encoder_config =
        EncoderConfig::new(config.width, config.height, config.fps, VideoCodec::H264);
    encoder_config.bitrate = config.bitrate;
    encoder_config.gop_size = Some(config.gop_size);
    encoder_config.use_zero_copy_gpu = true;
    encoder_config.max_b_frames = Some(0);
    encoder_config.profile = Some("constrained_baseline".to_string());
    encoder_config.preset = EncoderPreset::Ultrafast;
    encoder_config.hw_encoder = HwEncoderType::Auto;
    encoder_config
}

fn acquire_preview_encoder(config: &EncoderConfig) -> Result<HwAccelEncoder> {
    let encoder = global_encoder_pool().acquire(config)?;
    if !encoder.supports_gpu_input() {
        global_encoder_pool().discard(encoder);
        return Err(Error::UnsupportedCapability(
            "zero-copy GPU preview encoding requires a hardware encoder with GPU input support"
                .to_string(),
        ));
    }
    Ok(encoder)
}

fn pack_encoded_packet(
    packet: &EncodedPacket,
    width: u32,
    height: u32,
    fps: f64,
    diagnostics: Option<neko_engine_types::RenderFrameDiagnostics>,
) -> FrameData {
    let header_size = 8 + 8 + 1 + 8;
    let duration_us = if packet.duration > 0 {
        packet.duration
    } else {
        (1_000_000.0 / fps) as i64
    };
    let mut data = Vec::with_capacity(header_size + packet.data.len());
    data.extend_from_slice(&packet.pts.to_le_bytes());
    data.extend_from_slice(&packet.dts.to_le_bytes());
    data.push(if packet.is_keyframe { 1 } else { 0 });
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&packet.data);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: packet.pts as f64 / 1_000_000.0,
        diagnostics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::{
        AudioBuffer, AudioOutput, GpuFrameLease, GpuOutputHandle, VideoGpuFrame,
    };

    #[cfg(target_os = "macos")]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::IOSurface(42)
    }

    #[cfg(not(target_os = "macos"))]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::Unsupported {
            platform: std::env::consts::OS,
            reason: "unit test".to_string(),
        }
    }

    fn gpu_output() -> PipelineOutput {
        PipelineOutput::video(VideoOutput::gpu_frame(VideoGpuFrame {
            lease: GpuFrameLease::new(test_handle()),
            pts: 0,
            duration: 33_333,
            frame_index: 0,
            width: 1920,
            height: 1080,
            force_keyframe: false,
            diagnostics: None,
        }))
    }

    #[test]
    fn stream_sink_rejects_non_gpu_output_shape_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        let output = PipelineOutput::Audio(AudioOutput::PcmF32(AudioBuffer {
            samples: vec![0.0],
            sample_rate: 48_000,
            channels: 1,
            pts: 0,
            duration: 1_000,
        }));

        assert!(!sink.accepts(&output));
        let err = sink.submit(output).unwrap_err();
        assert!(matches!(err, Error::UnsupportedOutput(_)));
    }

    #[test]
    fn stream_sink_accepts_gpu_output_shape_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        assert!(sink.accepts(&gpu_output()));
    }

    #[test]
    fn stream_sink_close_is_idempotent_without_encoder() {
        let (tx, _rx) = broadcast::channel(1);
        let sink = StreamSink {
            state: Mutex::new(StreamSinkState {
                encoder: None,
                config: PreviewPipelineConfig::default(),
                encoder_config: preview_encoder_config(&PreviewPipelineConfig::default()),
                width: 1920,
                height: 1080,
                fps: 30.0,
                closed: false,
            }),
            tx,
        };

        assert!(sink.close().is_ok());
        assert!(sink.close().is_ok());
        assert!(!sink.is_open());
    }

    #[test]
    fn stream_sink_close_flushes_encoder_before_discard() {
        let source = include_str!("stream_sink.rs");
        let close_start = source.find("fn close(&self) -> Result<()>").unwrap();
        let close_body = &source[close_start..];
        let flush_pos = close_body.find("self.flush_encoder").unwrap();
        let discard_pos = close_body.find("global_encoder_pool().discard").unwrap();
        assert!(
            flush_pos < discard_pos,
            "StreamSink::close must flush encoder buffered frames before discarding it"
        );
    }

    #[test]
    fn stream_sink_reconfigure_discards_old_encoder_before_acquiring_replacement() {
        let source = include_str!("stream_sink.rs");
        let reconfigure_start = source.find("pub fn reconfigure").unwrap();
        let reconfigure_end = source[reconfigure_start..]
            .find("/// Whether the encoder is currently open.")
            .map(|offset| reconfigure_start + offset)
            .unwrap();
        let reconfigure_body = &source[reconfigure_start..reconfigure_end];
        let discard_pos = reconfigure_body
            .find("global_encoder_pool().discard(old_encoder)")
            .unwrap();
        let acquire_pos = reconfigure_body
            .find("let new_encoder = acquire_preview_encoder")
            .unwrap();
        assert!(
            discard_pos < acquire_pos,
            "StreamSink::reconfigure must release the old hardware session before acquiring a new one"
        );
    }

    #[test]
    fn stream_sink_packs_legacy_h264_wire_format() {
        let packet = EncodedPacket {
            data: vec![1, 2, 3, 4],
            pts: 12_345,
            dts: 12_000,
            is_keyframe: true,
            duration: 33_333,
            stream_index: 0,
        };

        let frame = pack_encoded_packet(&packet, 1280, 720, 30.0, None);
        assert_eq!(frame.width, 1280);
        assert_eq!(frame.height, 720);
        assert_eq!(frame.format, FrameFormat::H264);
        assert_eq!(frame.timestamp, 0.012345);

        assert_eq!(
            i64::from_le_bytes(frame.data[0..8].try_into().unwrap()),
            12_345
        );
        assert_eq!(
            i64::from_le_bytes(frame.data[8..16].try_into().unwrap()),
            12_000
        );
        assert_eq!(frame.data[16], 1);
        assert_eq!(
            i64::from_le_bytes(frame.data[17..25].try_into().unwrap()),
            33_333
        );
        assert_eq!(&frame.data[25..], &[1, 2, 3, 4]);
    }
}
