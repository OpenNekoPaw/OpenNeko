//! Service method options types
//!
//! These types are parameters for Service trait methods.
//! They are consumed only by the Service layer.

use neko_engine_types::{
    AudioCodec, AudioEffectConfig, EncoderPreset, FrameFormat, HwEncoderType, Resolution,
    VideoCodec,
};

/// Options for single frame capture (videos:capture / images:capture)
#[derive(Debug, Clone)]
pub struct CaptureOptions {
    /// JPEG quality 1-100
    pub quality: u32,
    /// Output format
    pub format: FrameFormat,
    /// Resize width (None = original)
    pub width: Option<u32>,
    /// Resize height (None = original)
    pub height: Option<u32>,
}

impl Default for CaptureOptions {
    fn default() -> Self {
        Self {
            quality: 85,
            format: FrameFormat::Jpeg,
            width: None,
            height: None,
        }
    }
}

impl CaptureOptions {
    pub fn jpeg(quality: u32) -> Self {
        Self {
            quality,
            format: FrameFormat::Jpeg,
            ..Default::default()
        }
    }

    pub fn png() -> Self {
        Self {
            format: FrameFormat::Png,
            ..Default::default()
        }
    }

    pub fn with_size(mut self, width: u32, height: u32) -> Self {
        self.width = Some(width);
        self.height = Some(height);
        self
    }
}

/// Options for frame range extraction (videos:extract)
#[derive(Debug, Clone)]
pub struct ExtractOptions {
    /// What to extract
    pub extract_type: ExtractType,
    /// Time range (None = full duration)
    pub time_range: Option<(f64, f64)>,
}

/// What to extract
#[derive(Debug, Clone)]
pub enum ExtractType {
    /// Single frame at time
    Frame { time: f64 },
    /// Range of frames
    FrameRange { start: f64, end: f64, fps: f64 },
    /// Extract subtitles
    Subtitles,
}

impl Default for ExtractOptions {
    fn default() -> Self {
        Self {
            extract_type: ExtractType::Frame { time: 0.0 },
            time_range: None,
        }
    }
}

/// Options for video transcoding (videos:transcode)
#[derive(Debug, Clone)]
pub struct TranscodeOptions {
    /// Target video codec
    pub video_codec: VideoCodec,
    /// Target resolution (None = original)
    pub resolution: Option<Resolution>,
    /// Target bitrate (None = auto)
    pub bitrate: Option<u64>,
    /// Hardware encoder to use
    pub hw_encoder: HwEncoderType,
    /// Encoder preset
    pub preset: EncoderPreset,
    /// Audio codec (None = no audio, Some = transcode audio)
    pub audio_codec: Option<AudioCodec>,
    /// Audio bitrate in bps (None = codec default)
    pub audio_bitrate: Option<u64>,
}

impl Default for TranscodeOptions {
    fn default() -> Self {
        Self {
            video_codec: VideoCodec::H264,
            resolution: None,
            bitrate: None,
            hw_encoder: HwEncoderType::Auto,
            preset: EncoderPreset::Medium,
            audio_codec: Some(AudioCodec::Opus),
            audio_bitrate: None,
        }
    }
}

/// Options for audio transcoding (audios:transcode)
#[derive(Debug, Clone, Default)]
pub struct AudioTranscodeOptions {
    /// Time range (None = full duration)
    pub time_range: Option<(f64, f64)>,
    /// Target sample rate (None = original)
    pub sample_rate: Option<u32>,
    /// Target channels (None = original)
    pub channels: Option<u16>,
    /// Output format / codec (None = infer from output file extension)
    pub format: Option<AudioOutputFormat>,
    /// Target bitrate in bps (None = codec default)
    pub bitrate: Option<u64>,
    /// Engine-facing effect chain as serializable render instructions.
    ///
    /// The domain layer intentionally carries only normalized data and does not
    /// depend on DSP factory types.
    pub effects: Vec<AudioRenderEffectConfig>,
}

/// Serializable audio effect instruction carried by domain options.
pub type AudioRenderEffectConfig = AudioEffectConfig;

/// Audio output format
#[derive(Debug, Clone, Copy)]
pub enum AudioOutputFormat {
    Pcm,
    Aac,
    Mp3,
    Opus,
    Flac,
}

impl From<AudioCodec> for AudioOutputFormat {
    fn from(codec: AudioCodec) -> Self {
        match codec {
            AudioCodec::Aac => Self::Aac,
            AudioCodec::Mp3 => Self::Mp3,
            AudioCodec::Opus => Self::Opus,
            AudioCodec::Flac => Self::Flac,
            AudioCodec::Pcm | AudioCodec::Vorbis => Self::Pcm,
        }
    }
}
