//! Type conversions between Rust and JavaScript
//!
//! Only types used by bridge.rs / engine.rs or re-exported for external consumers.

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ============================================================================
// GPU Info
// ============================================================================

use neko_engine_kernel::contracts::gpu::GpuInfo as RustGpuInfo;

/// GPU information for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsGpuInfo {
    pub name: String,
    pub vendor: String,
    pub backend: String,
    pub device_type: String,
}

impl From<&RustGpuInfo> for JsGpuInfo {
    fn from(info: &RustGpuInfo) -> Self {
        Self {
            name: info.name.clone(),
            vendor: info.vendor.clone(),
            backend: info.backend.clone(),
            device_type: info.device_type.clone(),
        }
    }
}

// ============================================================================
// Frame Data
// ============================================================================

/// Frame data for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsFrameData {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data: Buffer,
    pub timestamp: f64,
    pub is_keyframe: bool,
}

// ============================================================================
// Hardware Acceleration Info
// ============================================================================

/// Hardware acceleration info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsHwAccelInfo {
    pub decoders: Vec<String>,
    pub encoders: Vec<String>,
    pub recommended_decoder: String,
    pub recommended_encoder: String,
}

impl Default for JsHwAccelInfo {
    fn default() -> Self {
        #[cfg(target_os = "macos")]
        {
            Self {
                decoders: vec!["videotoolbox".to_string(), "none".to_string()],
                encoders: vec!["videotoolbox".to_string(), "none".to_string()],
                recommended_decoder: "videotoolbox".to_string(),
                recommended_encoder: "videotoolbox".to_string(),
            }
        }

        #[cfg(target_os = "linux")]
        {
            let has_nvidia = std::path::Path::new("/dev/nvidia0").exists();
            let has_vaapi = std::path::Path::new("/dev/dri/renderD128").exists();

            let mut decoders = vec![];
            let mut encoders = vec![];

            if has_nvidia {
                decoders.push("cuda".to_string());
                encoders.push("nvenc".to_string());
            }
            if has_vaapi {
                decoders.push("vaapi".to_string());
                encoders.push("vaapi".to_string());
            }
            decoders.push("none".to_string());
            encoders.push("none".to_string());

            let recommended_decoder = if has_nvidia {
                "cuda"
            } else if has_vaapi {
                "vaapi"
            } else {
                "none"
            };

            let recommended_encoder = if has_nvidia {
                "nvenc"
            } else if has_vaapi {
                "vaapi"
            } else {
                "none"
            };

            Self {
                decoders,
                encoders,
                recommended_decoder: recommended_decoder.to_string(),
                recommended_encoder: recommended_encoder.to_string(),
            }
        }

        #[cfg(target_os = "windows")]
        {
            Self {
                decoders: vec!["d3d11va".to_string(), "none".to_string()],
                encoders: vec!["nvenc".to_string(), "qsv".to_string(), "none".to_string()],
                recommended_decoder: "d3d11va".to_string(),
                recommended_encoder: "nvenc".to_string(),
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Self {
                decoders: vec!["none".to_string()],
                encoders: vec!["none".to_string()],
                recommended_decoder: "none".to_string(),
                recommended_encoder: "none".to_string(),
            }
        }
    }
}

// ============================================================================
// Audio Info
// ============================================================================

/// Audio info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsAudioInfo {
    pub sample_rate: u32,
    pub channels: u32,
    pub duration: f64,
    pub codec: String,
    pub bitrate: i64,
    pub total_samples: i64,
}

impl From<&neko_engine_kernel::contracts::audio::AudioInfo> for JsAudioInfo {
    fn from(info: &neko_engine_kernel::contracts::audio::AudioInfo) -> Self {
        Self {
            sample_rate: info.sample_rate,
            channels: info.channels as u32,
            duration: info.duration,
            codec: info.codec.clone(),
            bitrate: info.bitrate as i64,
            total_samples: info.total_samples as i64,
        }
    }
}

// ============================================================================
// Media Service Types (probe, subtitles)
// ============================================================================

use neko_engine_kernel::contracts::media::{
    ExtractedSubtitleTrack as RustExtractedSubtitleTrack, MediaInfo as RustProbeMediaInfo,
    SubtitleCue as RustSubtitleCue, SubtitleStream as RustSubtitleStream,
};

/// Probed media information for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsProbeMediaInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub format: String,
    pub bitrate: Option<i64>,
    pub has_audio: bool,
    pub audio_codec: Option<String>,
    pub audio_sample_rate: Option<u32>,
    pub audio_channels: Option<u32>,
    pub audio_bitrate: Option<i64>,
    pub has_subtitles: bool,
    pub subtitle_streams: Vec<JsProbeSubtitleStream>,
}

impl From<RustProbeMediaInfo> for JsProbeMediaInfo {
    fn from(info: RustProbeMediaInfo) -> Self {
        Self {
            duration: info.duration,
            width: info.width,
            height: info.height,
            fps: info.fps,
            codec: info.codec,
            format: info.format,
            bitrate: info.bitrate.map(|b| b as i64),
            has_audio: info.has_audio,
            audio_codec: info.audio_codec,
            audio_sample_rate: info.audio_sample_rate,
            audio_channels: info.audio_channels,
            audio_bitrate: info.audio_bitrate.map(|b| b as i64),
            has_subtitles: info.has_subtitles,
            subtitle_streams: info.subtitle_streams.into_iter().map(Into::into).collect(),
        }
    }
}

/// Subtitle stream info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsProbeSubtitleStream {
    pub index: u32,
    pub codec: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
    pub is_forced: bool,
}

impl From<RustSubtitleStream> for JsProbeSubtitleStream {
    fn from(stream: RustSubtitleStream) -> Self {
        Self {
            index: stream.index as u32,
            codec: stream.codec,
            language: stream.language,
            title: stream.title,
            is_default: stream.is_default,
            is_forced: stream.is_forced,
        }
    }
}

/// Subtitle cue for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsSubtitleCue {
    pub id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
}

impl From<RustSubtitleCue> for JsSubtitleCue {
    fn from(cue: RustSubtitleCue) -> Self {
        Self {
            id: cue.id,
            start_time: cue.start_time,
            end_time: cue.end_time,
            text: cue.text,
        }
    }
}

/// Extracted subtitle track for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsExtractedSubtitleTrack {
    pub stream_index: u32,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
    pub cues: Vec<JsSubtitleCue>,
}

impl From<RustExtractedSubtitleTrack> for JsExtractedSubtitleTrack {
    fn from(track: RustExtractedSubtitleTrack) -> Self {
        Self {
            stream_index: track.stream_index as u32,
            language: track.language,
            title: track.title,
            is_default: track.is_default,
            cues: track.cues.into_iter().map(Into::into).collect(),
        }
    }
}
