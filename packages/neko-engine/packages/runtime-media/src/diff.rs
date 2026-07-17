//! Media Diff - Compare two media files of the same format
//!
//! Probes both files and produces a structured diff of their metadata,
//! highlighting differences in video, audio, and subtitle properties.

use serde::Serialize;
use std::path::Path;

use crate::audio_diff::{diff_audio_content, AudioContentDiff};
use crate::error::{MediaError as Error, Result};
use crate::image_diff::{diff_image_content, ImageContentDiff};
use crate::probe::{global_probe_cache, MediaInfo};
use crate::timeline_diff::{diff_timeline_content, TimelineContentDiff};
use crate::video_diff::{diff_video_content, VideoContentDiff, VideoDiffOptions};

/// Category of media being compared
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffCategory {
    Video,
    Audio,
    Image,
    Timeline,
}

/// A single field difference between two files
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDiff {
    /// Field name (e.g., "width", "codec", "duration")
    pub field: String,
    /// Value in source A
    pub value_a: serde_json::Value,
    /// Value in source B
    pub value_b: serde_json::Value,
    /// Whether the values differ
    pub changed: bool,
}

impl FieldDiff {
    fn same<V: Into<serde_json::Value> + Clone>(field: &str, value: V) -> Self {
        Self {
            field: field.to_string(),
            value_a: value.clone().into(),
            value_b: value.into(),
            changed: false,
        }
    }

    fn diff<A: Into<serde_json::Value>, B: Into<serde_json::Value>>(
        field: &str,
        a: A,
        b: B,
    ) -> Self {
        Self {
            field: field.to_string(),
            value_a: a.into(),
            value_b: b.into(),
            changed: true,
        }
    }
}

/// Content-level diff result (pixel/waveform/frame comparison)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ContentDiff {
    /// Image pixel-level comparison
    Image(ImageContentDiff),
    /// Audio waveform comparison
    Audio(AudioContentDiff),
    /// Video frame-level comparison (SSIM/PSNR via FFmpeg)
    Video(VideoContentDiff),
    /// Timeline structural comparison (JVI project diff)
    Timeline(TimelineContentDiff),
}

/// Result of comparing two media files
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    /// Source A path
    pub source_a: String,
    /// Source B path
    pub source_b: String,
    /// Category of comparison
    pub category: DiffCategory,
    /// Whether the files are identical in metadata
    pub identical: bool,
    /// Number of fields that differ
    pub diff_count: usize,
    /// Total fields compared
    pub total_fields: usize,
    /// Detailed field-by-field comparison
    pub fields: Vec<FieldDiff>,
    /// Metadata for source A
    pub info_a: serde_json::Value,
    /// Metadata for source B
    pub info_b: serde_json::Value,
    /// Content-level diff (pixel/waveform comparison, only for image/audio)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ContentDiff>,
}

