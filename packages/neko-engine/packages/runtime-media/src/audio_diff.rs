//! Audio Content Diff - Waveform comparison with SNR metrics
//!
//! Decodes two audio files to F32 PCM (48kHz mono), computes
//! Signal-to-Noise Ratio (SNR), and identifies difference regions.

use crate::error::{MediaError as Error, Result};
use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};

/// Unified sample rate for comparison (48 kHz)
const COMPARE_SAMPLE_RATE: u32 = 48000;
/// Segment length in seconds for region detection
const SEGMENT_DURATION: f64 = 0.1;
/// SNR threshold (dB) below which a segment is considered "different"
const DIFF_SNR_THRESHOLD: f64 = 20.0;

/// Options for audio content diff
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiffOptions {
    /// Start time in seconds for range-based diff (None = from beginning)
    #[serde(default)]
    pub start_time: Option<f64>,

    /// End time in seconds for range-based diff (None = to end)
    #[serde(default)]
    pub end_time: Option<f64>,
}

/// Audio content diff result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioContentDiff {
    /// Overall Signal-to-Noise Ratio in dB (higher = more similar, Infinity = identical)
    pub snr: f64,
    /// Duration of source A in seconds
    pub duration_a: f64,
    /// Duration of source B in seconds
    pub duration_b: f64,
    /// Sample rate used for comparison
    pub compare_sample_rate: u32,
    /// Total number of samples compared
    pub total_samples: u64,
    /// Number of segments that differ
    pub diff_segment_count: usize,
    /// Total number of segments
    pub total_segments: usize,
    /// Percentage of segments that differ (0.0 - 100.0)
    pub diff_percent: f64,
    /// Difference regions (segments where SNR < threshold)
    pub diff_regions: Vec<AudioDiffRegion>,
    /// Waveform peak data for source A (downsampled, values 0.0-1.0)
    pub waveform_peaks_a: Vec<f32>,
    /// Waveform peak data for source B (downsampled, values 0.0-1.0)
    pub waveform_peaks_b: Vec<f32>,
}

/// A region where audio content differs
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDiffRegion {
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
    /// SNR for this region in dB
    pub snr: f64,
    /// RMS difference for this region
    pub rms_diff: f64,
}

/// Compare two audio files at the waveform level
pub fn diff_audio_content(source_a: &str, source_b: &str) -> Result<AudioContentDiff> {
    diff_audio_content_with_options(source_a, source_b, &AudioDiffOptions::default())
}

