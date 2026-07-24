//! Export backend contracts and default adapters.
//!
//! These traits keep export orchestration focused on job state and progress.
//! Concrete GPU renderers, audio encoders, and mux workers stay behind adapter
//! boundaries so later GPU/codec extraction can move implementation crates
//! without rewriting `ExportService`.

// TODO(P2): encode-only backend contracts remain as the migration adapter for
// the legacy async export pipeline until zero-copy sink export covers all paths.
#![allow(dead_code)]

use std::sync::Arc;

use crate::encoder::{AsyncExportPipeline, CompositedFrame, EncodedPacket, PipelineConfig};
use crate::error::{Error, Result};
use neko_engine_audio::{AudioEncoder, FfmpegAudioEncoder};
use neko_engine_gpu::{GpuBudgetController, GpuContext};
use neko_engine_types::{AudioEncoderConfig, GpuOutputHandle, SampleFormat};

use super::audio_mixer::{AudioMixer, MixedAudioFrame};
use super::gpu_export_pipeline::GpuExportPipeline;
use super::sink_factory::{DefaultExportSinkFactory, ExportSinkFactory};
use super::types::{ExportJobConfig, ExportMetadata};
use neko_engine_gpu::GpuPipelineTiming;

/// Frame output produced by the export render backend.
pub struct ExportRenderedFrame {
    /// CPU NV12 data for non-zero-copy paths. Current production export keeps
    /// this empty on macOS and requires `gpu_handle`.
    pub nv12_data: Vec<u8>,
    /// Native GPU output handle for zero-copy encode/mux submission.
    pub gpu_handle: GpuOutputHandle,
    /// Detailed GPU timing for progress stats.
    pub timing: GpuPipelineTiming,
}

/// GPU render backend used by export orchestration.
pub trait ExportRenderBackend {
    /// Initialize decoders and renderer resources.
    fn initialize(&mut self) -> Result<()>;

    /// Total frame count for this export job.
    fn total_frames(&self) -> u64;

    /// Output dimensions in pixels.
    fn output_dimensions(&self) -> (u32, u32);

    /// Render one frame at `time` into zero-copy output when supported.
    fn render_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<ExportRenderedFrame>;
}

/// Factory for render backends.
pub trait ExportRenderBackendFactory: Send + Sync {
    /// Create a render backend for one export job.
    fn create(&self, config: &ExportJobConfig) -> Result<Box<dyn ExportRenderBackend>>;

    /// GPU budget controller used to schedule export GPU work.
    fn budget_controller(&self) -> GpuBudgetController;

    /// Observe submitted GPU work completion for queue-pressure accounting.
    fn observe_submitted_work_done(&self, pipeline_id: &str);
}

/// Audio backend used by export orchestration.
pub trait ExportAudioBackend {
    /// Output sample rate.
    fn sample_rate(&self) -> u32;

    /// Output channel count.
    fn channels(&self) -> u16;

    /// Mix one frame of audio.
    fn mix_frame(&mut self, time: f64) -> Result<Option<MixedAudioFrame>>;
}

/// Factory for audio mix backends.
pub trait ExportAudioBackendFactory: Send + Sync {
    /// Create a backend for one export job. `Ok(None)` means the timeline has
    /// no audible input.
    fn create(&self, config: &ExportJobConfig) -> Result<Option<Box<dyn ExportAudioBackend>>>;
}

/// Encodes mixed audio frames into muxable packets.
pub trait ExportAudioEncodeBackend {
    /// Encode one mixed frame.
    fn encode_frame(&mut self, frame: &MixedAudioFrame) -> Result<Vec<EncodedPacket>>;

    /// Flush buffered audio packets.
    fn flush(&mut self) -> Result<Vec<EncodedPacket>>;
}

/// Factory for audio encode backends.
pub trait ExportAudioEncodeBackendFactory: Send + Sync {
    /// Create an encoder for the selected audio stream.
    fn create(&self, config: AudioEncoderConfig) -> Result<Box<dyn ExportAudioEncodeBackend>>;
}

