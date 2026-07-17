//! Shared utilities for service implementations

use crate::domain::{LoudnessAnalysis, SilenceAnalysis, SilenceRegion};
use crate::error::{Error, Result};
use base64::Engine as _;
use ebur128::{EbuR128, Mode};
use neko_engine_audio::{AudioDecoder, CorruptTailPolicy, FfmpegAudioDecoder, SampleFormat};
use neko_engine_types::{CoverArtInfo, MediaInfo, WaveformData};
use neko_runtime_media::MediaInfo as InternalMediaInfo;

/// Convert internal probe MediaInfo to neko_engine_types::MediaInfo
///
/// Correctly handles audio-only files by returning empty video_streams
/// when the probe reports no video dimensions.
pub fn convert_media_info(info: InternalMediaInfo) -> MediaInfo {
    let video_streams = if info.width > 0 && info.height > 0 {
        vec![neko_engine_types::VideoStreamInfo {
            index: 0,
            codec: info.codec,
            width: info.width,
            height: info.height,
            fps: info.fps,
            bitrate: info.bitrate,
            pixel_format: "yuv420p".to_string(),
            hw_accel: None,
            frame_count: None,
            color_space: None,
            color_range: None,
        }]
    } else {
        vec![]
    };

    MediaInfo {
        duration: info.duration,
        format: info.format,
        file_size: 0,
        video_streams,
        audio_streams: if info.has_audio {
            vec![neko_engine_types::AudioStreamInfo {
                index: 0,
                codec: info.audio_codec.unwrap_or_default(),
                sample_rate: info.audio_sample_rate.unwrap_or(0),
                channels: info.audio_channels.unwrap_or(0) as u16,
                bitrate: info.audio_bitrate,
                channel_layout: None,
                language: None,
            }]
        } else {
            vec![]
        },
        subtitle_streams: info
            .subtitle_streams
            .into_iter()
            .map(|s| neko_engine_types::SubtitleStreamInfo {
                index: s.index,
                codec: s.codec,
                language: s.language,
                title: s.title,
            })
            .collect(),
        metadata: info.metadata,
        cover_art: info.cover_art.map(|ca| CoverArtInfo {
            mime_type: ca.mime_type,
            data_base64: base64::engine::general_purpose::STANDARD.encode(&ca.data),
        }),
    }
}

/// Default peaks per second for waveform generation
const PEAKS_PER_SECOND: u32 = 100;

/// Generate waveform data from an audio/video file.
///
/// This is a blocking function — call from `spawn_blocking`.
///
/// # Arguments
/// * `path` - Path to the media file (video or audio)
///
/// # Returns
/// * `WaveformData` with per-channel peak arrays at 100 peaks/sec resolution
pub fn generate_waveform_blocking(path: &str) -> Result<WaveformData> {
    // Force stereo downmix to avoid FFmpeg resampler "Input changed" errors
    // with multi-channel audio (e.g. 5.1 surround AAC)
    let mut decoder = FfmpegAudioDecoder::new()
        .with_output_format(SampleFormat::F32)
        .with_output_channels(2)
        .with_corrupt_tail_policy(CorruptTailPolicy::RecoverAfterValidOutput);
    let audio_info = decoder.open(path)?;

    let channels: usize = 2;
    let mut waveform = WaveformData::new(
        audio_info.sample_rate,
        channels as u16,
        PEAKS_PER_SECOND,
        audio_info.duration,
    );

    let samples_per_peak = audio_info.sample_rate as f64 / PEAKS_PER_SECOND as f64;
    let num_peaks = waveform.num_peaks();

    let mut sample_offset: u64 = 0;

    while let Some(frame) = decoder.decode_next()? {
        let samples: &[f32] = bytemuck::cast_slice(&frame.data);
        let frame_samples = samples.len() / channels;

        for s in 0..frame_samples {
            let global_sample = sample_offset + s as u64;
            let peak_index = (global_sample as f64 / samples_per_peak) as usize;

            if peak_index >= num_peaks {
                break;
            }

            for ch in 0..channels {
                let value = samples[s * channels + ch].abs();
                if let Some(peak) = waveform.peaks.get_mut(ch) {
                    if peak_index < peak.len() && value > peak[peak_index] {
                        peak[peak_index] = value;
                    }
                }
            }
        }

        sample_offset += frame_samples as u64;
    }

    finalize_waveform(
        &mut waveform,
        sample_offset,
        decoder.recovered_corrupt_tail(),
    );

    Ok(waveform)
}