/// Compare two audio files with optional time range
pub fn diff_audio_content_with_options(
    source_a: &str,
    source_b: &str,
    opts: &AudioDiffOptions,
) -> Result<AudioContentDiff> {
    // Decode both files to F32 PCM (48kHz mono)
    let samples_a = decode_to_f32_mono(source_a, opts.start_time, opts.end_time)?;
    let samples_b = decode_to_f32_mono(source_b, opts.start_time, opts.end_time)?;

    let duration_a = samples_a.len() as f64 / COMPARE_SAMPLE_RATE as f64;
    let duration_b = samples_b.len() as f64 / COMPARE_SAMPLE_RATE as f64;

    // Use the shorter length for comparison
    let compare_len = samples_a.len().min(samples_b.len());
    if compare_len == 0 {
        return Ok(AudioContentDiff {
            snr: 0.0,
            duration_a,
            duration_b,
            compare_sample_rate: COMPARE_SAMPLE_RATE,
            total_samples: 0,
            diff_segment_count: 0,
            total_segments: 0,
            diff_percent: 0.0,
            diff_regions: Vec::new(),
            waveform_peaks_a: Vec::new(),
            waveform_peaks_b: Vec::new(),
        });
    }

    // Compute overall SNR
    let snr = compute_snr(&samples_a[..compare_len], &samples_b[..compare_len]);

    // Compute per-segment differences
    let segment_samples = (SEGMENT_DURATION * COMPARE_SAMPLE_RATE as f64) as usize;
    let total_segments = compare_len.div_ceil(segment_samples);
    let mut diff_regions = Vec::new();

    for seg_idx in 0..total_segments {
        let start_sample = seg_idx * segment_samples;
        let end_sample = (start_sample + segment_samples).min(compare_len);

        let seg_a = &samples_a[start_sample..end_sample];
        let seg_b = &samples_b[start_sample..end_sample];

        let seg_snr = compute_snr(seg_a, seg_b);
        let rms_diff = compute_rms_diff(seg_a, seg_b);

        if seg_snr < DIFF_SNR_THRESHOLD {
            let start_time = start_sample as f64 / COMPARE_SAMPLE_RATE as f64;
            let end_time = end_sample as f64 / COMPARE_SAMPLE_RATE as f64;

            diff_regions.push(AudioDiffRegion {
                start: start_time,
                end: end_time,
                snr: seg_snr,
                rms_diff,
            });
        }
    }

    // Merge adjacent diff regions
    let diff_regions = merge_adjacent_regions(diff_regions);
    let diff_segment_count = diff_regions.len();
    let diff_percent = if total_segments > 0 {
        (diff_segment_count as f64 / total_segments as f64) * 100.0
    } else {
        0.0
    };

    // If durations differ significantly, add a trailing diff region
    let mut final_regions = diff_regions;
    if (duration_a - duration_b).abs() > SEGMENT_DURATION {
        let shorter = duration_a.min(duration_b);
        let longer = duration_a.max(duration_b);
        final_regions.push(AudioDiffRegion {
            start: shorter,
            end: longer,
            snr: 0.0,
            rms_diff: 1.0, // Max diff for missing audio
        });
    }

    // Extract waveform peaks for visualization
    let waveform_peaks_a = extract_waveform_peaks(&samples_a);
    let waveform_peaks_b = extract_waveform_peaks(&samples_b);

    Ok(AudioContentDiff {
        snr,
        duration_a,
        duration_b,
        compare_sample_rate: COMPARE_SAMPLE_RATE,
        total_samples: compare_len as u64,
        diff_segment_count: final_regions.len(),
        total_segments,
        diff_percent,
        diff_regions: final_regions,
        waveform_peaks_a,
        waveform_peaks_b,
    })
}

/// Decode an audio file to F32 mono samples at 48kHz with optional time range.
///
/// Uses ffmpeg-next library API directly — no external CLI dependency.
fn decode_to_f32_mono(
    path: &str,
    start_time: Option<f64>,
    end_time: Option<f64>,
) -> Result<Vec<f32>> {
    use ffmpeg::software::resampling;
    use ffmpeg::util::frame::audio::Audio as AudioFrame;
    use ffmpeg::{codec, format, media};

    static FFMPEG_INIT: std::sync::Once = std::sync::Once::new();
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });

    let mut ictx = format::input(&path)
        .map_err(|e| Error::Other(format!("Failed to open audio {}: {}", path, e)))?;

    let stream = ictx
        .streams()
        .best(media::Type::Audio)
        .ok_or_else(|| Error::Other(format!("No audio stream in {}", path)))?;

    let stream_index = stream.index();
    let context = codec::context::Context::from_parameters(stream.parameters())
        .map_err(|e| Error::Other(format!("Codec context error: {}", e)))?;
    let mut audio_decoder = context
        .decoder()
        .audio()
        .map_err(|e| Error::Other(format!("Audio decoder error: {}", e)))?;

    // Set up resampler: input format → F32 mono 48kHz
    let mut resampler = resampling::Context::get(
        audio_decoder.format(),
        audio_decoder.channel_layout(),
        audio_decoder.rate(),
        ffmpeg::format::Sample::F32(ffmpeg::format::sample::Type::Packed),
        ffmpeg::ChannelLayout::MONO,
        COMPARE_SAMPLE_RATE,
    )
    .map_err(|e| Error::Other(format!("Resampler init error: {}", e)))?;

    let mut all_samples = Vec::new();
    let mut decoded_frame = AudioFrame::empty();
    let mut resampled_frame = AudioFrame::empty();

    for (stream_pkt, packet) in ictx.packets() {
        if stream_pkt.index() != stream_index {
            continue;
        }

        audio_decoder.send_packet(&packet).ok();

        while audio_decoder.receive_frame(&mut decoded_frame).is_ok() {
            resampler
                .run(&decoded_frame, &mut resampled_frame)
                .map_err(|e| Error::Other(format!("Resample error: {}", e)))?;

            // Resampled data is F32 packed mono
            let data = resampled_frame.data(0);
            let f32_samples: &[f32] = bytemuck::cast_slice(data);
            all_samples.extend_from_slice(f32_samples);
        }
    }

    // Flush decoder
    audio_decoder.send_eof().ok();
    while audio_decoder.receive_frame(&mut decoded_frame).is_ok() {
        resampler.run(&decoded_frame, &mut resampled_frame).ok();
        let data = resampled_frame.data(0);
        let f32_samples: &[f32] = bytemuck::cast_slice(data);
        all_samples.extend_from_slice(f32_samples);
    }

    // Trim samples based on time range (in-memory fallback)
    if start_time.is_some() || end_time.is_some() {
        let start_sample = start_time
            .map(|t| (t * COMPARE_SAMPLE_RATE as f64) as usize)
            .unwrap_or(0);
        let end_sample = end_time
            .map(|t| (t * COMPARE_SAMPLE_RATE as f64) as usize)
            .unwrap_or(all_samples.len());

        let start_sample = start_sample.min(all_samples.len());
        let end_sample = end_sample.min(all_samples.len());

        if start_sample < end_sample {
            all_samples = all_samples[start_sample..end_sample].to_vec();
        } else {
            all_samples.clear();
        }
    }

    Ok(all_samples)
}