/// Encode-only export backend wrapping the legacy async encode/mux pipeline.
pub trait ExportEncodeBackend {
    /// Submit one pre-composited frame to the encoder.
    fn submit_composited(&self, frame: CompositedFrame) -> Result<()>;

    /// Submit one encoded audio packet to the mux stage.
    fn submit_audio_packet(&self, packet: EncodedPacket) -> Result<()>;

    /// Signal that all audio packets have been submitted.
    fn finish_audio(&self) -> Result<()>;

    /// Cancel the backend.
    fn cancel(&self);

    /// Wait for backend completion.
    fn wait(self: Box<Self>) -> Result<()>;
}

/// Factory for encode-only export backends.
pub trait ExportEncodeBackendFactory: Send + Sync {
    /// Create an encode-only backend for one export job.
    fn create_encode_only(&self, config: PipelineConfig) -> Result<Box<dyn ExportEncodeBackend>>;
}

/// Combined dependency set used by `ExportService`.
pub struct ExportBackendBundle {
    /// Render backend factory.
    pub render_factory: Arc<dyn ExportRenderBackendFactory>,
    /// Audio mix backend factory.
    pub audio_factory: Arc<dyn ExportAudioBackendFactory>,
    /// Audio encode backend factory.
    pub audio_encode_factory: Arc<dyn ExportAudioEncodeBackendFactory>,
    /// Encode-only backend factory for legacy async encode/mux paths.
    pub encode_factory: Arc<dyn ExportEncodeBackendFactory>,
    /// Sink factory for the current zero-copy sink path.
    pub sink_factory: Arc<dyn ExportSinkFactory>,
}

impl ExportBackendBundle {
    /// Create production backends using the existing kernel implementations.
    pub fn with_gpu_context(gpu_ctx: Arc<GpuContext>) -> Self {
        Self {
            render_factory: Arc::new(DefaultExportRenderBackendFactory::new(gpu_ctx)),
            audio_factory: Arc::new(DefaultExportAudioBackendFactory),
            audio_encode_factory: Arc::new(DefaultExportAudioEncodeBackendFactory),
            encode_factory: Arc::new(DefaultExportEncodeBackendFactory),
            sink_factory: Arc::new(DefaultExportSinkFactory),
        }
    }

    /// Create production backends with a custom sink factory.
    pub fn with_gpu_context_and_sink_factory(
        gpu_ctx: Arc<GpuContext>,
        sink_factory: Arc<dyn ExportSinkFactory>,
    ) -> Self {
        Self {
            sink_factory,
            ..Self::with_gpu_context(gpu_ctx)
        }
    }
}

/// Production render backend factory.
pub struct DefaultExportRenderBackendFactory {
    gpu_ctx: Arc<GpuContext>,
}

impl DefaultExportRenderBackendFactory {
    /// Create a default render backend factory.
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        Self { gpu_ctx }
    }
}

impl ExportRenderBackendFactory for DefaultExportRenderBackendFactory {
    fn create(&self, config: &ExportJobConfig) -> Result<Box<dyn ExportRenderBackend>> {
        Ok(Box::new(DefaultExportRenderBackend {
            pipeline: GpuExportPipeline::new(
                config.timeline.clone(),
                config.settings.clone(),
                Arc::clone(&self.gpu_ctx),
            )?,
        }))
    }

    fn budget_controller(&self) -> GpuBudgetController {
        self.gpu_ctx.budget_controller().clone()
    }

    fn observe_submitted_work_done(&self, pipeline_id: &str) {
        self.gpu_ctx
            .budget_controller()
            .observe_submitted_work_done(
                pipeline_id.to_string(),
                neko_engine_gpu::PipelinePriority::Export,
                self.gpu_ctx.queue(),
            );
    }
}

struct DefaultExportRenderBackend {
    pipeline: GpuExportPipeline,
}

impl ExportRenderBackend for DefaultExportRenderBackend {
    fn initialize(&mut self) -> Result<()> {
        self.pipeline.initialize()
    }

