//! Codec types — video and audio codec enumerations

use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// Video codec
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec {
    #[default]
    H264,
    H265,
    Vp9,
    Av1,
    ProRes,
}

impl VideoCodec {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::H264 => "h264",
            Self::H265 => "h265",
            Self::Vp9 => "vp9",
            Self::Av1 => "av1",
            Self::ProRes => "prores",
        }
    }
}

impl FromStr for VideoCodec {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "h264" | "avc" => Ok(Self::H264),
            "h265" | "hevc" => Ok(Self::H265),
            "vp9" => Ok(Self::Vp9),
            "av1" => Ok(Self::Av1),
            "prores" => Ok(Self::ProRes),
            _ => Err(format!("unknown video codec: {s}")),
        }
    }
}

/// Audio codec
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCodec {
    #[default]
    Aac,
    Mp3,
    Opus,
    Flac,
    Pcm,
    Vorbis,
}

impl AudioCodec {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Aac => "aac",
            Self::Mp3 => "mp3",
            Self::Opus => "opus",
            Self::Flac => "flac",
            Self::Pcm => "pcm",
            Self::Vorbis => "vorbis",
        }
    }

    /// Default audio bitrate in bits per second.
    ///
    /// Lossless or uncompressed codecs return 0 because they do not use a
    /// target lossy bitrate.
    pub fn default_bitrate(&self) -> u64 {
        match self {
            Self::Aac => 128_000,
            Self::Mp3 => 192_000,
            Self::Opus => 96_000,
            Self::Vorbis => 128_000,
            Self::Flac | Self::Pcm => 0,
        }
    }
}

impl FromStr for AudioCodec {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "aac" => Ok(Self::Aac),
            "mp3" => Ok(Self::Mp3),
            "opus" => Ok(Self::Opus),
            "flac" => Ok(Self::Flac),
            "pcm" | "pcm_s16le" | "pcm_s24le" | "pcm_f32le" => Ok(Self::Pcm),
            "vorbis" => Ok(Self::Vorbis),
            _ => Err(format!("unknown audio codec: {s}")),
        }
    }
}

/// Audio sample format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SampleFormat {
    /// Unsigned 8-bit integer samples.
    U8,
    /// Signed 16-bit integer samples.
    S16,
    /// Signed 32-bit integer samples.
    S32,
    /// 32-bit floating point samples.
    #[default]
    F32,
    /// 64-bit floating point samples.
    F64,
}

impl SampleFormat {
    /// Get bytes per sample for this format.
    pub fn bytes_per_sample(&self) -> usize {
        match self {
            Self::U8 => 1,
            Self::S16 => 2,
            Self::S32 | Self::F32 => 4,
            Self::F64 => 8,
        }
    }
}

/// Audio encoder configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEncoderConfig {
    /// Sample rate in Hz.
    pub sample_rate: u32,
    /// Number of channels.
    pub channels: u16,
    /// Target bitrate in bits per second.
    pub bitrate: u64,
    /// Audio codec.
    pub codec: AudioCodec,
    /// Input sample format.
    pub sample_format: SampleFormat,
}

impl AudioEncoderConfig {
    /// Create a new audio encoder config with codec defaults.
    pub fn new(sample_rate: u32, channels: u16, codec: AudioCodec) -> Self {
        Self {
            sample_rate,
            channels,
            bitrate: codec.default_bitrate(),
            codec,
            sample_format: SampleFormat::default(),
        }
    }

    /// Set target bitrate in bits per second.
    pub fn with_bitrate(mut self, bitrate: u64) -> Self {
        self.bitrate = bitrate;
        self
    }

    /// Set input sample format.
    pub fn with_sample_format(mut self, format: SampleFormat) -> Self {
        self.sample_format = format;
        self
    }
}