/// Compute Signal-to-Noise Ratio between two sample arrays
///
/// SNR = 10 * log10(signal_power / noise_power)
/// where signal = samples_a, noise = samples_a - samples_b
fn compute_snr(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() {
        return 0.0;
    }

    let mut signal_power: f64 = 0.0;
    let mut noise_power: f64 = 0.0;

    for (sa, sb) in a.iter().zip(b.iter()) {
        let s = *sa as f64;
        let n = (*sa - *sb) as f64;
        signal_power += s * s;
        noise_power += n * n;
    }

    signal_power /= a.len() as f64;
    noise_power /= a.len() as f64;

    if noise_power < 1e-20 {
        f64::INFINITY // Identical
    } else if signal_power < 1e-20 {
        0.0 // Silent signal
    } else {
        10.0 * (signal_power / noise_power).log10()
    }
}

/// Compute RMS of the difference between two sample arrays
fn compute_rms_diff(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() {
        return 0.0;
    }

    let mut sum_sq: f64 = 0.0;
    for (sa, sb) in a.iter().zip(b.iter()) {
        let d = (*sa - *sb) as f64;
        sum_sq += d * d;
    }

    (sum_sq / a.len() as f64).sqrt()
}

/// Number of waveform peak points to extract for visualization
const WAVEFORM_PEAK_COUNT: usize = 800;

/// Extract waveform peak data from PCM samples for visualization.
/// Downsamples to ~WAVEFORM_PEAK_COUNT points by taking max absolute value per bucket.
/// Returns values in 0.0-1.0 range.
fn extract_waveform_peaks(samples: &[f32]) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }

    let num_points = WAVEFORM_PEAK_COUNT.min(samples.len());
    let bucket_size = samples.len() / num_points;
    if bucket_size == 0 {
        // Fewer samples than points — return abs values directly
        return samples.iter().map(|s| s.abs().min(1.0)).collect();
    }

    let mut peaks = Vec::with_capacity(num_points);
    for i in 0..num_points {
        let start = i * bucket_size;
        let end = if i == num_points - 1 {
            samples.len()
        } else {
            start + bucket_size
        };
        let peak = samples[start..end]
            .iter()
            .fold(0.0f32, |max, s| max.max(s.abs()));
        peaks.push(peak.min(1.0));
    }
    peaks
}