/// Compare two media files and return their metadata differences
pub fn diff_media<P: AsRef<Path>>(
    source_a: P,
    source_b: P,
    category: DiffCategory,
) -> Result<DiffResult> {
    let path_a = source_a.as_ref();
    let path_b = source_b.as_ref();

    // Validate both files exist
    if !path_a.exists() {
        return Err(Error::FileNotFound(path_a.display().to_string()));
    }
    if !path_b.exists() {
        return Err(Error::FileNotFound(path_b.display().to_string()));
    }

    // Probe both files (skip for non-media categories like Timeline)
    let (info_a, info_b) = if category == DiffCategory::Timeline {
        // JVI files are JSON, not media — skip FFmpeg probe
        (MediaInfo::default(), MediaInfo::default())
    } else {
        (
            global_probe_cache().probe(path_a)?,
            global_probe_cache().probe(path_b)?,
        )
    };

    // Build field diffs based on category
    let fields = match category {
        DiffCategory::Video => diff_video_fields(&info_a, &info_b),
        DiffCategory::Audio => diff_audio_fields(&info_a, &info_b),
        DiffCategory::Image => diff_image_fields(&info_a, &info_b),
        // Timeline uses structural diff, no metadata fields
        DiffCategory::Timeline => Vec::new(),
    };

    let diff_count = fields.iter().filter(|f| f.changed).count();
    let total_fields = fields.len();

    // Content-level diff for image, audio, video, and timeline
    let content = match category {
        DiffCategory::Image => match diff_image_content(path_a, path_b) {
            Ok(img_diff) => Some(ContentDiff::Image(img_diff)),
            Err(e) => {
                tracing::warn!("Image content diff failed: {}", e);
                None
            }
        },
        DiffCategory::Audio => {
            let sa = path_a.to_string_lossy();
            let sb = path_b.to_string_lossy();
            match diff_audio_content(&sa, &sb) {
                Ok(audio_diff) => Some(ContentDiff::Audio(audio_diff)),
                Err(e) => {
                    tracing::warn!("Audio content diff failed: {}", e);
                    None
                }
            }
        }
        DiffCategory::Video => {
            match diff_video_content(path_a, path_b, &VideoDiffOptions::default()) {
                Ok(video_diff) => Some(ContentDiff::Video(video_diff)),
                Err(e) => {
                    tracing::warn!("Video content diff failed: {}", e);
                    None
                }
            }
        }
        DiffCategory::Timeline => match diff_timeline_content(path_a, path_b) {
            Ok(tl_diff) => Some(ContentDiff::Timeline(tl_diff)),
            Err(e) => {
                tracing::warn!("Timeline content diff failed: {}", e);
                None
            }
        },
    };

    Ok(DiffResult {
        source_a: path_a.display().to_string(),
        source_b: path_b.display().to_string(),
        category,
        identical: diff_count == 0,
        diff_count,
        total_fields,
        fields,
        info_a: media_info_to_json(&info_a),
        info_b: media_info_to_json(&info_b),
        content,
    })
}

/// Compare video-specific fields
fn diff_video_fields(a: &MediaInfo, b: &MediaInfo) -> Vec<FieldDiff> {
    let mut fields = Vec::new();

    // Video properties
    push_diff_f64(&mut fields, "duration", a.duration, b.duration, 0.01);
    push_diff_u32(&mut fields, "width", a.width, b.width);
    push_diff_u32(&mut fields, "height", a.height, b.height);
    push_diff_f64(&mut fields, "fps", a.fps, b.fps, 0.001);
    push_diff_str(&mut fields, "codec", &a.codec, &b.codec);
    push_diff_str(&mut fields, "format", &a.format, &b.format);
    push_diff_opt_u64(&mut fields, "bitrate", a.bitrate, b.bitrate);

    // Audio properties (if present)
    push_diff_bool(&mut fields, "hasAudio", a.has_audio, b.has_audio);
    push_diff_opt_str(&mut fields, "audioCodec", &a.audio_codec, &b.audio_codec);
    push_diff_opt_u32(
        &mut fields,
        "audioSampleRate",
        a.audio_sample_rate,
        b.audio_sample_rate,
    );
    push_diff_opt_u32(
        &mut fields,
        "audioChannels",
        a.audio_channels,
        b.audio_channels,
    );
    push_diff_opt_u64(
        &mut fields,
        "audioBitrate",
        a.audio_bitrate,
        b.audio_bitrate,
    );

    // Subtitle info
    push_diff_bool(
        &mut fields,
        "hasSubtitles",
        a.has_subtitles,
        b.has_subtitles,
    );
    push_diff_usize(
        &mut fields,
        "subtitleTrackCount",
        a.subtitle_streams.len(),
        b.subtitle_streams.len(),
    );

    fields
}