    fn total_frames(&self) -> u64 {
        self.pipeline.total_frames()
    }

    fn output_dimensions(&self) -> (u32, u32) {
        self.pipeline.output_dimensions()
    }

    #[cfg(target_os = "macos")]
    fn render_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<ExportRenderedFrame> {
        let result = self
            .pipeline
            .process_frame_to_gpu_handle_timed(time, background_color)?;
        Ok(ExportRenderedFrame {
            nv12_data: result.data,
            gpu_handle: result.gpu_handle.ok_or_else(|| {
                Error::UnsupportedCapability(
                    "zero-copy GPU export did not return an encoder-ready handle".to_string(),
                )
            })?,
            timing: result.timing,
        })
    }

    #[cfg(not(target_os = "macos"))]
    fn render_frame(
        &mut self,
        _time: f64,
        _background_color: [f32; 4],
    ) -> Result<ExportRenderedFrame> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy GPU export output is not implemented on {}",
            std::env::consts::OS
        )))
    }
}

/// Production audio mix backend factory.
pub struct DefaultExportAudioBackendFactory;

impl ExportAudioBackendFactory for DefaultExportAudioBackendFactory {
    fn create(&self, config: &ExportJobConfig) -> Result<Option<Box<dyn ExportAudioBackend>>> {
        let mut mixer = AudioMixer::new(config.timeline.clone(), &config.settings);
        match mixer.initialize() {
            Ok(true) => Ok(Some(Box::new(DefaultExportAudioBackend { mixer }))),
            Ok(false) => Ok(None),
            Err(error) => Err(error),
        }
    }
}

struct DefaultExportAudioBackend {
    mixer: AudioMixer,
}

impl ExportAudioBackend for DefaultExportAudioBackend {
    fn sample_rate(&self) -> u32 {
        self.mixer.sample_rate()
    }

    fn channels(&self) -> u16 {
        self.mixer.channels()
    }

    fn mix_frame(&mut self, time: f64) -> Result<Option<MixedAudioFrame>> {
        self.mixer.mix_frame(time)
    }
}

/// Production audio encode backend factory.
pub struct DefaultExportAudioEncodeBackendFactory;

impl ExportAudioEncodeBackendFactory for DefaultExportAudioEncodeBackendFactory {
    fn create(&self, config: AudioEncoderConfig) -> Result<Box<dyn ExportAudioEncodeBackend>> {
        let mut encoder = FfmpegAudioEncoder::new();
        encoder.open(&config)?;
        tracing::info!(
            "Audio encoder opened: {:?}, {}Hz, {}ch",
            config.codec,
            config.sample_rate,
            config.channels
        );
        Ok(Box::new(DefaultExportAudioEncodeBackend { encoder }))
    }
}

struct DefaultExportAudioEncodeBackend {
    encoder: FfmpegAudioEncoder,
}

impl ExportAudioEncodeBackend for DefaultExportAudioEncodeBackend {
    fn encode_frame(&mut self, frame: &MixedAudioFrame) -> Result<Vec<EncodedPacket>> {
        let audio_bytes: &[u8] = bytemuck::cast_slice(&frame.data);
        Ok(self
            .encoder
            .encode_frame(audio_bytes, frame.samples)?
            .into_iter()
            .map(|packet| EncodedPacket {
                data: packet.data,
                pts: packet.pts,
                dts: packet.pts,
                is_keyframe: true,
                duration: packet.duration,
                stream_index: 1,
            })
            .collect())
    }

    fn flush(&mut self) -> Result<Vec<EncodedPacket>> {
        Ok(self
            .encoder
            .flush()?
            .into_iter()
            .map(|packet| EncodedPacket {
                data: packet.data,
                pts: packet.pts,
                dts: packet.pts,
                is_keyframe: true,
                duration: packet.duration,
                stream_index: 1,
            })
            .collect())
    }
}

