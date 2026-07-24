//! AudioService implementation
//!
//! Provides audio-related operations: probing, transcoding, streaming, and waveform generation.

use crate::domain::{
    AudioTranscodeOptions, FrameData, LoudnessAnalysis, SilenceAnalysis, StreamConfig,
};
use crate::error::{Error, Result};
use crate::services::audio_mixdown::MixdownConfig;
use crate::services::impls::audio_mix_stream::start_mix_stream;
use crate::services::impls::common::{
    analyze_loudness_blocking, convert_media_info, detect_silence_blocking,
    generate_waveform_blocking,
};
use crate::services::impls::stream_loop::{
    create_stream_channels, eof_idle_wait, pack_pcm_f32le_stream_frame, ActiveStreams,
    StreamLoopHandle, StreamPlaybackDelegate, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use crate::services::{IAudioService, IStreamPlayback, ITaskService};
use async_trait::async_trait;
use neko_engine_audio::dsp::speed_resampler::SpeedResampler;
use neko_engine_audio::dsp::AudioEffect;
use neko_engine_audio::{
    dsp, AudioCodec as InternalAudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig,
    FfmpegAudioDecoder, FfmpegAudioEncoder, SampleFormat,
};
use neko_engine_gpu::GpuContext;
use neko_engine_types::{LoopRegion, MediaInfo, StreamId, WaveformData};
use neko_runtime_media::global_probe_cache;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

fn trim_frame_to_time_range(
    data: &[f32],
    frame_timestamp: f64,
    frame_samples: usize,
    sample_rate: u32,
    channels: u16,
    start: f64,
    end: f64,
) -> Option<(Vec<f32>, usize)> {
    let frame_duration = frame_samples as f64 / sample_rate as f64;
    let frame_end = frame_timestamp + frame_duration;
    if frame_end <= start || frame_timestamp >= end {
        return None;
    }

    const SAMPLE_TIME_EPSILON: f64 = 1e-9;
    let sample_start = if frame_timestamp < start {
        (((start - frame_timestamp) * sample_rate as f64) - SAMPLE_TIME_EPSILON).ceil() as usize
    } else {
        0
    };
    let sample_end = if frame_end > end {
        (((end - frame_timestamp) * sample_rate as f64) + SAMPLE_TIME_EPSILON).floor() as usize
    } else {
        frame_samples
    }
    .min(frame_samples);

    if sample_start >= sample_end {
        return None;
    }

    let ch = channels as usize;
    let data_start = sample_start * ch;
    if data_start >= data.len() {
        return None;
    }
    let data_end = (sample_end * ch).min(data.len());
    if data_start >= data_end {
        return None;
    }
    Some((
        data[data_start..data_end].to_vec(),
        (data_end - data_start) / ch,
    ))
}

/// AudioService implementation
///
/// Wraps media_service probe for audio file metadata.
/// Supports audio transcoding, PCM streaming, and waveform generation.
pub struct AudioService {
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
    /// Delegate for stream playback control (stop/pause/resume/speed/seek/loop)
    playback: StreamPlaybackDelegate,
}

impl AudioService {
    /// Create a new AudioService
    pub fn new(
        _gpu_ctx: Option<Arc<GpuContext>>,
        _task_service: Arc<dyn ITaskService + Send + Sync>,
    ) -> Self {
        let active_streams = Arc::new(ActiveStreams::new());
        let playback = StreamPlaybackDelegate::new(active_streams.clone());
        Self {
            active_streams,
            playback,
        }
    }

    /// Hot-update a running mix stream with a full replacement mixdown config.
    pub async fn update_mixdown(
        &self,
        stream_id: &StreamId,
        config: MixdownConfig,
    ) -> Result<Vec<String>> {
        self.playback
            .update_mixdown(stream_id, Arc::new(config))
            .await
    }
}

#[async_trait]
impl IStreamPlayback for AudioService {
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
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
impl IAudioService for AudioService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || global_probe_cache().probe(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(convert_media_info(info))
    }

    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: AudioTranscodeOptions,
    ) -> Result<()> {
        let input_path = source.to_string_lossy().to_string();
        let output_path = output_path.to_path_buf();

        tokio::task::spawn_blocking(move || {
            // Open decoder
            let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
            if let Some(sample_rate) = options.sample_rate {
                decoder = decoder.with_output_sample_rate(sample_rate);
            }
            if let Some(channels) = options.channels {
                decoder = decoder.with_output_channels(channels);
            }
            let audio_info = decoder.open(&input_path)?;

            // Determine codec: options.format > output extension > default
            let codec = if let Some(fmt) = options.format {
                match fmt {
                    crate::domain::AudioOutputFormat::Aac => InternalAudioCodec::Aac,
                    crate::domain::AudioOutputFormat::Mp3 => InternalAudioCodec::Mp3,
                    crate::domain::AudioOutputFormat::Opus => InternalAudioCodec::Opus,
                    crate::domain::AudioOutputFormat::Flac => InternalAudioCodec::Flac,
                    crate::domain::AudioOutputFormat::Pcm => InternalAudioCodec::Pcm,
                }
            } else {
                match output_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                    .as_deref()
                {
                    Some("aac" | "m4a") => InternalAudioCodec::Aac,
                    Some("mp3") => InternalAudioCodec::Mp3,
                    Some("flac") => InternalAudioCodec::Flac,
                    Some("opus" | "ogg") => InternalAudioCodec::Opus,
                    Some("wav" | "pcm") => InternalAudioCodec::Pcm,
                    _ => InternalAudioCodec::Aac,
                }
            };

            // Configure encoder with options
            let sample_rate = options.sample_rate.unwrap_or(audio_info.sample_rate);
            let channels = options.channels.unwrap_or(audio_info.channels);

            let mut config = AudioEncoderConfig::new(sample_rate, channels, codec);
            if let Some(bitrate) = options.bitrate {
                config = config.with_bitrate(bitrate);
            }

            let mut encoder = FfmpegAudioEncoder::new();
            encoder.open(&config)?;

            let mut effect_chain = if options.effects.is_empty() {
                None
            } else {
                Some(dsp::build_effect_chain(&options.effects)?)
            };

            if let Some((start, end)) = options.time_range {
                let valid_open_end = end.is_infinite() && end.is_sign_positive();
                if !start.is_finite()
                    || !(end.is_finite() || valid_open_end)
                    || start < 0.0
                    || end <= start
                {
                    return Err(Error::InvalidParameter(
                        "audio transcode time range requires start >= 0 and end > start"
                            .to_string(),
                    ));
                }
                if start > 0.0 {
                    decoder.seek(start)?;
                }
            }

            // Create output file
            let mut output_file = File::create(&output_path)
                .map_err(|e| Error::Other(format!("Failed to create output file: {}", e)))?;

            // Decode → encode → write loop
            while let Some(frame) = decoder.decode_next()? {
                let (mut samples, sample_count) = if let Some((start, end)) = options.time_range {
                    if frame.timestamp >= end {
                        break;
                    }
                    let decoded: &[f32] = bytemuck::cast_slice(&frame.data);
                    match trim_frame_to_time_range(
                        decoded,
                        frame.timestamp,
                        frame.samples,
                        sample_rate,
                        channels,
                        start,
                        end,
                    ) {
                        Some(trimmed) => trimmed,
                        None => continue,
                    }
                } else {
                    (bytemuck::cast_slice(&frame.data).to_vec(), frame.samples)
                };

                if let Some(chain) = effect_chain.as_mut() {
                    chain.process(&mut samples, channels, sample_rate);
                }

                let frame_data: &[u8] = bytemuck::cast_slice(&samples);

                let packets = encoder.encode_frame(frame_data, sample_count)?;
                for packet in packets {
                    output_file
                        .write_all(&packet.data)
                        .map_err(|e| Error::Other(format!("Failed to write output: {}", e)))?;
                }
            }

            // Flush encoder
            let remaining = encoder.flush()?;
            for packet in remaining {
                output_file
                    .write_all(&packet.data)
                    .map_err(|e| Error::Other(format!("Failed to write output: {}", e)))?;
            }

            output_file
                .flush()
                .map_err(|e| Error::Other(format!("Failed to flush output: {}", e)))?;

            Ok(())
        })
        .await
        .map_err(|e| Error::Other(format!("Audio transcode task failed: {}", e)))?
    }

    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let path = source.to_string_lossy().to_string();

        // Create stream channels
        let (stream_id, tx, rx, cancel, state_tx, state_rx) =
            create_stream_channels(session_id, 64, &config);

        // Spawn decode loop in a single blocking thread
        // No Opus encoding — send raw PCM f32le directly (WebView doesn't support WebCodecs AudioDecoder)
        let cancel_clone = cancel.clone();
        let streams_clone = self.active_streams.clone();
        let stream_id_clone = stream_id.clone();
        let join_handle = tokio::task::spawn_blocking(move || {
            // Initialize decoder: output F32 interleaved at 48kHz stereo
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(48000)
                .with_output_channels(2);
            let _audio_info = match decoder.open(&path) {
                Ok(info) => info,
                Err(e) => {
                    tracing::error!("Failed to open audio decoder: {}", e);
                    return;
                }
            };

            let sample_rate = 48000u32;
            let channels = 2u16;
            let ch = channels as usize;
            let output_buffer_frames: usize = 4096;
            let buf_duration = output_buffer_frames as f64 / sample_rate as f64;

            let pacer_fps = (sample_rate as f64 / output_buffer_frames as f64).min(120.0);
            let mut pacer = WallClockPacer::new(pacer_fps, 1.0);
            let resampler = SpeedResampler::new(ch);
            let mut current_speed = 1.0;
            let mut last_seen_paused = false;
            let mut last_seek_seq: u64 = 0;
            let mut content_time = 0.0;
            // Residual buffer: accumulates decoded f32 samples between iterations
            let mut residual: Vec<f32> = Vec::new();
            let mut eof_reached = false;
            // Fade-in ramp after seek: 5ms at 48kHz = 240 samples
            let fade_in_samples_total = (sample_rate as f64 * 0.005) as usize;
            let mut fade_in_remaining: usize = 0;

            loop {
                if cancel_clone.is_cancelled() {
                    break;
                }

                let state = state_rx.borrow().clone();

                // Handle seek request (dedup via seek_seq)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        let _ = AudioDecoder::seek(&mut decoder, time);
                        content_time = time;
                        residual.clear();
                        eof_reached = false;
                        pacer.reset();
                        fade_in_remaining = fade_in_samples_total;
                    }
                }

                if last_seen_paused && !state.paused {
                    pacer.reset();
                }
                last_seen_paused = state.paused;

                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    continue;
                }

                // Update speed if changed
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.update_speed(current_speed);
                    residual.clear();
                }

                // Determine how many source frames we need for this output buffer
                let source_frames_needed =
                    (output_buffer_frames as f64 * current_speed).ceil() as usize;
                let source_samples_needed = source_frames_needed * ch;

                // Fill residual from decoder until we have enough
                while residual.len() < source_samples_needed && !eof_reached {
                    match AudioDecoder::decode_next(&mut decoder) {
                        Ok(Some(frame)) => {
                            let mut pcm_data = frame.data.clone();

                            // Apply fade-in ramp after seek
                            if fade_in_remaining > 0 {
                                let total = fade_in_samples_total;
                                let samples: &mut [f32] = bytemuck::cast_slice_mut(&mut pcm_data);
                                let num_samples = samples.len() / ch;
                                for i in 0..num_samples {
                                    if fade_in_remaining == 0 {
                                        break;
                                    }
                                    let progress = 1.0 - (fade_in_remaining as f32 / total as f32);
                                    let gain = progress * progress;
                                    for c in 0..ch {
                                        samples[i * ch + c] *= gain;
                                    }
                                    fade_in_remaining -= 1;
                                }
                            }

                            let samples: &[f32] = bytemuck::cast_slice(&pcm_data);
                            residual.extend_from_slice(samples);
                        }
                        Ok(None) => {
                            eof_reached = true;
                        }
                        Err(e) => {
                            tracing::warn!("Audio stream decode error: {}", e);
                            eof_reached = true;
                        }
                    }
                }

                if residual.is_empty() && eof_reached {
                    // True EOF — check loop or idle wait
                    let state = state_rx.borrow().clone();
                    if let Some(ref region) = state.loop_region {
                        let _ = AudioDecoder::seek(&mut decoder, region.in_point);
                        content_time = region.in_point;
                        eof_reached = false;
                        pacer.reset();
                        continue;
                    } else {
                        match eof_idle_wait(
                            &cancel_clone,
                            &state_rx,
                            last_seek_seq,
                            EOF_IDLE_TIMEOUT,
                        ) {
                            Some(time) => {
                                let _ = AudioDecoder::seek(&mut decoder, time);
                                content_time = time;
                                eof_reached = false;
                                pacer.reset();
                                continue;
                            }
                            None => break,
                        }
                    }
                }

                // Consume source_samples_needed from residual (or all remaining if near EOF)
                let consume = source_samples_needed.min(residual.len());
                let source_chunk: Vec<f32> = residual.drain(..consume).collect();
                let source_frames = consume / ch;

                // Resample to output_buffer_frames
                let speed_is_unity = (current_speed - 1.0).abs() < 0.001;
                let output_data = if speed_is_unity || source_frames == output_buffer_frames {
                    source_chunk
                } else {
                    resampler.resample(&source_chunk, output_buffer_frames)
                };

                let content_advance = buf_duration * current_speed;
                let pcm_bytes: &[u8] = bytemuck::cast_slice(&output_data);
                let packed = pack_pcm_f32le_stream_frame(
                    pcm_bytes,
                    content_time,
                    content_advance,
                    sample_rate,
                    channels,
                );
                let _ = tx.send(packed);
                content_time += content_advance;

                pacer.wait_for_next_frame();
            }

            // Self-cleanup: remove handle from ActiveStreams when loop exits
            let rt = tokio::runtime::Handle::current();
            rt.block_on(streams_clone.remove(stream_id_clone.as_str()));
        });

        // Store handle
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        self.active_streams.insert(handle).await;

        Ok((stream_id, rx))
    }

    async fn start_mix_stream(
        &self,
        config: MixdownConfig,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        start_mix_stream(config, session_id, self.active_streams.clone()).await
    }

    async fn generate_waveform(&self, source: &Path) -> Result<WaveformData> {
        let path = source.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || generate_waveform_blocking(&path))
            .await
            .map_err(|e| Error::Other(format!("Waveform generation task failed: {}", e)))?
    }

    async fn analyze_loudness(&self, path: &Path, target_lufs: f64) -> Result<LoudnessAnalysis> {
        let path = path.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || analyze_loudness_blocking(&path, target_lufs))
            .await
            .map_err(|e| Error::Other(format!("Loudness analysis task failed: {}", e)))?
    }

    async fn detect_silence(
        &self,
        path: &Path,
        threshold_dbfs: f64,
        min_duration: f64,
    ) -> Result<SilenceAnalysis> {
        let path = path.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || {
            detect_silence_blocking(&path, threshold_dbfs, min_duration)
        })
        .await
        .map_err(|e| Error::Other(format!("Silence detection task failed: {}", e)))?
    }

    async fn update_mixdown(
        &self,
        stream_id: &StreamId,
        config: MixdownConfig,
    ) -> Result<Vec<String>> {
        AudioService::update_mixdown(self, stream_id, config).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::TaskService;
    use neko_engine_audio::dsp::AudioEffect;

    fn create_test_service() -> AudioService {
        let task_service = Arc::new(TaskService::new());
        AudioService::new(None, task_service)
    }

    fn optional_audio_fixture(env_var: &str, file_name: &str) -> Option<std::path::PathBuf> {
        let fixture_dir = std::env::var_os(env_var)?;
        let test_file = std::path::PathBuf::from(fixture_dir).join(file_name);
        if !test_file.exists() {
            eprintln!(
                "Skipping test: {}={} does not contain {}",
                env_var,
                test_file
                    .parent()
                    .map(|path| path.display().to_string())
                    .unwrap_or_default(),
                file_name
            );
            return None;
        }
        Some(test_file)
    }

    #[tokio::test]
    async fn test_audio_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.mp3")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_generate_waveform_nonexistent() {
        let service = create_test_service();
        let result = service
            .generate_waveform(Path::new("/nonexistent/file.mp3"))
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_transcode_nonexistent() {
        let service = create_test_service();
        let result = service
            .transcode(
                Path::new("/nonexistent/file.mp3"),
                Path::new("/tmp/out.aac"),
                AudioTranscodeOptions::default(),
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_start_stream_nonexistent() {
        let service = create_test_service();
        let result = service
            .start_stream(
                Path::new("/nonexistent/file.mp3"),
                "session1",
                StreamConfig::default(),
            )
            .await;
        // Stream creation succeeds (async), but the decode loop will fail internally
        // The stream_id is returned immediately
        assert!(result.is_ok());
        let (stream_id, _rx) = result.unwrap();
        // Stop the stream (it may have already stopped due to decode error)
        let _ = service.stop_stream(&stream_id).await;
    }

    #[tokio::test]
    async fn test_audio_service_stop_stream_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.stop_stream(&stream_id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Stream not found"));
    }

    #[tokio::test]
    async fn test_audio_service_analyze_loudness_nonexistent() {
        let service = create_test_service();
        let result = service
            .analyze_loudness(Path::new("/nonexistent/file.mp3"), -14.0)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_detect_silence_nonexistent() {
        let service = create_test_service();
        let result = service
            .detect_silence(Path::new("/nonexistent/file.mp3"), -40.0, 0.5)
            .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_audio_service_trait_object() {
        fn _assert_impl<T: IAudioService>() {}
        _assert_impl::<AudioService>();
    }

    #[test]
    fn test_trim_frame_to_time_range_keeps_partial_samples() {
        let data = vec![0.0, 0.1, 0.2, 0.3, 0.4];
        let (trimmed, samples) = trim_frame_to_time_range(&data, 1.0, 5, 10, 1, 1.1, 1.4).unwrap();

        assert_eq!(samples, 3);
        assert_eq!(trimmed, vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn test_trim_frame_to_time_range_skips_outside_frame() {
        let data = vec![0.0, 0.1, 0.2, 0.3, 0.4];
        let trimmed = trim_frame_to_time_range(&data, 1.0, 5, 10, 1, 2.0, 3.0);

        assert!(trimmed.is_none());
    }

    #[test]
    fn test_trim_frame_to_time_range_handles_truncated_frame() {
        let data = vec![0.0, 0.1, 0.2];
        let (trimmed, samples) = trim_frame_to_time_range(&data, 1.0, 5, 10, 1, 1.1, 1.5).unwrap();

        assert_eq!(samples, 2);
        assert_eq!(trimmed, vec![0.1, 0.2]);
    }

    #[test]
    fn test_transcode_effect_chain_gain_processing() {
        let mut chain = dsp::build_effect_chain(&[dsp::AudioEffectConfig {
            id: "gain".into(),
            effect_type: "gain".into(),
            enabled: true,
            params: serde_json::json!({ "gainDb": 6.0 }),
        }])
        .unwrap();
        let mut samples = vec![0.25f32, -0.25f32];

        chain.process(&mut samples, 1, 48_000);

        assert!((samples[0] - 0.5).abs() < 0.01);
        assert!((samples[1] + 0.5).abs() < 0.01);
    }

    #[test]
    fn test_stateful_effect_processing_persists_across_frames() {
        let mut chain = dsp::build_effect_chain(&[dsp::AudioEffectConfig {
            id: "delay".into(),
            effect_type: "delay".into(),
            enabled: true,
            params: serde_json::json!({
                "delayMs": 1.0,
                "feedback": 0.0,
                "wetDry": 1.0
            }),
        }])
        .unwrap();
        let sample_rate = 1_000u32;
        let mut first = vec![1.0f32];
        let mut second = vec![0.0f32];

        chain.process(&mut first, 1, sample_rate);
        chain.process(&mut second, 1, sample_rate);

        assert!(first[0].abs() < 0.001);
        assert!(second[0] > 0.9);
    }

    /// Integration test: start audio stream with real mp3 file and verify PCM f32le frames
    #[tokio::test]
    async fn test_audio_stream_real_file_mp3() {
        let Some(test_file) = optional_audio_fixture("NEKO_AUDIO_TEST_FIXTURE_DIR", "test.mp3")
        else {
            return;
        };

        let service = create_test_service();
        let result = service
            .start_stream(&test_file, "test-audio", StreamConfig::default())
            .await;
        assert!(result.is_ok(), "start_stream should succeed");

        let (stream_id, mut rx) = result.unwrap();

        // Receive a few frames and verify they have the 22-byte PCM header
        let mut frames_received = 0;
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(3));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                frame = rx.recv() => {
                    match frame {
                        Ok(f) => {
                            assert_eq!(f.format, neko_engine_types::FrameFormat::PcmF32, "Frame should be PcmF32");
                            // Wire format: pts_us(8) + duration_us(8) + sample_rate(4) + channels(2) = 22 bytes
                            assert!(f.data.len() > 22, "Frame data should have 22-byte header + PCM data");

                            // Parse header
                            let pts_us = i64::from_le_bytes(f.data[0..8].try_into().unwrap());
                            let duration_us = i64::from_le_bytes(f.data[8..16].try_into().unwrap());
                            let sample_rate = u32::from_le_bytes(f.data[16..20].try_into().unwrap());
                            let channels = u16::from_le_bytes(f.data[20..22].try_into().unwrap());

                            assert!(sample_rate > 0, "Sample rate should be > 0, got {}", sample_rate);
                            assert!(channels > 0, "Channels should be > 0, got {}", channels);
                            assert!(pts_us >= 0, "PTS should be >= 0, got {}", pts_us);
                            assert!(duration_us > 0, "Duration should be > 0, got {}", duration_us);

                            // Verify PCM payload is aligned to f32 (4 bytes)
                            let pcm_len = f.data.len() - 22;
                            assert_eq!(pcm_len % 4, 0, "PCM data should be aligned to f32 (4 bytes)");

                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(
            frames_received >= 3,
            "Should receive at least 3 PCM frames, got {}",
            frames_received
        );
        let _ = service.stop_stream(&stream_id).await;
    }

    /// Integration test: start audio stream with real aac file
    #[tokio::test]
    async fn test_audio_stream_real_file_aac() {
        let Some(test_file) = optional_audio_fixture("NEKO_AUDIO_TEST_FIXTURE_DIR", "test.aac")
        else {
            return;
        };

        let service = create_test_service();
        let result = service
            .start_stream(&test_file, "test-aac", StreamConfig::default())
            .await;
        assert!(result.is_ok(), "start_stream should succeed for aac");

        let (stream_id, mut rx) = result.unwrap();

        let mut frames_received = 0;
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(3));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                frame = rx.recv() => {
                    match frame {
                        Ok(f) => {
                            assert_eq!(f.format, neko_engine_types::FrameFormat::PcmF32);
                            assert!(f.data.len() > 22, "Frame should have 22-byte header + PCM data");
                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(
            frames_received >= 3,
            "Should receive at least 3 PCM frames from aac, got {}",
            frames_received
        );
        let _ = service.stop_stream(&stream_id).await;
    }
}