/// Compare audio-specific fields
fn diff_audio_fields(a: &MediaInfo, b: &MediaInfo) -> Vec<FieldDiff> {
    let mut fields = Vec::new();

    push_diff_f64(&mut fields, "duration", a.duration, b.duration, 0.01);
    push_diff_str(&mut fields, "format", &a.format, &b.format);
    push_diff_opt_str(&mut fields, "audioCodec", &a.audio_codec, &b.audio_codec);
    push_diff_opt_u32(
        &mut fields,
        "audioSampleRate",
        a.audio_sample_rate,
        b.audio_sample_rate,
    );
    push_diff_opt_u32(
        &mut fields,
        "audioChannels",
        a.audio_channels,
        b.audio_channels,
    );
    push_diff_opt_u64(
        &mut fields,
        "audioBitrate",
        a.audio_bitrate,
        b.audio_bitrate,
    );

    fields
}

/// Compare image-specific fields
fn diff_image_fields(a: &MediaInfo, b: &MediaInfo) -> Vec<FieldDiff> {
    let mut fields = Vec::new();

    push_diff_u32(&mut fields, "width", a.width, b.width);
    push_diff_u32(&mut fields, "height", a.height, b.height);
    push_diff_str(&mut fields, "codec", &a.codec, &b.codec);
    push_diff_str(&mut fields, "format", &a.format, &b.format);

    fields
}

/// Convert MediaInfo to JSON value
fn media_info_to_json(info: &MediaInfo) -> serde_json::Value {
    serde_json::json!({
        "duration": info.duration,
        "width": info.width,
        "height": info.height,
        "fps": info.fps,
        "codec": info.codec,
        "format": info.format,
        "bitrate": info.bitrate,
        "hasAudio": info.has_audio,
        "audioCodec": info.audio_codec,
        "audioSampleRate": info.audio_sample_rate,
        "audioChannels": info.audio_channels,
        "audioBitrate": info.audio_bitrate,
        "hasSubtitles": info.has_subtitles,
        "subtitleTrackCount": info.subtitle_streams.len(),
    })
}

// =============================================================================
// Helper functions for building field diffs
// =============================================================================

fn push_diff_f64(fields: &mut Vec<FieldDiff>, name: &str, a: f64, b: f64, epsilon: f64) {
    if (a - b).abs() > epsilon {
        fields.push(FieldDiff::diff(name, a, b));
    } else {
        fields.push(FieldDiff::same(name, a));
    }
}

fn push_diff_u32(fields: &mut Vec<FieldDiff>, name: &str, a: u32, b: u32) {
    if a != b {
        fields.push(FieldDiff::diff(name, a as u64, b as u64));
    } else {
        fields.push(FieldDiff::same(name, a as u64));
    }
}

fn push_diff_usize(fields: &mut Vec<FieldDiff>, name: &str, a: usize, b: usize) {
    if a != b {
        fields.push(FieldDiff::diff(name, a as u64, b as u64));
    } else {
        fields.push(FieldDiff::same(name, a as u64));
    }
}

fn push_diff_bool(fields: &mut Vec<FieldDiff>, name: &str, a: bool, b: bool) {
    if a != b {
        fields.push(FieldDiff::diff(name, a, b));
    } else {
        fields.push(FieldDiff::same(name, a));
    }
}

fn push_diff_str(fields: &mut Vec<FieldDiff>, name: &str, a: &str, b: &str) {
    if a != b {
        fields.push(FieldDiff::diff(
            name,
            serde_json::Value::String(a.to_string()),
            serde_json::Value::String(b.to_string()),
        ));
    } else {
        fields.push(FieldDiff::same(
            name,
            serde_json::Value::String(a.to_string()),
        ));
    }
}

fn push_diff_opt_str(
    fields: &mut Vec<FieldDiff>,
    name: &str,
    a: &Option<String>,
    b: &Option<String>,
) {
    let va = a
        .as_ref()
        .map(|s| serde_json::Value::String(s.clone()))
        .unwrap_or(serde_json::Value::Null);
    let vb = b
        .as_ref()
        .map(|s| serde_json::Value::String(s.clone()))
        .unwrap_or(serde_json::Value::Null);
    if va != vb {
        fields.push(FieldDiff::diff(name, va, vb));
    } else {
        fields.push(FieldDiff {
            field: name.to_string(),
            value_a: va.clone(),
            value_b: va,
            changed: false,
        });
    }
}