/// Production encode-only backend factory for legacy async pipeline paths.
pub struct DefaultExportEncodeBackendFactory;

impl ExportEncodeBackendFactory for DefaultExportEncodeBackendFactory {
    fn create_encode_only(&self, config: PipelineConfig) -> Result<Box<dyn ExportEncodeBackend>> {
        Ok(Box::new(DefaultExportEncodeBackend {
            pipeline: AsyncExportPipeline::start_encode_only(config)?,
        }))
    }
}

struct DefaultExportEncodeBackend {
    pipeline: AsyncExportPipeline,
}

impl ExportEncodeBackend for DefaultExportEncodeBackend {
    fn submit_composited(&self, frame: CompositedFrame) -> Result<()> {
        self.pipeline.submit_composited(frame)
    }

    fn submit_audio_packet(&self, packet: EncodedPacket) -> Result<()> {
        self.pipeline.submit_audio_packet(packet)
    }

    fn finish_audio(&self) -> Result<()> {
        self.pipeline.finish_audio()
    }

    fn cancel(&self) {
        self.pipeline.cancel();
    }

    fn wait(self: Box<Self>) -> Result<()> {
        self.pipeline.wait()
    }
}

/// Build export metadata from job settings and backend output shape.
pub fn build_export_metadata(
    config: &ExportJobConfig,
    output_width: u32,
    output_height: u32,
) -> ExportMetadata {
    ExportMetadata {
        width: output_width,
        height: output_height,
        fps: config.settings.fps,
        video_bitrate: config.settings.video_bitrate.unwrap_or(5_000_000),
        audio_bitrate: config.settings.audio_bitrate.unwrap_or(128_000),
        video_codec: format!("{:?}", config.settings.video_codec),
        audio_codec: format!("{:?}", config.settings.audio_codec),
        render_mode: "wgpu".to_string(),
        hw_encoder: if config.settings.hw_encoder != neko_engine_types::HwEncoderType::None {
            Some(format!("{:?}", config.settings.hw_encoder))
        } else {
            None
        },
    }
}

