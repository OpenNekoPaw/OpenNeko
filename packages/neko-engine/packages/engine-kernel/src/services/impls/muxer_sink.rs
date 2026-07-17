//! Export muxer sink.
//!
//! `MuxerSink` keeps export submission behind the shared `PipelineSink`
//! contract while delegating encode/mux internals to `AsyncExportPipeline`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::thread::{self, JoinHandle};

use crossbeam_channel::{bounded, Receiver, Sender};

use crate::encoder::{
    AsyncExportPipeline, CompositedFrame, EncodedPacket as EncoderPacket, PipelineConfig,
};
use crate::error::{Error, Result};
use crate::services::pipeline_sink::PipelineSink;
use neko_engine_types::{
    AudioEncodedPacket, AudioOutput, PipelineOutput, VideoGpuFrame, VideoOutput,
};

/// Export sink backed by a bounded worker command queue.
pub struct MuxerSink {
    tx: Sender<MuxerCommand>,
    worker: Mutex<Option<JoinHandle<Result<()>>>>,
    command_lock: Mutex<()>,
    closed: AtomicBool,
}

enum MuxerCommand {
    SubmitVideo(CompositedFrame, Sender<Result<()>>),
    SubmitAudio(EncoderPacket, Sender<Result<()>>),
    Cancel(Sender<Result<()>>),
    Flush(Sender<Result<()>>),
    Close(Sender<Result<()>>),
}

trait MuxerBackend: Send {
    fn submit_video(&mut self, frame: CompositedFrame) -> Result<()>;
    fn submit_audio(&mut self, packet: EncoderPacket) -> Result<()>;
    fn cancel(&mut self) -> Result<()>;
    fn flush(&mut self) -> Result<()>;
    fn finish(&mut self) -> Result<()>;
}

struct AsyncPipelineMuxerBackend {
    pipeline: Option<AsyncExportPipeline>,
}

impl AsyncPipelineMuxerBackend {
    fn new(config: PipelineConfig) -> Result<Self> {
        Ok(Self {
            pipeline: Some(AsyncExportPipeline::start_encode_only(config)?),
        })
    }

    fn pipeline(&self) -> Result<&AsyncExportPipeline> {
        self.pipeline
            .as_ref()
            .ok_or_else(|| Error::AlreadyCompleted("MuxerSink already finalized".to_string()))
    }
}

impl MuxerBackend for AsyncPipelineMuxerBackend {
    fn submit_video(&mut self, frame: CompositedFrame) -> Result<()> {
        self.pipeline()?.submit_composited(frame)
    }

    fn submit_audio(&mut self, packet: EncoderPacket) -> Result<()> {
        self.pipeline()?.submit_audio_packet(packet)
    }

    fn cancel(&mut self) -> Result<()> {
        if let Some(pipeline) = self.pipeline.as_ref() {
            pipeline.cancel();
        }
        self.finish()
    }

    fn flush(&mut self) -> Result<()> {
        self.pipeline()?;
        Ok(())
    }

    fn finish(&mut self) -> Result<()> {
        if let Some(pipeline) = self.pipeline.take() {
            let _ = pipeline.finish_audio();
            pipeline.wait()?;
        }
        Ok(())
    }
}

impl MuxerSink {
    /// Create an export muxer sink.
    pub fn new(config: PipelineConfig) -> Result<Self> {
        let channel_capacity = config.encode_buffer_size.max(1);
        let backend = Box::new(AsyncPipelineMuxerBackend::new(config)?);
        Self::with_backend(backend, channel_capacity)
    }

    fn with_backend(backend: Box<dyn MuxerBackend>, channel_capacity: usize) -> Result<Self> {
        let (tx, rx) = bounded::<MuxerCommand>(channel_capacity.max(1));
        let worker = thread::Builder::new()
            .name("muxer-sink".into())
            .spawn(move || muxer_worker_loop(rx, backend))
            .map_err(|e| Error::Other(format!("Failed to spawn MuxerSink worker: {}", e)))?;

        Ok(Self {
            tx,
            worker: Mutex::new(Some(worker)),
            command_lock: Mutex::new(()),
            closed: AtomicBool::new(false),
        })
    }