fn push_diff_opt_u32(fields: &mut Vec<FieldDiff>, name: &str, a: Option<u32>, b: Option<u32>) {
    let va = a
        .map(|v| serde_json::Value::from(v as u64))
        .unwrap_or(serde_json::Value::Null);
    let vb = b
        .map(|v| serde_json::Value::from(v as u64))
        .unwrap_or(serde_json::Value::Null);
    if va != vb {
        fields.push(FieldDiff::diff(name, va, vb));
    } else {
        fields.push(FieldDiff {
            field: name.to_string(),
            value_a: va.clone(),
            value_b: va,
            changed: false,
        });
    }
}

fn push_diff_opt_u64(fields: &mut Vec<FieldDiff>, name: &str, a: Option<u64>, b: Option<u64>) {
    let va = a
        .map(serde_json::Value::from)
        .unwrap_or(serde_json::Value::Null);
    let vb = b
        .map(serde_json::Value::from)
        .unwrap_or(serde_json::Value::Null);
    if va != vb {
        fields.push(FieldDiff::diff(name, va, vb));
    } else {
        fields.push(FieldDiff {
            field: name.to_string(),
            value_a: va.clone(),
            value_b: va,
            changed: false,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_diff_same() {
        let f = FieldDiff::same("width", 1920u64);
        assert_eq!(f.field, "width");
        assert!(!f.changed);
        assert_eq!(f.value_a, f.value_b);
    }

    #[test]
    fn test_field_diff_different() {
        let f = FieldDiff::diff("width", 1920u64, 1280u64);
        assert_eq!(f.field, "width");
        assert!(f.changed);
        assert_ne!(f.value_a, f.value_b);
    }

    #[test]
    fn test_diff_video_fields_identical() {
        let info = MediaInfo::default();
        let fields = diff_video_fields(&info, &info);
        assert!(fields.iter().all(|f| !f.changed));
    }

    #[test]
    fn test_diff_video_fields_different_resolution() {
        let mut a = MediaInfo::default();
        let mut b = MediaInfo::default();
        a.width = 1920;
        a.height = 1080;
        b.width = 1280;
        b.height = 720;

        let fields = diff_video_fields(&a, &b);
        let width_diff = fields.iter().find(|f| f.field == "width").unwrap();
        assert!(width_diff.changed);
        assert_eq!(width_diff.value_a, serde_json::json!(1920));
        assert_eq!(width_diff.value_b, serde_json::json!(1280));

        let height_diff = fields.iter().find(|f| f.field == "height").unwrap();
        assert!(height_diff.changed);
    }

    #[test]
    fn test_diff_audio_fields() {
        let mut a = MediaInfo::default();
        let mut b = MediaInfo::default();
        a.audio_codec = Some("aac".to_string());
        a.audio_sample_rate = Some(48000);
        b.audio_codec = Some("mp3".to_string());
        b.audio_sample_rate = Some(44100);

        let fields = diff_audio_fields(&a, &b);
        let codec_diff = fields.iter().find(|f| f.field == "audioCodec").unwrap();
        assert!(codec_diff.changed);

        let sr_diff = fields
            .iter()
            .find(|f| f.field == "audioSampleRate")
            .unwrap();
        assert!(sr_diff.changed);
    }

    #[test]
    fn test_diff_image_fields() {
        let mut a = MediaInfo::default();
        let mut b = MediaInfo::default();
        a.width = 800;
        a.height = 600;
        a.codec = "png".to_string();
        b.width = 800;
        b.height = 600;
        b.codec = "jpeg".to_string();

        let fields = diff_image_fields(&a, &b);
        assert_eq!(fields.len(), 4);

        let codec_diff = fields.iter().find(|f| f.field == "codec").unwrap();
        assert!(codec_diff.changed);

        let width_diff = fields.iter().find(|f| f.field == "width").unwrap();
        assert!(!width_diff.changed);
    }

    #[test]
    fn test_diff_category_serialize() {
        assert_eq!(
            serde_json::to_string(&DiffCategory::Video).unwrap(),
            "\"video\""
        );
        assert_eq!(
            serde_json::to_string(&DiffCategory::Audio).unwrap(),
            "\"audio\""
        );
    }

    #[test]
    fn test_diff_result_serialize() {
        let result = DiffResult {
            source_a: "/a.mp4".to_string(),
            source_b: "/b.mp4".to_string(),
            category: DiffCategory::Video,
            identical: false,
            diff_count: 1,
            total_fields: 5,
            fields: vec![FieldDiff::diff("width", 1920u64, 1280u64)],
            info_a: serde_json::json!({}),
            info_b: serde_json::json!({}),
            content: None,
        };

        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["identical"], false);
        assert_eq!(json["diffCount"], 1);
        assert_eq!(json["category"], "video");
    }

    #[test]
    fn test_diff_media_file_not_found() {
        let result = diff_media(
            "/nonexistent/a.mp4",
            "/nonexistent/b.mp4",
            DiffCategory::Video,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_push_diff_f64_within_epsilon() {
        let mut fields = Vec::new();
        push_diff_f64(&mut fields, "fps", 29.97, 29.97001, 0.001);
        assert!(!fields[0].changed);
    }

    #[test]
    fn test_push_diff_f64_outside_epsilon() {
        let mut fields = Vec::new();
        push_diff_f64(&mut fields, "fps", 29.97, 30.0, 0.001);
        assert!(fields[0].changed);
    }

    #[test]
    fn test_content_diff_audio_serialize() {
        use crate::audio_diff::{AudioContentDiff, AudioDiffRegion};

        let audio = AudioContentDiff {
            snr: 30.0,
            duration_a: 5.0,
            duration_b: 5.0,
            compare_sample_rate: 48000,
            total_samples: 240000,
            diff_segment_count: 2,
            total_segments: 50,
            diff_percent: 4.0,
            diff_regions: vec![AudioDiffRegion {
                start: 1.0,
                end: 2.0,
                snr: 10.0,
                rms_diff: 0.3,
            }],
            waveform_peaks_a: vec![0.1, 0.5, 0.8],
            waveform_peaks_b: vec![0.2, 0.4, 0.9],
        };

        let content = ContentDiff::Audio(audio);
        let json = serde_json::to_string_pretty(&content).unwrap();
        println!("ContentDiff::Audio JSON:\n{}", json);

        // Verify key fields exist
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "audio");
        assert!(parsed["waveformPeaksA"].is_array());
        assert!(parsed["waveformPeaksB"].is_array());
        assert_eq!(parsed["waveformPeaksA"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_diff_result_with_audio_content_serialize() {
        use crate::audio_diff::AudioContentDiff;

        let result = DiffResult {
            source_a: "/a.mp3".to_string(),
            source_b: "/b.mp3".to_string(),
            category: DiffCategory::Audio,
            identical: false,
            diff_count: 1,
            total_fields: 5,
            fields: vec![],
            info_a: serde_json::json!({}),
            info_b: serde_json::json!({}),
            content: Some(ContentDiff::Audio(AudioContentDiff {
                snr: 30.0,
                duration_a: 5.0,
                duration_b: 5.0,
                compare_sample_rate: 48000,
                total_samples: 240000,
                diff_segment_count: 0,
                total_segments: 50,
                diff_percent: 0.0,
                diff_regions: vec![],
                waveform_peaks_a: vec![0.1, 0.5],
                waveform_peaks_b: vec![0.2, 0.4],
            })),
        };

        let json = serde_json::to_string_pretty(&result).unwrap();
        println!("Full DiffResult with Audio content:\n{}", json);

        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["content"].is_object(), "content field should exist");
        assert_eq!(parsed["content"]["type"], "audio");
        assert!(parsed["content"]["waveformPeaksA"].is_array());
    }
}
