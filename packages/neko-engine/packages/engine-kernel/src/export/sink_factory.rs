//! Export sink construction boundary.

use crate::encoder::PipelineConfig;
use crate::error::Result;
use crate::services::pipeline_sink::PipelineSink;

/// Export-specific sink contract.
///
/// Export orchestration needs the shared `PipelineSink` lifecycle plus an
/// explicit cancellation path. Keeping this as a narrow sub-trait avoids
/// depending on the muxer concrete type from `ExportService`.
pub trait ExportSink: PipelineSink {
    /// Cancel and finalize the export sink.
    fn cancel(&self) -> Result<()>;
}

/// Factory for export pipeline sinks.
pub trait ExportSinkFactory: Send + Sync {
    /// Create a pipeline sink for one export job.
    fn create(&self, config: PipelineConfig) -> Result<Box<dyn ExportSink>>;
}

/// Default export sink factory.
pub struct DefaultExportSinkFactory;

impl ExportSinkFactory for DefaultExportSinkFactory {
    fn create(&self, config: PipelineConfig) -> Result<Box<dyn ExportSink>> {
        Ok(Box::new(crate::services::MuxerSink::new(config)?))
    }
}

impl ExportSink for crate::services::MuxerSink {
    fn cancel(&self) -> Result<()> {
        crate::services::MuxerSink::cancel(self)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::error::{Error, Result};
    use crate::services::pipeline_sink::PipelineSink;
    use neko_engine_types::{
        AudioCodec, AudioEncodedPacket, AudioOutput, PipelineOutput, VideoOutput,
    };

    use super::*;

    #[derive(Default)]
    struct FakeExportSink {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl FakeExportSink {
        fn record(&self, event: &'static str) -> Result<()> {
            self.events
                .lock()
                .map_err(|_| Error::Other("test events lock poisoned".to_string()))?
                .push(event);
            Ok(())
        }
    }

    impl PipelineSink for FakeExportSink {
        fn accepts(&self, output: &PipelineOutput) -> bool {
            matches!(output.as_video(), Some(VideoOutput::GpuFrame(_)))
                || matches!(output, PipelineOutput::Audio(AudioOutput::EncodedPacket(_)))
        }

        fn submit(&self, output: PipelineOutput) -> Result<()> {
            match output {
                PipelineOutput::Audio(_) => self.record("audio"),
                PipelineOutput::Video(_) => self.record("video"),
            }
        }

        fn flush(&self) -> Result<()> {
            self.record("flush")
        }

        fn close(&self) -> Result<()> {
            self.record("close")
        }
    }

    impl ExportSink for FakeExportSink {
        fn cancel(&self) -> Result<()> {
            self.record("cancel")
        }
    }

    struct FakeExportSinkFactory {
        events: Arc<Mutex<Vec<&'static str>>>,
    }

    impl ExportSinkFactory for FakeExportSinkFactory {
        fn create(&self, _config: PipelineConfig) -> Result<Box<dyn ExportSink>> {
            self.events
                .lock()
                .map_err(|_| Error::Other("test events lock poisoned".to_string()))?
                .push("create");
            Ok(Box::new(FakeExportSink {
                events: Arc::clone(&self.events),
            }))
        }
    }

    #[test]
    fn export_sink_factory_can_inject_fake_sink_without_muxer() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let factory = FakeExportSinkFactory {
            events: Arc::clone(&events),
        };

        let sink = factory.create(PipelineConfig::default()).unwrap();
        let output = PipelineOutput::Audio(AudioOutput::EncodedPacket(AudioEncodedPacket {
            data: vec![1, 2, 3],
            pts: 0,
            dts: 0,
            duration: 1,
            codec: AudioCodec::Aac,
            stream_index: 1,
        }));

        assert!(sink.accepts(&output));
        assert!(!sink.accepts(&PipelineOutput::video(VideoOutput::RawFrame(
            neko_engine_types::VideoRawFrame {
                data: vec![0, 0, 0, 255],
                width: 1,
                height: 1,
                format: neko_engine_types::FrameFormat::Rgba,
                pts: 0,
                duration: 1,
            },
        ))));

        sink.submit(output).unwrap();
        sink.flush().unwrap();
        sink.close().unwrap();

        assert_eq!(
            *events.lock().unwrap(),
            vec!["create", "audio", "flush", "close"]
        );
    }
}