/// Platform-specific GPU texture handle for hardware-decoded frames.
///
/// The handle is an identifier only; it does not retain or own the underlying
/// platform resource. The producer must keep the decoded frame/resource alive
/// while consumers import it into GPU textures.
#[derive(Debug)]
pub enum DecodedGpuTextureHandle {
    /// No GPU texture is available.
    None,
    /// CPU NV12 data used for software fallback when hardware decode is unavailable.
    CpuNv12 {
        /// Y plane data.
        y_data: Vec<u8>,
        /// Interleaved UV plane data.
        uv_data: Vec<u8>,
        /// Y plane bytes per row.
        y_linesize: u32,
        /// UV plane bytes per row.
        uv_linesize: u32,
    },
    /// macOS VideoToolbox CVPixelBuffer and IOSurface.
    #[cfg(target_os = "macos")]
    VideoToolbox {
        /// CVPixelBuffer pointer as an FFI-safe integer.
        pixel_buffer: usize,
        /// IOSurface pointer for Metal interop.
        io_surface: usize,
    },
    /// Linux VA-API surface.
    #[cfg(target_os = "linux")]
    Vaapi {
        /// VASurfaceID.
        surface_id: u32,
        /// VADisplay pointer.
        display: usize,
    },
    /// NVIDIA CUDA surface.
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    Cuda {
        /// CUdeviceptr.
        device_ptr: usize,
        /// Pitch in bytes.
        pitch: usize,
    },
    /// Windows D3D11 texture.
    #[cfg(target_os = "windows")]
    D3d11 {
        /// ID3D11Texture2D pointer.
        texture: usize,
        /// Texture array index.
        array_index: u32,
    },
}

/// Read-only view over an NV12 GPU texture produced by a decoder.
pub trait Nv12GpuTextureSource {
    /// Texture width.
    fn width(&self) -> u32;

    /// Texture height.
    fn height(&self) -> u32;

    /// Platform-specific GPU handle.
    fn handle(&self) -> &DecodedGpuTextureHandle;

    /// Presentation timestamp.
    fn pts(&self) -> i64;

    /// FFmpeg AVColorSpace value.
    fn color_space(&self) -> i32;
}

/// Encoder preset (speed vs quality tradeoff)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EncoderPreset {
    Ultrafast,
    Fast,
    #[default]
    Medium,
    Slow,
    Veryslow,
}

impl EncoderPreset {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ultrafast => "ultrafast",
            Self::Fast => "fast",
            Self::Medium => "medium",
            Self::Slow => "slow",
            Self::Veryslow => "veryslow",
        }
    }
}

/// Hardware encoder type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwEncoderType {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Nvenc,
    Vaapi,
    Qsv,
    Amf,
}

impl HwEncoderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Auto => "auto",
            Self::VideoToolbox => "videotoolbox",
            Self::Nvenc => "nvenc",
            Self::Vaapi => "vaapi",
            Self::Qsv => "qsv",
            Self::Amf => "amf",
        }
    }

    pub fn is_hardware(&self) -> bool {
        !matches!(self, Self::None)
    }
}

/// Hardware decoder/accelerator type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwAccelType {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Cuda,
    Vaapi,
    D3d11va,
    Dxva2,
    Qsv,
}

impl HwAccelType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Auto => "auto",
            Self::VideoToolbox => "videotoolbox",
            Self::Cuda => "cuda",
            Self::Vaapi => "vaapi",
            Self::D3d11va => "d3d11va",
            Self::Dxva2 => "dxva2",
            Self::Qsv => "qsv",
        }
    }

    pub fn is_hardware(&self) -> bool {
        !matches!(self, Self::None)
    }
}

/// Pixel format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PixelFormat {
    #[default]
    Nv12,
    Yuv420p,
    Yuv422p,
    Yuv444p,
    Rgba,
    Bgra,
    Rgb24,
    P010le,
}