/// Build audio encoder config for a mix backend.
pub fn build_audio_encoder_config(
    config: &ExportJobConfig,
    audio: &dyn ExportAudioBackend,
) -> AudioEncoderConfig {
    AudioEncoderConfig::new(
        audio.sample_rate(),
        audio.channels(),
        config.settings.audio_codec,
    )
    .with_bitrate(config.settings.audio_bitrate.unwrap_or(128_000))
    .with_sample_format(SampleFormat::F32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Timeline;
    use crate::export::types::{ExportPreset, ExportSettings, ExportStats};
    use crate::export::{ExportSink, ExportSinkFactory};
    use crate::services::pipeline_sink::PipelineSink;
    use crate::telemetry::metrics::FrameTiming;
    use neko_engine_types::{
        AudioCodec, AudioOutput, FrameFormat, PipelineOutput, Resolution, VideoCodec, VideoOutput,
        VideoRawFrame,
    };
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Duration;
    use tokio::sync::{broadcast, RwLock};

    use crate::export::service::{ExportJob, ExportService};

    struct FakeRenderFactory {
        events: Arc<Mutex<Vec<&'static str>>>,
        budget: GpuBudgetController,
    }

    impl FakeRenderFactory {
        fn new(events: Arc<Mutex<Vec<&'static str>>>) -> Self {
            Self {
                events,
                budget: GpuBudgetController::with_defaults(),
            }
        }
    }

    impl ExportRenderBackendFactory for FakeRenderFactory {
        fn create(&self, _config: &ExportJobConfig) -> Result<Box<dyn ExportRenderBackend>> {
            self.events.lock().unwrap().push("render:create");
            Ok(Box::new(FakeRenderBackend {
                events: Arc::clone(&self.events),
                frames: 2,
            }))
        }

        fn budget_controller(&self) -> GpuBudgetController {
            self.budget.clone()
        }

        fn observe_submitted_work_done(&self, _pipeline_id: &str) {
            self.events.lock().unwrap().push("render:observe");
        }
    }

    struct FakeRenderBackend {
        events: Arc<Mutex<Vec<&'static str>>>,
        frames: u64,
    }

    impl ExportRenderBackend for FakeRenderBackend {
        fn initialize(&mut self) -> Result<()> {
            self.events.lock().unwrap().push("render:init");
            Ok(())
        }

        fn total_frames(&self) -> u64 {
            self.frames
        }

        fn output_dimensions(&self) -> (u32, u32) {
            (2, 2)
        }

        fn render_frame(
            &mut self,
            _time: f64,
            _background_color: [f32; 4],
        ) -> Result<ExportRenderedFrame> {
            self.events.lock().unwrap().push("render:frame");
            Ok(ExportRenderedFrame {
                nv12_data: Vec::new(),
                gpu_handle: GpuOutputHandle::Unsupported {
                    platform: "test",
                    reason: "fake backend handle".to_string(),
                },
                timing: GpuPipelineTiming::default(),
            })
        }
    }

    struct FakeAudioFactory;

    impl ExportAudioBackendFactory for FakeAudioFactory {
        fn create(&self, _config: &ExportJobConfig) -> Result<Option<Box<dyn ExportAudioBackend>>> {
            Ok(Some(Box::new(FakeAudioBackend { emitted: false })))
        }
    }

    struct FakeAudioBackend {
        emitted: bool,
    }

    impl ExportAudioBackend for FakeAudioBackend {
        fn sample_rate(&self) -> u32 {
            48_000
        }

        fn channels(&self) -> u16 {
            2
        }

        fn mix_frame(&mut self, _time: f64) -> Result<Option<MixedAudioFrame>> {
            if std::mem::replace(&mut self.emitted, true) {
                return Ok(None);
            }
            Ok(Some(MixedAudioFrame {
                data: vec![0.0, 0.0],
                samples: 1,
                timestamp: 0.0,
                sample_rate: 48_000,
                channels: 2,
            }))
        }
    }

    struct FakeAudioEncodeFactory;

    impl ExportAudioEncodeBackendFactory for FakeAudioEncodeFactory {
        fn create(&self, _config: AudioEncoderConfig) -> Result<Box<dyn ExportAudioEncodeBackend>> {
            Ok(Box::new(FakeAudioEncoder { flushed: false }))
        }
    }

    struct FakeAudioEncoder {
        flushed: bool,
    }

    impl ExportAudioEncodeBackend for FakeAudioEncoder {
        fn encode_frame(&mut self, _frame: &MixedAudioFrame) -> Result<Vec<EncodedPacket>> {
            Ok(vec![EncodedPacket {
                data: vec![1, 2, 3],
                pts: 0,
                dts: 0,
                is_keyframe: true,
                duration: 1,
                stream_index: 1,
            }])
        }

        fn flush(&mut self) -> Result<Vec<EncodedPacket>> {
            if std::mem::replace(&mut self.flushed, true) {
                return Ok(Vec::new());
            }
            Ok(vec![EncodedPacket {
                data: vec![4, 5],
                pts: 1,
                dts: 1,
                is_keyframe: true,
                duration: 1,
                stream_index: 1,
            }])
        }
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum AudioFailureStage {
        Mix,
        Encode,
        Submit,
        Flush,
    }

    struct FailingAudioFactory {
        stage: AudioFailureStage,
    }

    impl ExportAudioBackendFactory for FailingAudioFactory {
        fn create(&self, _config: &ExportJobConfig) -> Result<Option<Box<dyn ExportAudioBackend>>> {
            Ok(Some(Box::new(FailingAudioBackend { stage: self.stage })))
        }
    }

    struct FailingAudioBackend {
        stage: AudioFailureStage,
    }

    impl ExportAudioBackend for FailingAudioBackend {
        fn sample_rate(&self) -> u32 {
            48_000
        }

        fn channels(&self) -> u16 {
            2
        }

        fn mix_frame(&mut self, _time: f64) -> Result<Option<MixedAudioFrame>> {
            if self.stage == AudioFailureStage::Mix {
                return Err(Error::Other("injected audio mix failure".to_string()));
            }
            Ok(Some(MixedAudioFrame {
                data: vec![0.0, 0.0],
                samples: 1,
                timestamp: 0.0,
                sample_rate: 48_000,
                channels: 2,
            }))
        }
    }

    struct FailingAudioEncodeFactory {
        stage: AudioFailureStage,
    }

    impl ExportAudioEncodeBackendFactory for FailingAudioEncodeFactory {
        fn create(&self, _config: AudioEncoderConfig) -> Result<Box<dyn ExportAudioEncodeBackend>> {
            Ok(Box::new(FailingAudioEncoder { stage: self.stage }))
        }
    }

    struct FailingAudioEncoder {
        stage: AudioFailureStage,
    }

    impl ExportAudioEncodeBackend for FailingAudioEncoder {
        fn encode_frame(&mut self, _frame: &MixedAudioFrame) -> Result<Vec<EncodedPacket>> {
            if self.stage == AudioFailureStage::Encode {
                return Err(Error::Other("injected audio encode failure".to_string()));
            }
            Ok(vec![EncodedPacket {
                data: vec![1],
                pts: 0,
                dts: 0,
                is_keyframe: true,
                duration: 1,
                stream_index: 1,
            }])
        }

        fn flush(&mut self) -> Result<Vec<EncodedPacket>> {
            if self.stage == AudioFailureStage::Flush {
                return Err(Error::Other("injected audio flush failure".to_string()));
            }
            Ok(Vec::new())
        }
    }

    struct FailingSinkFactory {
        events: Arc<Mutex<Vec<&'static str>>>,
        stage: AudioFailureStage,
    }

    impl ExportSinkFactory for FailingSinkFactory {
        fn create(&self, _config: PipelineConfig) -> Result<Box<dyn ExportSink>> {
            Ok(Box::new(FailingSink {
                events: Arc::clone(&self.events),
                stage: self.stage,
            }))
        }
    }

    struct FailingSink {
        events: Arc<Mutex<Vec<&'static str>>>,
        stage: AudioFailureStage,
    }

    impl PipelineSink for FailingSink {
        fn accepts(&self, output: &PipelineOutput) -> bool {
            matches!(output.as_video(), Some(VideoOutput::GpuFrame(_)))
                || matches!(output, PipelineOutput::Audio(AudioOutput::EncodedPacket(_)))
        }

        fn submit(&self, output: PipelineOutput) -> Result<()> {
            if matches!(output, PipelineOutput::Audio(_)) && self.stage == AudioFailureStage::Submit
            {
                return Err(Error::Other("injected audio submit failure".to_string()));
            }
            self.events.lock().unwrap().push("sink:submit");
            Ok(())
        }

        fn flush(&self) -> Result<()> {
            Ok(())
        }

        fn close(&self) -> Result<()> {
            Ok(())
        }
    }

    impl ExportSink for FailingSink {
        fn cancel(&self) -> Result<()> {
            Ok(())
        }
    }

    #[derive(Default)]
    struct FakeSinkFactory {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl ExportSinkFactory for FakeSinkFactory {
        fn create(&self, _config: PipelineConfig) -> Result<Box<dyn ExportSink>> {
            self.events.lock().unwrap().push("sink:create");
            Ok(Box::new(FakeSink {
                events: Arc::clone(&self.events),
            }))
        }
    }

    struct FakeSink {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl PipelineSink for FakeSink {
        fn accepts(&self, output: &PipelineOutput) -> bool {
            matches!(output.as_video(), Some(VideoOutput::GpuFrame(_)))
                || matches!(output, PipelineOutput::Audio(AudioOutput::EncodedPacket(_)))
        }

        fn submit(&self, output: PipelineOutput) -> Result<()> {
            match output {
                PipelineOutput::Video(_) => self.events.lock().unwrap().push("sink:video"),
                PipelineOutput::Audio(_) => self.events.lock().unwrap().push("sink:audio"),
            }
            Ok(())
        }

        fn flush(&self) -> Result<()> {
            self.events.lock().unwrap().push("sink:flush");
            Ok(())
        }

        fn close(&self) -> Result<()> {
            self.events.lock().unwrap().push("sink:close");
            Ok(())
        }
    }

    impl ExportSink for FakeSink {
        fn cancel(&self) -> Result<()> {
            self.events.lock().unwrap().push("sink:cancel");
            Ok(())
        }
    }

    struct FakeEncodeFactory;

    impl ExportEncodeBackendFactory for FakeEncodeFactory {
        fn create_encode_only(
            &self,
            _config: PipelineConfig,
        ) -> Result<Box<dyn ExportEncodeBackend>> {
            Ok(Box::new(FakeEncodeBackend::default()))
        }
    }

    #[derive(Default)]
    struct FakeEncodeBackend {
        submitted: Mutex<Vec<&'static str>>,
    }

    impl ExportEncodeBackend for FakeEncodeBackend {
        fn submit_composited(&self, _frame: CompositedFrame) -> Result<()> {
            self.submitted.lock().unwrap().push("video");
            Ok(())
        }

        fn submit_audio_packet(&self, _packet: EncodedPacket) -> Result<()> {
            self.submitted.lock().unwrap().push("audio");
            Ok(())
        }

        fn finish_audio(&self) -> Result<()> {
            self.submitted.lock().unwrap().push("audio-finish");
            Ok(())
        }

        fn cancel(&self) {}

        fn wait(self: Box<Self>) -> Result<()> {
            Ok(())
        }
    }

    fn test_config() -> ExportJobConfig {
        let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
        timeline.duration = 2.0 / 30.0;
        ExportJobConfig {
            job_id: "fake-export".to_string(),
            output_path: "/tmp/fake-export.mp4".to_string(),
            settings: ExportSettings {
                width: 2,
                height: 2,
                fps: 30.0,
                video_codec: VideoCodec::H264,
                video_bitrate: Some(1_000),
                audio_codec: AudioCodec::Aac,
                audio_bitrate: Some(128_000),
                audio_sample_rate: 48_000,
                hw_encoder: neko_engine_types::HwEncoderType::None,
                time_range: None,
                preset: ExportPreset::Medium,
                use_zero_copy_gpu: true,
            },
            timeline,
        }
    }

    #[test]
    fn export_worker_uses_fake_backends_without_gpu_or_muxer() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let render_factory = Arc::new(FakeRenderFactory::new(Arc::clone(&events)));
        let sink_factory = Arc::new(FakeSinkFactory {
            events: Arc::clone(&events),
        });
        let backends = Arc::new(ExportBackendBundle {
            render_factory,
            audio_factory: Arc::new(FakeAudioFactory),
            audio_encode_factory: Arc::new(FakeAudioEncodeFactory),
            encode_factory: Arc::new(FakeEncodeFactory),
            sink_factory,
        });

        let config = test_config();
        let job = ExportJob::new(config.clone(), 2);
        let cancel = Arc::clone(&job.cancel_flag);
        let jobs = Arc::new(RwLock::new(HashMap::new()));
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        rt.block_on(async {
            jobs.write().await.insert(config.job_id.clone(), job);
        });
        let (progress_tx, _) = broadcast::channel(8);

        let _guard = rt.enter();
        ExportService::export_worker_sync(config, jobs, progress_tx, backends, cancel)
            .expect("fake export");

        let events = events.lock().unwrap().clone();
        assert!(events.contains(&"render:create"));
        assert!(events.contains(&"render:init"));
        assert!(events.contains(&"sink:create"));
        assert_eq!(
            events
                .iter()
                .filter(|&&event| event == "sink:video")
                .count(),
            2
        );
        assert!(
            events
                .iter()
                .filter(|&&event| event == "sink:audio")
                .count()
                >= 2,
            "expected encoded and flushed audio packets"
        );
        assert!(events.contains(&"sink:close"));
    }

    #[test]
    fn export_worker_propagates_audio_mix_failure() {
        assert_worker_audio_failure_is_visible(AudioFailureStage::Mix, "audio mix");
    }

    #[test]
    fn export_worker_propagates_audio_encode_failure() {
        assert_worker_audio_failure_is_visible(AudioFailureStage::Encode, "audio encode");
    }

    #[test]
    fn export_worker_propagates_audio_submit_failure() {
        assert_worker_audio_failure_is_visible(AudioFailureStage::Submit, "audio submit");
    }

    #[test]
    fn export_worker_propagates_audio_flush_failure() {
        assert_worker_audio_failure_is_visible(AudioFailureStage::Flush, "audio flush");
    }

    fn assert_worker_audio_failure_is_visible(stage: AudioFailureStage, expected: &str) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let backends = Arc::new(ExportBackendBundle {
            render_factory: Arc::new(FakeRenderFactory::new(Arc::clone(&events))),
            audio_factory: Arc::new(FailingAudioFactory { stage }),
            audio_encode_factory: Arc::new(FailingAudioEncodeFactory { stage }),
            encode_factory: Arc::new(FakeEncodeFactory),
            sink_factory: Arc::new(FailingSinkFactory { events, stage }),
        });
        let config = test_config();
        let job = ExportJob::new(config.clone(), 2);
        let cancel = Arc::clone(&job.cancel_flag);
        let jobs = Arc::new(RwLock::new(HashMap::new()));
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        rt.block_on(async {
            jobs.write().await.insert(config.job_id.clone(), job);
        });
        let (progress_tx, _) = broadcast::channel(8);

        let _guard = rt.enter();
        let error = ExportService::export_worker_sync(config, jobs, progress_tx, backends, cancel)
            .expect_err("audio pipeline failure must fail the export");

        assert!(
            error.to_string().contains(expected),
            "unexpected {stage:?} error: {error}"
        );
    }

    #[test]
    fn fake_encode_backend_accepts_composited_and_audio_without_async_pipeline() {
        let factory = FakeEncodeFactory;
        let backend = factory
            .create_encode_only(PipelineConfig::default())
            .expect("fake backend");

        backend
            .submit_composited(CompositedFrame {
                index: 0,
                pts: 0,
                data: vec![0; 6],
                width: 2,
                height: 2,
                gpu_handle: None,
            })
            .expect("submit video");
        backend
            .submit_audio_packet(EncodedPacket {
                data: vec![1],
                pts: 0,
                dts: 0,
                is_keyframe: true,
                duration: 1,
                stream_index: 1,
            })
            .expect("submit audio");
        backend.finish_audio().expect("finish audio");
        backend.wait().expect("wait");
    }

    #[test]
    fn fake_sink_rejects_cpu_video_output_shape() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = FakeSink { events };
        assert!(!sink.accepts(&PipelineOutput::video(VideoOutput::RawFrame(
            VideoRawFrame {
                data: vec![0, 0, 0, 255],
                width: 1,
                height: 1,
                format: FrameFormat::Rgba,
                pts: 0,
                duration: 1,
            },
        ))));
    }

    #[test]
    fn build_export_metadata_preserves_public_shape() {
        let config = test_config();
        let metadata = build_export_metadata(&config, 2, 2);
        assert_eq!(metadata.width, 2);
        assert_eq!(metadata.height, 2);
        assert_eq!(metadata.render_mode, "wgpu");
    }

    #[test]
    fn export_stats_can_be_constructed_for_fake_worker_progress() {
        let timing = FrameTiming {
            total_ns: Duration::from_millis(1).as_nanos() as u64,
            ..Default::default()
        };
        let stats = ExportStats {
            encode_time_ms: timing.total_ns as f64 / 1_000_000.0,
            ..Default::default()
        };
        assert_eq!(stats.encode_time_ms, 1.0);
    }
}
