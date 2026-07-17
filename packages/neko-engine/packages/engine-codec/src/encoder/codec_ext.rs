//! FFmpeg extension traits for neko_engine_types codec enumerations
//!
//! These traits add FFmpeg-specific methods to the canonical enum definitions
//! in `neko_engine_types::codec`. The enums themselves live in `neko_engine_types` (single
//! source of truth with Serialize/Deserialize); this module only provides
//! the FFmpeg integration layer needed by the encoder pipeline.

use neko_engine_types::{AudioCodec, ContainerFormat, EncoderPreset, HwEncoderType, VideoCodec};

// =============================================================================
// VideoCodecExt
// =============================================================================

/// FFmpeg-specific extensions for [`VideoCodec`].
pub trait VideoCodecExt {
    /// FFmpeg software encoder name (e.g. `"libx264"`).
    fn ffmpeg_name(&self) -> &'static str;

    /// Default bitrate in bps for the given resolution.
    fn default_bitrate(&self, width: u32, height: u32) -> u64;
}

impl VideoCodecExt for VideoCodec {
    fn ffmpeg_name(&self) -> &'static str {
        match self {
            VideoCodec::H264 => "libx264",
            VideoCodec::H265 => "libx265",
            VideoCodec::Vp9 => "libvpx-vp9",
            VideoCodec::Av1 => "libsvtav1",
            VideoCodec::ProRes => "prores_ks",
        }
    }

    fn default_bitrate(&self, width: u32, height: u32) -> u64 {
        let pixels = (width * height) as u64;
        match self {
            VideoCodec::H264 => pixels * 4,    // ~4 bits per pixel
            VideoCodec::H265 => pixels * 3,    // ~3 bits per pixel (more efficient)
            VideoCodec::Vp9 => pixels * 3,     // Similar to H.265
            VideoCodec::Av1 => pixels * 2,     // Most efficient
            VideoCodec::ProRes => pixels * 12, // Higher quality
        }
    }
}

// =============================================================================
// HwEncoderTypeExt
// =============================================================================

/// FFmpeg-specific extensions for [`HwEncoderType`].
pub trait HwEncoderTypeExt {
    /// FFmpeg hardware encoder name for the given codec, or `None` if unsupported.
    fn encoder_name(&self, codec: VideoCodec) -> Option<&'static str>;

    /// Whether this hardware encoder supports the given codec.
    fn supports_codec(&self, codec: VideoCodec) -> bool;

    /// FFmpeg device type string for hardware context creation.
    fn device_type(&self) -> Option<&'static str>;
}

impl HwEncoderTypeExt for HwEncoderType {
    fn encoder_name(&self, codec: VideoCodec) -> Option<&'static str> {
        match (self, codec) {
            // VideoToolbox (macOS)
            (HwEncoderType::VideoToolbox, VideoCodec::H264) => Some("h264_videotoolbox"),
            (HwEncoderType::VideoToolbox, VideoCodec::H265) => Some("hevc_videotoolbox"),
            (HwEncoderType::VideoToolbox, VideoCodec::ProRes) => Some("prores_videotoolbox"),
            // NVENC (NVIDIA)
            (HwEncoderType::Nvenc, VideoCodec::H264) => Some("h264_nvenc"),
            (HwEncoderType::Nvenc, VideoCodec::H265) => Some("hevc_nvenc"),
            (HwEncoderType::Nvenc, VideoCodec::Av1) => Some("av1_nvenc"),
            // VAAPI (Linux)
            (HwEncoderType::Vaapi, VideoCodec::H264) => Some("h264_vaapi"),
            (HwEncoderType::Vaapi, VideoCodec::H265) => Some("hevc_vaapi"),
            // QSV (Intel)
            (HwEncoderType::Qsv, VideoCodec::H264) => Some("h264_qsv"),
            (HwEncoderType::Qsv, VideoCodec::H265) => Some("hevc_qsv"),
            // AMF (AMD)
            (HwEncoderType::Amf, VideoCodec::H264) => Some("h264_amf"),
            (HwEncoderType::Amf, VideoCodec::H265) => Some("hevc_amf"),
            (HwEncoderType::Amf, VideoCodec::Av1) => Some("av1_amf"),
            // VP9 and other combos have no hardware encoders
            _ => None,
        }
    }

    fn supports_codec(&self, codec: VideoCodec) -> bool {
        self.encoder_name(codec).is_some()
    }

    fn device_type(&self) -> Option<&'static str> {
        match self {
            HwEncoderType::VideoToolbox => Some("videotoolbox"),
            HwEncoderType::Nvenc => Some("cuda"),
            HwEncoderType::Vaapi => Some("vaapi"),
            HwEncoderType::Qsv => Some("qsv"),
            HwEncoderType::Amf => Some("amf"),
            HwEncoderType::None | HwEncoderType::Auto => None,
        }
    }
}