fn finalize_waveform(
    waveform: &mut WaveformData,
    decoded_samples: u64,
    recovered_corrupt_tail: bool,
) {
    if !recovered_corrupt_tail {
        return;
    }

    waveform.duration = decoded_samples as f64 / waveform.sample_rate as f64;
    let recovered_peak_count =
        (waveform.duration * waveform.peaks_per_second as f64).ceil() as usize;
    for channel in &mut waveform.peaks {
        channel.resize(recovered_peak_count, 0.0);
    }
}

/// Analyze audio loudness per ITU-R BS.1770-4 (EBU R128).
///
/// This is a blocking function — call from `spawn_blocking`.
///
/// # Arguments
/// * `path` - Path to the media file (audio or video — FFmpeg extracts the audio stream)
/// * `target_lufs` - Target integrated loudness in LUFS (e.g. -14.0 for streaming)
///
/// # Returns
/// * `LoudnessAnalysis` with integrated LUFS, true peak, LRA, and recommended gain
pub fn analyze_loudness_blocking(path: &str, target_lufs: f64) -> Result<LoudnessAnalysis> {
    // Decode to F32 interleaved, preserve original channel count
    // (ebur128 handles channel weighting internally per BS.1770-4)
    let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
    let audio_info = decoder.open(path)?;

    let channels = audio_info.channels as u32;
    let sample_rate = audio_info.sample_rate;

    // Initialize EBU R128 meter with integrated loudness, true peak, and LRA
    let mut meter = EbuR128::new(channels, sample_rate, Mode::I | Mode::TRUE_PEAK | Mode::LRA)
        .map_err(|e| Error::Other(format!("Failed to initialize EBU R128 meter: {}", e)))?;

    // Feed all decoded frames to the meter
    while let Some(frame) = decoder.decode_next()? {
        let samples: &[f32] = bytemuck::cast_slice(&frame.data);
        meter
            .add_frames_f32(samples)
            .map_err(|e| Error::Other(format!("EBU R128 add_frames error: {}", e)))?;
    }

    // Extract integrated loudness
    let integrated_lufs = meter
        .loudness_global()
        .map_err(|e| Error::Other(format!("Failed to get integrated loudness: {}", e)))?;

    // Handle silence: ebur128 returns -f64::INFINITY for pure silence
    if integrated_lufs.is_infinite() || integrated_lufs.is_nan() {
        return Ok(LoudnessAnalysis {
            integrated_lufs: -70.0,
            true_peak_dbfs: -100.0,
            loudness_range: 0.0,
            recommended_gain: 0.0,
            target_lufs,
        });
    }

    // True peak: max across all channels (linear → dBFS)
    let mut true_peak_linear = 0.0_f64;
    for ch in 0..channels {
        let peak = meter.true_peak(ch).map_err(|e| {
            Error::Other(format!("Failed to get true peak for channel {}: {}", ch, e))
        })?;
        if peak > true_peak_linear {
            true_peak_linear = peak;
        }
    }
    let true_peak_dbfs = if true_peak_linear > 0.0 {
        20.0 * true_peak_linear.log10()
    } else {
        -100.0
    };

    // Loudness range
    let loudness_range = meter
        .loudness_range()
        .map_err(|e| Error::Other(format!("Failed to get loudness range: {}", e)))?;

    // Calculate recommended gain, clamped to practical range
    let recommended_gain = (target_lufs - integrated_lufs).clamp(-60.0, 60.0);

    Ok(LoudnessAnalysis {
        integrated_lufs,
        true_peak_dbfs,
        loudness_range,
        recommended_gain,
        target_lufs,
    })
}

