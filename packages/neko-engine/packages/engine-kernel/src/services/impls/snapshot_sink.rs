//! Snapshot sink for one-frame terminal readback output.

use std::sync::Mutex;

use tokio::sync::oneshot;

use crate::error::{Error, Result};
use crate::services::pipeline_sink::PipelineSink;
use neko_engine_types::{FrameFormat, PipelineOutput, VideoGpuFrame, VideoOutput, VideoRawFrame};

/// Single-frame snapshot sink.
pub struct SnapshotSink {
    sender: Mutex<Option<oneshot::Sender<VideoRawFrame>>>,
}

impl SnapshotSink {
    /// Create a snapshot sink and its result receiver.
    pub fn new() -> (Self, oneshot::Receiver<VideoRawFrame>) {
        let (tx, rx) = oneshot::channel();
        (
            Self {
                sender: Mutex::new(Some(tx)),
            },
            rx,
        )
    }

    /// Receive the submitted frame.
    pub async fn recv(receiver: oneshot::Receiver<VideoRawFrame>) -> Result<VideoRawFrame> {
        receiver
            .await
            .map_err(|_| Error::Other("SnapshotSink result channel closed".to_string()))
    }

    fn submit_raw_frame(&self, frame: VideoRawFrame) -> Result<()> {
        self.complete(frame)
    }

    fn submit_gpu_frame(&self, output: VideoGpuFrame) -> Result<()> {
        let mut frame = output.lease.read_rgba8()?;
        frame.pts = output.pts;
        frame.duration = output.duration;
        self.complete(frame)
    }

    fn complete(&self, frame: VideoRawFrame) -> Result<()> {
        if frame.format != FrameFormat::Rgba {
            return Err(Error::UnsupportedOutput(format!(
                "SnapshotSink returns RGBA frames, got {:?}",
                frame.format
            )));
        }

        let sender = self
            .sender
            .lock()
            .map_err(|_| Error::Other("SnapshotSink sender lock poisoned".to_string()))?
            .take()
            .ok_or_else(|| {
                Error::AlreadyCompleted(
                    "SnapshotSink already completed its one-frame result".to_string(),
                )
            })?;

        sender
            .send(frame)
            .map_err(|_| Error::Other("SnapshotSink receiver dropped".to_string()))
    }
}

impl PipelineSink for SnapshotSink {
    fn accepts(&self, output: &PipelineOutput) -> bool {
        matches!(
            output.as_video(),
            Some(
                VideoOutput::GpuFrame(_)
                    | VideoOutput::RawFrame(VideoRawFrame {
                        format: FrameFormat::Rgba,
                        ..
                    })
            )
        )
    }

    fn submit(&self, output: PipelineOutput) -> Result<()> {
        match output {
            PipelineOutput::Video(video) => match *video {
                VideoOutput::GpuFrame(frame) => self.submit_gpu_frame(*frame),
                VideoOutput::RawFrame(frame) => self.submit_raw_frame(frame),
                other => Err(Error::UnsupportedOutput(format!(
                    "SnapshotSink accepts VideoOutput::GpuFrame or RGBA RawFrame, got {:?}",
                    other
                ))),
            },
            other => Err(Error::UnsupportedOutput(format!(
                "SnapshotSink accepts VideoOutput::GpuFrame or RGBA RawFrame, got {:?}",
                other
            ))),
        }
    }

    fn flush(&self) -> Result<()> {
        Ok(())
    }

    fn close(&self) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgba_frame() -> VideoRawFrame {
        VideoRawFrame {
            data: vec![0, 0, 0, 255],
            width: 1,
            height: 1,
            format: FrameFormat::Rgba,
            pts: 0,
            duration: 33_333,
        }
    }

    #[test]
    fn snapshot_sink_accepts_rgba_raw_frame() {
        let (sink, _rx) = SnapshotSink::new();
        let output = PipelineOutput::video(VideoOutput::RawFrame(rgba_frame()));
        assert!(sink.accepts(&output));
    }

    #[tokio::test]
    async fn snapshot_sink_rejects_second_submit() {
        let (sink, rx) = SnapshotSink::new();
        sink.submit(PipelineOutput::video(VideoOutput::RawFrame(rgba_frame())))
            .unwrap();

        let err = sink
            .submit(PipelineOutput::video(VideoOutput::RawFrame(rgba_frame())))
            .unwrap_err();
        assert!(matches!(err, Error::AlreadyCompleted(_)));

        let frame = SnapshotSink::recv(rx).await.unwrap();
        assert_eq!(frame.data, vec![0, 0, 0, 255]);
    }

    #[tokio::test]
    async fn snapshot_sink_round_trips_existing_rgba_terminal_frame() {
        let (sink, rx) = SnapshotSink::new();
        let source = VideoRawFrame {
            data: vec![10, 20, 30, 255, 40, 50, 60, 255],
            width: 2,
            height: 1,
            format: FrameFormat::Rgba,
            pts: 123_000,
            duration: 33_333,
        };

        sink.submit(PipelineOutput::video(VideoOutput::RawFrame(source.clone())))
            .unwrap();
        let frame = SnapshotSink::recv(rx).await.unwrap();

        assert_eq!(frame.data, source.data);
        assert_eq!(frame.width, source.width);
        assert_eq!(frame.height, source.height);
        assert_eq!(frame.format, FrameFormat::Rgba);
        assert_eq!(frame.pts, source.pts);
        assert_eq!(frame.duration, source.duration);
    }

    #[tokio::test]
    async fn snapshot_sink_receives_rgba_terminal_frame_async() {
        let (sink, rx) = SnapshotSink::new();
        sink.submit(PipelineOutput::video(VideoOutput::RawFrame(rgba_frame())))
            .unwrap();

        let frame = SnapshotSink::recv(rx).await.unwrap();

        assert_eq!(frame.data, vec![0, 0, 0, 255]);
        assert_eq!(frame.width, 1);
        assert_eq!(frame.height, 1);
    }
}