// =============================================================================
// EncoderPresetExt
// =============================================================================

/// FFmpeg-specific extensions for [`EncoderPreset`].
pub trait EncoderPresetExt {
    /// FFmpeg preset string (e.g. `"ultrafast"`, `"medium"`).
    fn ffmpeg_name(&self) -> &'static str;
}

impl EncoderPresetExt for EncoderPreset {
    fn ffmpeg_name(&self) -> &'static str {
        match self {
            EncoderPreset::Ultrafast => "ultrafast",
            EncoderPreset::Fast => "fast",
            EncoderPreset::Medium => "medium",
            EncoderPreset::Slow => "slow",
            EncoderPreset::Veryslow => "veryslow",
        }
    }
}

// =============================================================================
// ContainerFormatExt
// =============================================================================

/// FFmpeg-specific extensions for [`ContainerFormat`].
pub trait ContainerFormatExt {
    /// FFmpeg muxer format name (e.g. `"mp4"`, `"matroska"`).
    fn ffmpeg_name(&self) -> &'static str;

    /// Whether the container supports the given video codec.
    fn supports_codec(&self, codec: VideoCodec) -> bool;
}

impl ContainerFormatExt for ContainerFormat {
    fn ffmpeg_name(&self) -> &'static str {
        match self {
            ContainerFormat::Mp4 => "mp4",
            ContainerFormat::Mkv => "matroska",
            ContainerFormat::Webm => "webm",
            ContainerFormat::Mov => "mov",
            ContainerFormat::Avi => "avi",
            ContainerFormat::Ts => "mpegts",
        }
    }

    fn supports_codec(&self, codec: VideoCodec) -> bool {
        match self {
            ContainerFormat::Mp4 | ContainerFormat::Mov => {
                matches!(
                    codec,
                    VideoCodec::H264 | VideoCodec::H265 | VideoCodec::Av1 | VideoCodec::ProRes
                )
            }
            ContainerFormat::Mkv => true, // MKV supports all codecs
            ContainerFormat::Webm => matches!(codec, VideoCodec::Vp9 | VideoCodec::Av1),
            ContainerFormat::Avi => {
                matches!(codec, VideoCodec::H264 | VideoCodec::H265)
            }
            ContainerFormat::Ts => {
                matches!(codec, VideoCodec::H264 | VideoCodec::H265)
            }
        }
    }
}

// =============================================================================
// AudioCodecExt
// =============================================================================

/// FFmpeg-specific extensions for [`AudioCodec`].
pub trait AudioCodecExt {
    /// FFmpeg encoder name (e.g. `"aac"`, `"libopus"`).
    fn ffmpeg_encoder_name(&self) -> &'static str;

    /// Default bitrate in bps (0 for lossless codecs).
    fn default_bitrate(&self) -> u64;

    /// Whether this codec is lossless.
    fn is_lossless(&self) -> bool;
}