/// Detect silence regions in an audio file.
///
/// This is a blocking function — call from `spawn_blocking`.
///
/// # Arguments
/// * `path` - Path to the media file (audio or video — FFmpeg extracts the audio stream)
/// * `threshold_dbfs` - Silence threshold in dBFS (e.g. -40.0). Windows quieter than this are silent.
/// * `min_duration` - Minimum silence duration in seconds (e.g. 0.5). Shorter gaps are ignored.
///
/// # Algorithm
/// 1. Decode audio to F32 PCM (stereo downmix for consistency)
/// 2. Process in 100ms windows, compute RMS in dBFS per window
/// 3. Mark windows below threshold as silent
/// 4. Merge contiguous silent windows into regions
/// 5. Filter regions shorter than min_duration
pub fn detect_silence_blocking(
    path: &str,
    threshold_dbfs: f64,
    min_duration: f64,
) -> Result<SilenceAnalysis> {
    // Decode to F32 stereo for consistent analysis
    let mut decoder = FfmpegAudioDecoder::new()
        .with_output_format(SampleFormat::F32)
        .with_output_channels(2);
    let audio_info = decoder.open(path)?;

    let channels: usize = 2;
    let sample_rate = audio_info.sample_rate as f64;
    // 100ms analysis windows
    let window_samples = (sample_rate * 0.1) as usize;
    let threshold_linear = 10.0_f64.powf(threshold_dbfs / 20.0);
    let threshold_sq = threshold_linear * threshold_linear;

    // Accumulate samples for windowed RMS analysis
    let mut window_buf: Vec<f32> = Vec::with_capacity(window_samples * channels);
    let mut silent_windows: Vec<bool> = Vec::new();

    while let Some(frame) = decoder.decode_next()? {
        let samples: &[f32] = bytemuck::cast_slice(&frame.data);

        for &sample in samples {
            window_buf.push(sample);

            if window_buf.len() >= window_samples * channels {
                // Compute RMS across all samples in this window
                let sum_sq: f64 = window_buf.iter().map(|&s| (s as f64) * (s as f64)).sum();
                let rms_sq = sum_sq / window_buf.len() as f64;
                silent_windows.push(rms_sq < threshold_sq);

                window_buf.clear();
            }
        }
    }

    // Process remaining partial window
    if !window_buf.is_empty() {
        let sum_sq: f64 = window_buf.iter().map(|&s| (s as f64) * (s as f64)).sum();
        let rms_sq = sum_sq / window_buf.len() as f64;
        silent_windows.push(rms_sq < threshold_sq);
    }

    let total_duration = audio_info.duration;
    let window_duration = 0.1; // 100ms

    // Merge contiguous silent windows into regions
    let mut raw_regions: Vec<SilenceRegion> = Vec::new();
    let mut i = 0;
    while i < silent_windows.len() {
        if silent_windows[i] {
            let start_idx = i;
            while i < silent_windows.len() && silent_windows[i] {
                i += 1;
            }
            let start = start_idx as f64 * window_duration;
            let end = (i as f64 * window_duration).min(total_duration);
            raw_regions.push(SilenceRegion {
                start,
                end,
                duration: end - start,
            });
        } else {
            i += 1;
        }
    }

    // Filter by minimum duration
    let regions: Vec<SilenceRegion> = raw_regions
        .into_iter()
        .filter(|r| r.duration >= min_duration)
        .collect();

    let silence_duration: f64 = regions.iter().map(|r| r.duration).sum();
    let silence_ratio = if total_duration > 0.0 {
        silence_duration / total_duration
    } else {
        0.0
    };

    Ok(SilenceAnalysis {
        total_duration,
        silence_duration,
        silence_ratio,
        region_count: regions.len(),
        regions,
        threshold_dbfs,
        min_duration,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_waveform_nonexistent_file() {
        let result = generate_waveform_blocking("/nonexistent/file.mp4");
        assert!(result.is_err());
    }

    #[test]
    fn recovered_waveform_uses_decoded_sample_duration() {
        let mut waveform = WaveformData::new(1_000, 2, 100, 10.0);

        finalize_waveform(&mut waveform, 2_505, true);

        assert_eq!(waveform.duration, 2.505);
        assert_eq!(waveform.num_peaks(), 251);
        assert!(waveform.peaks.iter().all(|channel| channel.len() == 251));
    }

    #[test]
    fn clean_waveform_preserves_metadata_duration() {
        let mut waveform = WaveformData::new(1_000, 2, 100, 10.0);

        finalize_waveform(&mut waveform, 2_505, false);

        assert_eq!(waveform.duration, 10.0);
        assert_eq!(waveform.num_peaks(), 1_000);
    }

    #[test]
    fn test_analyze_loudness_nonexistent_file() {
        let result = analyze_loudness_blocking("/nonexistent/file.mp3", -14.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_detect_silence_nonexistent_file() {
        let result = detect_silence_blocking("/nonexistent/file.mp3", -40.0, 0.5);
        assert!(result.is_err());
    }
}