/// Merge adjacent diff regions into contiguous blocks
fn merge_adjacent_regions(regions: Vec<AudioDiffRegion>) -> Vec<AudioDiffRegion> {
    if regions.is_empty() {
        return regions;
    }

    let mut merged = Vec::new();
    let mut current = regions[0].clone();

    for region in regions.iter().skip(1) {
        // Merge if regions are adjacent (within one segment duration)
        if (region.start - current.end).abs() < SEGMENT_DURATION * 1.5 {
            current.end = region.end;
            // Use the worse (lower) SNR
            current.snr = current.snr.min(region.snr);
            // Use the higher RMS diff
            current.rms_diff = current.rms_diff.max(region.rms_diff);
        } else {
            merged.push(current);
            current = region.clone();
        }
    }
    merged.push(current);

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snr_identical() {
        let samples = vec![0.5f32; 1000];
        let snr = compute_snr(&samples, &samples);
        assert!(
            snr.is_infinite(),
            "SNR should be infinity for identical signals"
        );
    }

    #[test]
    fn test_snr_different() {
        let a = vec![0.5f32; 1000];
        let b = vec![-0.5f32; 1000];
        let snr = compute_snr(&a, &b);
        assert!(
            snr < 10.0,
            "SNR should be low for opposite signals, got {}",
            snr
        );
    }

    #[test]
    fn test_snr_similar() {
        let a: Vec<f32> = (0..1000).map(|i| (i as f32 * 0.01).sin()).collect();
        let b: Vec<f32> = a.iter().map(|s| s + 0.001).collect();
        let snr = compute_snr(&a, &b);
        assert!(
            snr > 30.0,
            "SNR should be high for very similar signals, got {}",
            snr
        );
    }

    #[test]
    fn test_snr_silent() {
        let a = vec![0.0f32; 1000];
        let b = vec![0.1f32; 1000];
        let snr = compute_snr(&a, &b);
        assert_eq!(snr, 0.0, "SNR should be 0 for silent signal");
    }

    #[test]
    fn test_rms_diff_identical() {
        let samples = vec![0.5f32; 1000];
        let rms = compute_rms_diff(&samples, &samples);
        assert!(rms < 1e-10, "RMS diff should be ~0 for identical signals");
    }

    #[test]
    fn test_rms_diff_different() {
        let a = vec![1.0f32; 1000];
        let b = vec![0.0f32; 1000];
        let rms = compute_rms_diff(&a, &b);
        assert!(
            (rms - 1.0).abs() < 0.001,
            "RMS diff should be 1.0, got {}",
            rms
        );
    }

    #[test]
    fn test_merge_adjacent_regions() {
        let regions = vec![
            AudioDiffRegion {
                start: 0.0,
                end: 0.1,
                snr: 5.0,
                rms_diff: 0.5,
            },
            AudioDiffRegion {
                start: 0.1,
                end: 0.2,
                snr: 3.0,
                rms_diff: 0.8,
            },
            AudioDiffRegion {
                start: 0.2,
                end: 0.3,
                snr: 8.0,
                rms_diff: 0.3,
            },
            // Gap
            AudioDiffRegion {
                start: 1.0,
                end: 1.1,
                snr: 10.0,
                rms_diff: 0.2,
            },
        ];

        let merged = merge_adjacent_regions(regions);
        assert_eq!(
            merged.len(),
            2,
            "Should merge first 3 into 1, keep last separate"
        );
        assert_eq!(merged[0].start, 0.0);
        assert_eq!(merged[0].end, 0.3);
        assert_eq!(merged[0].snr, 3.0); // Worst SNR
        assert_eq!(merged[0].rms_diff, 0.8); // Highest RMS
        assert_eq!(merged[1].start, 1.0);
    }

    #[test]
    fn test_merge_empty_regions() {
        let regions: Vec<AudioDiffRegion> = Vec::new();
        let merged = merge_adjacent_regions(regions);
        assert!(merged.is_empty());
    }

    #[test]
    fn test_snr_empty() {
        let snr = compute_snr(&[], &[]);
        assert_eq!(snr, 0.0);
    }

    #[test]
    fn test_rms_diff_empty() {
        let rms = compute_rms_diff(&[], &[]);
        assert_eq!(rms, 0.0);
    }
}