    /// Cancel and finalize the sink.
    pub fn cancel(&self) -> Result<()> {
        self.finish_with(MuxerCommand::Cancel, true)
    }

    fn submit_video_gpu_frame(&self, frame: VideoGpuFrame) -> Result<()> {
        let gpu_handle = frame.lease.native_encoder_handle()?;
        let composited = CompositedFrame {
            index: frame.frame_index,
            pts: frame.pts,
            data: Vec::new(),
            width: frame.width,
            height: frame.height,
            gpu_handle: Some(gpu_handle),
        };
        self.submit_command(|ack| MuxerCommand::SubmitVideo(composited, ack))
    }

    fn submit_audio_packet(&self, packet: AudioEncodedPacket) -> Result<()> {
        let packet = EncoderPacket {
            data: packet.data,
            pts: packet.pts,
            dts: packet.dts,
            is_keyframe: true,
            duration: packet.duration,
            stream_index: packet.stream_index,
        };
        self.submit_command(|ack| MuxerCommand::SubmitAudio(packet, ack))
    }

    fn submit_command(
        &self,
        command: impl FnOnce(Sender<Result<()>>) -> MuxerCommand,
    ) -> Result<()> {
        let _guard = self.lock_commands()?;
        if self.closed.load(Ordering::SeqCst) {
            return Err(Error::AlreadyCompleted("MuxerSink is closed".to_string()));
        }

        let (ack_tx, ack_rx) = bounded(1);
        self.tx
            .send(command(ack_tx))
            .map_err(|_| Error::Other("MuxerSink worker channel closed".to_string()))?;
        drop(_guard);

        recv_ack(ack_rx)
    }

    fn finish_with(
        &self,
        command: impl FnOnce(Sender<Result<()>>) -> MuxerCommand,
        terminal: bool,
    ) -> Result<()> {
        let ack_result = {
            let _guard = self.lock_commands()?;
            if self.closed.load(Ordering::SeqCst) {
                Ok(())
            } else {
                if terminal {
                    self.closed.store(true, Ordering::SeqCst);
                }
                let (ack_tx, ack_rx) = bounded(1);
                self.tx
                    .send(command(ack_tx))
                    .map_err(|_| Error::Other("MuxerSink worker channel closed".to_string()))?;
                drop(_guard);
                recv_ack(ack_rx)
            }
        };

        if terminal {
            let join_result = self.join_worker();
            ack_result.and(join_result)
        } else {
            ack_result
        }
    }

    fn join_worker(&self) -> Result<()> {
        let worker = self
            .worker
            .lock()
            .map_err(|_| Error::Other("MuxerSink worker lock poisoned".to_string()))?
            .take();

        if let Some(worker) = worker {
            match worker.join() {
                Ok(result) => result,
                Err(_) => Err(Error::Other("MuxerSink worker panicked".to_string())),
            }
        } else {
            Ok(())
        }
    }

    fn lock_commands(&self) -> Result<MutexGuard<'_, ()>> {
        self.command_lock
            .lock()
            .map_err(|_| Error::Other("MuxerSink command lock poisoned".to_string()))
    }
}

impl PipelineSink for MuxerSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(output.as_video(), Some(VideoOutput::GpuFrame(_)))
            || matches!(output, PipelineOutput::Audio(AudioOutput::EncodedPacket(_)))
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(video) => match *video {
                VideoOutput::GpuFrame(frame) => self.submit_video_gpu_frame(*frame),
                other => Err(Error::UnsupportedOutput(format!(
                    "MuxerSink accepts VideoOutput::GpuFrame or AudioOutput::EncodedPacket, got {:?}",
                    other
                ))),
            },
            PipelineOutput::Audio(AudioOutput::EncodedPacket(packet)) => {
                self.submit_audio_packet(packet)
            }
            other => Err(Error::UnsupportedOutput(format!(
                "MuxerSink accepts VideoOutput::GpuFrame or AudioOutput::EncodedPacket, got {:?}",
                other
            ))),
        }
    }

    fn flush(&self) -> Result<()> {
        self.finish_with(MuxerCommand::Flush, false)
    }

    fn close(&self) -> Result<()> {
        self.finish_with(MuxerCommand::Close, true)
    }
}

