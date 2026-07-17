//! Audio service trait

use crate::domain::{AudioTranscodeOptions, LoudnessAnalysis, SilenceAnalysis};
use crate::error::Result;
use crate::services::IStreamPlayback;
use async_trait::async_trait;
use neko_engine_types::{MediaInfo, StreamId, WaveformData};
use std::path::Path;
use tokio::sync::broadcast;

use super::super::domain::FrameData;
use super::audio_mixdown::MixdownConfig;

/// Audio service interface
///
/// Handles audio-specific operations: probing, transcoding, streaming,
/// and waveform generation.
/// Stream playback control (stop/pause/resume/speed/seek/loop) is inherited from `IStreamPlayback`.
#[async_trait]
pub trait IAudioService: IStreamPlayback {
    /// Probe audio file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Transcode audio file to a different format/codec/bitrate
    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: AudioTranscodeOptions,
    ) -> Result<()>;

    /// Start an audio stream
    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Start a project mix stream from a full mixdown render config.
    async fn start_mix_stream(
        &self,
        config: MixdownConfig,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Generate waveform visualization data
    async fn generate_waveform(&self, source: &Path) -> Result<WaveformData>;

    /// Analyze audio loudness per ITU-R BS.1770-4 (EBU R128).
    ///
    /// Returns integrated LUFS, true peak, loudness range,
    /// and recommended gain to reach `target_lufs`.
    async fn analyze_loudness(&self, path: &Path, target_lufs: f64) -> Result<LoudnessAnalysis>;

    /// Detect silence regions in an audio file.
    ///
    /// Returns a list of contiguous silent regions where RMS is below
    /// `threshold_dbfs` for at least `min_duration` seconds.
    async fn detect_silence(
        &self,
        path: &Path,
        threshold_dbfs: f64,
        min_duration: f64,
    ) -> Result<SilenceAnalysis>;

    /// Hot-update a running project mix stream with a full replacement config.
    async fn update_mixdown(
        &self,
        stream_id: &StreamId,
        config: MixdownConfig,
    ) -> Result<Vec<String>>;
}