impl PixelFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Nv12 => "nv12",
            Self::Yuv420p => "yuv420p",
            Self::Yuv422p => "yuv422p",
            Self::Yuv444p => "yuv444p",
            Self::Rgba => "rgba",
            Self::Bgra => "bgra",
            Self::Rgb24 => "rgb24",
            Self::P010le => "p010le",
        }
    }

    pub fn bytes_per_pixel(&self) -> f32 {
        match self {
            Self::Nv12 | Self::Yuv420p => 1.5,
            Self::Yuv422p => 2.0,
            Self::Yuv444p | Self::Rgb24 => 3.0,
            Self::Rgba | Self::Bgra => 4.0,
            Self::P010le => 3.0, // 10-bit 4:2:0
        }
    }
}

/// Container format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContainerFormat {
    #[default]
    Mp4,
    Mov,
    Mkv,
    Webm,
    Avi,
    Ts,
}

impl ContainerFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Mov => "mov",
            Self::Mkv => "mkv",
            Self::Webm => "webm",
            Self::Avi => "avi",
            Self::Ts => "ts",
        }
    }

    pub fn extension(&self) -> &'static str {
        self.as_str()
    }
}

/// Video codec type for keyframe scanning
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodecType {
    H264,
    H265,
    Vp9,
    Av1,
}

impl VideoCodecType {
    pub fn from_codec_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "h264" | "avc" | "avc1" => Some(Self::H264),
            "h265" | "hevc" | "hev1" | "hvc1" => Some(Self::H265),
            "vp9" | "vp09" => Some(Self::Vp9),
            "av1" | "av01" => Some(Self::Av1),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- VideoCodec ----

    #[test]
    fn test_video_codec_roundtrip() {
        for codec in [
            VideoCodec::H264,
            VideoCodec::H265,
            VideoCodec::Vp9,
            VideoCodec::Av1,
            VideoCodec::ProRes,
        ] {
            let s = codec.as_str();
            assert_eq!(
                VideoCodec::from_str(s),
                Ok(codec),
                "roundtrip failed for {s}"
            );
        }
    }

    #[test]
    fn test_video_codec_aliases() {
        assert_eq!(VideoCodec::from_str("avc"), Ok(VideoCodec::H264));
        assert_eq!(VideoCodec::from_str("hevc"), Ok(VideoCodec::H265));
        assert_eq!(VideoCodec::from_str("H264"), Ok(VideoCodec::H264));
        assert!(VideoCodec::from_str("unknown").is_err());
    }

    #[test]
    fn test_video_codec_default() {
        assert_eq!(VideoCodec::default(), VideoCodec::H264);
    }

    #[test]
    fn test_video_codec_serde() {
        let json = serde_json::to_string(&VideoCodec::H265).unwrap();
        assert_eq!(json, "\"h265\"");
        let parsed: VideoCodec = serde_json::from_str("\"h264\"").unwrap();
        assert_eq!(parsed, VideoCodec::H264);
    }

    // ---- AudioCodec ----

    #[test]
    fn test_audio_codec_roundtrip() {
        for codec in [
            AudioCodec::Aac,
            AudioCodec::Mp3,
            AudioCodec::Opus,
            AudioCodec::Flac,
            AudioCodec::Pcm,
            AudioCodec::Vorbis,
        ] {
            let s = codec.as_str();
            assert_eq!(
                AudioCodec::from_str(s),
                Ok(codec),
                "roundtrip failed for {s}"
            );
        }
    }

    #[test]
    fn test_audio_codec_pcm_aliases() {
        assert_eq!(AudioCodec::from_str("pcm_s16le"), Ok(AudioCodec::Pcm));
        assert_eq!(AudioCodec::from_str("pcm_s24le"), Ok(AudioCodec::Pcm));
        assert_eq!(AudioCodec::from_str("pcm_f32le"), Ok(AudioCodec::Pcm));
    }

    #[test]
    fn test_audio_codec_default_bitrate() {
        assert_eq!(AudioCodec::Aac.default_bitrate(), 128_000);
        assert_eq!(AudioCodec::Mp3.default_bitrate(), 192_000);
        assert_eq!(AudioCodec::Opus.default_bitrate(), 96_000);
        assert_eq!(AudioCodec::Vorbis.default_bitrate(), 128_000);
        assert_eq!(AudioCodec::Flac.default_bitrate(), 0);
        assert_eq!(AudioCodec::Pcm.default_bitrate(), 0);
    }