impl AudioCodecExt for AudioCodec {
    fn ffmpeg_encoder_name(&self) -> &'static str {
        match self {
            AudioCodec::Aac => "aac",
            AudioCodec::Mp3 => "libmp3lame",
            AudioCodec::Opus => "libopus",
            AudioCodec::Flac => "flac",
            AudioCodec::Pcm => "pcm_s16le",
            AudioCodec::Vorbis => "libvorbis",
        }
    }

    fn default_bitrate(&self) -> u64 {
        match self {
            AudioCodec::Aac => 128_000,
            AudioCodec::Mp3 => 192_000,
            AudioCodec::Opus => 96_000,
            AudioCodec::Vorbis => 128_000,
            AudioCodec::Flac => 0, // Lossless, no bitrate
            AudioCodec::Pcm => 0,  // Uncompressed
        }
    }

    fn is_lossless(&self) -> bool {
        matches!(self, AudioCodec::Flac | AudioCodec::Pcm)
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_video_codec_ffmpeg_name() {
        assert_eq!(VideoCodec::H264.ffmpeg_name(), "libx264");
        assert_eq!(VideoCodec::H265.ffmpeg_name(), "libx265");
        assert_eq!(VideoCodec::Vp9.ffmpeg_name(), "libvpx-vp9");
        assert_eq!(VideoCodec::Av1.ffmpeg_name(), "libsvtav1");
        assert_eq!(VideoCodec::ProRes.ffmpeg_name(), "prores_ks");
    }

    #[test]
    fn test_video_codec_default_bitrate() {
        let bitrate_h264 = VideoCodec::H264.default_bitrate(1920, 1080);
        let bitrate_av1 = VideoCodec::Av1.default_bitrate(1920, 1080);
        // AV1 should be more efficient (lower bitrate)
        assert!(bitrate_av1 < bitrate_h264);
    }

    #[test]
    fn test_hw_encoder_type_names() {
        // VideoToolbox
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H264),
            Some("h264_videotoolbox")
        );
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::H265),
            Some("hevc_videotoolbox")
        );

        // NVENC
        assert_eq!(
            HwEncoderType::Nvenc.encoder_name(VideoCodec::H264),
            Some("h264_nvenc")
        );
        assert_eq!(
            HwEncoderType::Nvenc.encoder_name(VideoCodec::Av1),
            Some("av1_nvenc")
        );

        // AMF
        assert_eq!(
            HwEncoderType::Amf.encoder_name(VideoCodec::H264),
            Some("h264_amf")
        );
        assert_eq!(
            HwEncoderType::Amf.encoder_name(VideoCodec::H265),
            Some("hevc_amf")
        );
        assert_eq!(
            HwEncoderType::Amf.encoder_name(VideoCodec::Av1),
            Some("av1_amf")
        );

        // None returns None
        assert_eq!(HwEncoderType::None.encoder_name(VideoCodec::H264), None);

        // ProRes: VideoToolbox supported, other platforms not
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::ProRes),
            Some("prores_videotoolbox")
        );
        assert_eq!(HwEncoderType::Nvenc.encoder_name(VideoCodec::ProRes), None);
        assert_eq!(HwEncoderType::Amf.encoder_name(VideoCodec::ProRes), None);

        // VP9 has no hardware encoders
        assert_eq!(
            HwEncoderType::VideoToolbox.encoder_name(VideoCodec::Vp9),
            None
        );
    }

    #[test]
    fn test_container_format_ffmpeg_name() {
        assert_eq!(ContainerFormat::Mp4.ffmpeg_name(), "mp4");
        assert_eq!(ContainerFormat::Mkv.ffmpeg_name(), "matroska");
        assert_eq!(ContainerFormat::Webm.ffmpeg_name(), "webm");
        assert_eq!(ContainerFormat::Mov.ffmpeg_name(), "mov");
        assert_eq!(ContainerFormat::Avi.ffmpeg_name(), "avi");
        assert_eq!(ContainerFormat::Ts.ffmpeg_name(), "mpegts");
    }

    #[test]
    fn test_container_codec_compatibility() {
        assert!(ContainerFormat::Mp4.supports_codec(VideoCodec::H264));
        assert!(ContainerFormat::Mp4.supports_codec(VideoCodec::H265));
        assert!(ContainerFormat::Mp4.supports_codec(VideoCodec::Av1));
        assert!(!ContainerFormat::Mp4.supports_codec(VideoCodec::Vp9));

        assert!(ContainerFormat::Webm.supports_codec(VideoCodec::Vp9));
        assert!(ContainerFormat::Webm.supports_codec(VideoCodec::Av1));
        assert!(!ContainerFormat::Webm.supports_codec(VideoCodec::H264));

        assert!(ContainerFormat::Mkv.supports_codec(VideoCodec::H264));
        assert!(ContainerFormat::Mkv.supports_codec(VideoCodec::Vp9));
        assert!(ContainerFormat::Mkv.supports_codec(VideoCodec::Av1));
    }

    #[test]
    fn test_audio_codec_ext() {
        assert_eq!(AudioCodec::Aac.ffmpeg_encoder_name(), "aac");
        assert_eq!(AudioCodec::Vorbis.ffmpeg_encoder_name(), "libvorbis");
        assert_eq!(AudioCodec::Aac.default_bitrate(), 128_000);
        assert_eq!(AudioCodec::Vorbis.default_bitrate(), 128_000);
        assert!(!AudioCodec::Aac.is_lossless());
        assert!(AudioCodec::Flac.is_lossless());
        assert!(AudioCodec::Pcm.is_lossless());
    }

    #[test]
    fn test_encoder_preset_ffmpeg_name() {
        assert_eq!(EncoderPreset::Ultrafast.ffmpeg_name(), "ultrafast");
        assert_eq!(EncoderPreset::Fast.ffmpeg_name(), "fast");
        assert_eq!(EncoderPreset::Medium.ffmpeg_name(), "medium");
        assert_eq!(EncoderPreset::Slow.ffmpeg_name(), "slow");
        assert_eq!(EncoderPreset::Veryslow.ffmpeg_name(), "veryslow");
    }

    #[test]
    fn test_hw_encoder_device_type() {
        assert_eq!(
            HwEncoderType::VideoToolbox.device_type(),
            Some("videotoolbox")
        );
        assert_eq!(HwEncoderType::Nvenc.device_type(), Some("cuda"));
        assert_eq!(HwEncoderType::Amf.device_type(), Some("amf"));
        assert_eq!(HwEncoderType::None.device_type(), None);
        assert_eq!(HwEncoderType::Auto.device_type(), None);
    }
}