impl Drop for MuxerSink {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

fn muxer_worker_loop(rx: Receiver<MuxerCommand>, mut backend: Box<dyn MuxerBackend>) -> Result<()> {
    while let Ok(command) = rx.recv() {
        match command {
            MuxerCommand::SubmitVideo(frame, ack) => {
                let _ = ack.send(backend.submit_video(frame));
            }
            MuxerCommand::SubmitAudio(packet, ack) => {
                let _ = ack.send(backend.submit_audio(packet));
            }
            MuxerCommand::Cancel(ack) => {
                let result = backend.cancel();
                let worker_result = mirror_result(&result);
                let _ = ack.send(result);
                return worker_result;
            }
            MuxerCommand::Flush(ack) => {
                let _ = ack.send(backend.flush());
            }
            MuxerCommand::Close(ack) => {
                let result = backend.finish();
                let worker_result = mirror_result(&result);
                let _ = ack.send(result);
                return worker_result;
            }
        }
    }

    backend.finish()
}

fn recv_ack(rx: Receiver<Result<()>>) -> Result<()> {
    rx.recv()
        .map_err(|_| Error::Other("MuxerSink acknowledgement channel closed".to_string()))?
}

fn mirror_result(result: &Result<()>) -> Result<()> {
    match result {
        Ok(()) => Ok(()),
        Err(error) => Err(Error::Other(error.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use neko_engine_types::{
        GpuFrameLease, GpuOutputHandle, PipelineOutput, VideoGpuFrame, VideoOutput,
    };

    #[derive(Default)]
    struct RecordingBackend {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl RecordingBackend {
        fn with_events(events: Arc<Mutex<Vec<&'static str>>>) -> Self {
            Self { events }
        }

        fn record(&self, event: &'static str) -> Result<()> {
            self.events
                .lock()
                .map_err(|_| Error::Other("test events lock poisoned".to_string()))?
                .push(event);
            Ok(())
        }
    }

    impl MuxerBackend for RecordingBackend {
        fn submit_video(&mut self, _frame: CompositedFrame) -> Result<()> {
            self.record("video")
        }

        fn submit_audio(&mut self, _packet: EncoderPacket) -> Result<()> {
            self.record("audio")
        }

        fn cancel(&mut self) -> Result<()> {
            self.record("cancel")
        }

        fn flush(&mut self) -> Result<()> {
            self.record("flush")
        }

        fn finish(&mut self) -> Result<()> {
            self.record("finish")
        }
    }

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
            duration: 1,
            frame_index: 7,
            width: 1920,
            height: 1080,
            force_keyframe: false,
            diagnostics: None,
        }))
    }

    #[test]
    fn muxer_sink_flush_ack_keeps_worker_open() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = MuxerSink::with_backend(
            Box::new(RecordingBackend::with_events(Arc::clone(&events))),
            2,
        )
        .unwrap();

        sink.flush().unwrap();
        assert_eq!(*events.lock().unwrap(), vec!["flush"]);
        sink.submit(PipelineOutput::Audio(AudioOutput::EncodedPacket(
            AudioEncodedPacket {
                data: vec![1],
                pts: 0,
                dts: 0,
                duration: 1,
                codec: neko_engine_types::AudioCodec::Aac,
                stream_index: 1,
            },
        )))
        .unwrap();
        sink.close().unwrap();
        assert_eq!(*events.lock().unwrap(), vec!["flush", "audio", "finish"]);
    }

    #[test]
    fn muxer_sink_close_ack_is_idempotent() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = MuxerSink::with_backend(
            Box::new(RecordingBackend::with_events(Arc::clone(&events))),
            2,
        )
        .unwrap();

        sink.close().unwrap();
        sink.close().unwrap();
        assert_eq!(*events.lock().unwrap(), vec!["finish"]);
    }

    #[test]
    fn muxer_sink_fails_fast_for_unsupported_gpu_handle() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = MuxerSink::with_backend(
            Box::new(RecordingBackend::with_events(Arc::clone(&events))),
            2,
        )
        .unwrap();

        let result = sink.submit(gpu_output());
        #[cfg(target_os = "macos")]
        assert!(result.is_ok());
        #[cfg(not(target_os = "macos"))]
        assert!(matches!(
            result.unwrap_err(),
            Error::UnsupportedCapability(_)
        ));
    }
}