    #[test]
    fn test_sample_format_bytes_per_sample() {
        assert_eq!(SampleFormat::U8.bytes_per_sample(), 1);
        assert_eq!(SampleFormat::S16.bytes_per_sample(), 2);
        assert_eq!(SampleFormat::S32.bytes_per_sample(), 4);
        assert_eq!(SampleFormat::F32.bytes_per_sample(), 4);
        assert_eq!(SampleFormat::F64.bytes_per_sample(), 8);
    }

    #[test]
    fn test_audio_encoder_config_defaults_and_overrides() {
        let config = AudioEncoderConfig::new(48_000, 2, AudioCodec::Aac);
        assert_eq!(config.sample_rate, 48_000);
        assert_eq!(config.channels, 2);
        assert_eq!(config.bitrate, 128_000);
        assert_eq!(config.codec, AudioCodec::Aac);
        assert_eq!(config.sample_format, SampleFormat::F32);

        let config = config
            .with_bitrate(256_000)
            .with_sample_format(SampleFormat::S16);
        assert_eq!(config.bitrate, 256_000);
        assert_eq!(config.sample_format, SampleFormat::S16);
    }

    // ---- EncoderPreset ----

    #[test]
    fn test_encoder_preset_roundtrip() {
        for preset in [
            EncoderPreset::Ultrafast,
            EncoderPreset::Fast,
            EncoderPreset::Medium,
            EncoderPreset::Slow,
            EncoderPreset::Veryslow,
        ] {
            let s = preset.as_str();
            assert!(!s.is_empty(), "empty string for preset {:?}", preset);
        }
    }

    // ---- HwEncoderType ----

    #[test]
    fn test_hw_encoder_is_hardware() {
        assert!(HwEncoderType::VideoToolbox.is_hardware());
        assert!(HwEncoderType::Nvenc.is_hardware());
        assert!(HwEncoderType::Vaapi.is_hardware());
        assert!(HwEncoderType::Qsv.is_hardware());
        assert!(HwEncoderType::Amf.is_hardware());
        assert!(HwEncoderType::Auto.is_hardware());
        assert!(!HwEncoderType::None.is_hardware());
    }

    // ---- HwAccelType ----

    #[test]
    fn test_hw_accel_is_hardware() {
        assert!(HwAccelType::VideoToolbox.is_hardware());
        assert!(HwAccelType::Cuda.is_hardware());
        assert!(HwAccelType::Auto.is_hardware());
        assert!(!HwAccelType::None.is_hardware());
    }

    // ---- PixelFormat ----

    #[test]
    fn test_pixel_format_bytes_per_pixel() {
        assert_eq!(PixelFormat::Nv12.bytes_per_pixel(), 1.5);
        assert_eq!(PixelFormat::Rgba.bytes_per_pixel(), 4.0);
        assert_eq!(PixelFormat::Yuv420p.bytes_per_pixel(), 1.5);
    }

    // ---- ContainerFormat ----

    #[test]
    fn test_container_format_extension() {
        assert_eq!(ContainerFormat::Mp4.extension(), "mp4");
        assert_eq!(ContainerFormat::Mov.extension(), "mov");
        assert_eq!(ContainerFormat::Mkv.extension(), "mkv");
    }

    // ---- VideoCodecType ----

    #[test]
    fn test_video_codec_type_aliases() {
        assert_eq!(
            VideoCodecType::from_codec_name("avc1"),
            Some(VideoCodecType::H264)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("hev1"),
            Some(VideoCodecType::H265)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("hvc1"),
            Some(VideoCodecType::H265)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("vp09"),
            Some(VideoCodecType::Vp9)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("av01"),
            Some(VideoCodecType::Av1)
        );
        assert_eq!(VideoCodecType::from_codec_name("unknown"), None);
    }
}
