//! Container muxer for video/audio output

use super::codec_ext::ContainerFormatExt;
use super::traits::{ContainerFormat, EncodedPacket, EncoderConfig, VideoCodec};
use crate::error::{Error, Result};
use neko_engine_types::{AudioCodec, AudioEncoderConfig};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::Rational;

use std::path::Path;

/// Stream information for muxing
#[derive(Debug, Clone)]
pub struct StreamInfo {
    /// Stream index in the output
    pub index: usize,
    /// Time base for this stream
    pub time_base: Rational,
}

/// Muxer trait for container output
pub trait Muxer {
    /// Open output file
    fn open(&mut self, path: &str, format: ContainerFormat) -> Result<()>;

    /// Add a video stream
    fn add_video_stream(&mut self, config: &EncoderConfig) -> Result<StreamInfo>;

    /// Add an audio stream
    fn add_audio_stream(&mut self, config: &AudioEncoderConfig) -> Result<StreamInfo>;

    /// Write header (must be called after adding all streams)
    fn write_header(&mut self) -> Result<()>;

    /// Write a video packet
    fn write_video_packet(&mut self, packet: &EncodedPacket) -> Result<()>;

    /// Write an audio packet
    fn write_audio_packet(&mut self, packet: &EncodedPacket) -> Result<()>;

    /// Write trailer and close file
    fn finish(&mut self) -> Result<()>;

    /// Check if muxer is open
    fn is_open(&self) -> bool;
}

/// FFmpeg-based muxer
pub struct FfmpegMuxer {
    output_ctx: Option<ffmpeg::format::context::Output>,
    video_stream_index: Option<usize>,
    audio_stream_index: Option<usize>,
    video_time_base: Rational,
    audio_time_base: Rational,
    header_written: bool,
}

impl FfmpegMuxer {
    /// Create a new FFmpeg muxer
    pub fn new() -> Self {
        Self {
            output_ctx: None,
            video_stream_index: None,
            audio_stream_index: None,
            video_time_base: Rational::new(1, 1000),
            audio_time_base: Rational::new(1, 48000),
            header_written: false,
        }
    }

    /// Get FFmpeg codec ID for video codec
    fn video_codec_id(codec: VideoCodec) -> ffmpeg::codec::Id {
        match codec {
            VideoCodec::H264 => ffmpeg::codec::Id::H264,
            VideoCodec::H265 => ffmpeg::codec::Id::HEVC,
            VideoCodec::Vp9 => ffmpeg::codec::Id::VP9,
            VideoCodec::Av1 => ffmpeg::codec::Id::AV1,
            VideoCodec::ProRes => ffmpeg::codec::Id::PRORES,
        }
    }

    /// Get FFmpeg codec ID for audio codec
    fn audio_codec_id(codec: AudioCodec) -> ffmpeg::codec::Id {
        match codec {
            AudioCodec::Aac => ffmpeg::codec::Id::AAC,
            AudioCodec::Mp3 => ffmpeg::codec::Id::MP3,
            AudioCodec::Opus => ffmpeg::codec::Id::OPUS,
            AudioCodec::Flac => ffmpeg::codec::Id::FLAC,
            AudioCodec::Pcm => ffmpeg::codec::Id::PCM_S16LE,
            AudioCodec::Vorbis => ffmpeg::codec::Id::VORBIS,
        }
    }

    /// Set audio stream extradata (e.g. OpusHead for Opus in MP4).
    /// Must be called after `add_audio_stream()` and before `write_header()`.
    pub fn set_audio_extradata(&mut self, extradata: &[u8]) -> Result<()> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .audio_stream_index
            .ok_or_else(|| Error::InvalidParameter("No audio stream added".to_string()))?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Cannot set extradata after header is written".to_string(),
            ));
        }

        unsafe {
            // Access the stream's codecpar via the raw AVFormatContext pointer
            let fmt_ctx = output_ctx.as_mut_ptr();
            if stream_index >= (*fmt_ctx).nb_streams as usize {
                return Err(Error::InvalidParameter(
                    "Audio stream index out of range".to_string(),
                ));
            }
            let stream_ptr = *(*fmt_ctx).streams.add(stream_index);
            let params_ptr = (*stream_ptr).codecpar;

            // Free existing extradata if any
            if !(*params_ptr).extradata.is_null() {
                ffmpeg::ffi::av_free((*params_ptr).extradata as *mut _);
                (*params_ptr).extradata = std::ptr::null_mut();
                (*params_ptr).extradata_size = 0;
            }

            // Allocate and copy new extradata (av_malloc for FFmpeg-managed memory)
            let size = extradata.len();
            let buf =
                ffmpeg::ffi::av_malloc(size + ffmpeg::ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize)
                    as *mut u8;
            if buf.is_null() {
                return Err(Error::Other(
                    "Failed to allocate extradata buffer".to_string(),
                ));
            }
            std::ptr::copy_nonoverlapping(extradata.as_ptr(), buf, size);
            // Zero padding bytes
            std::ptr::write_bytes(
                buf.add(size),
                0,
                ffmpeg::ffi::AV_INPUT_BUFFER_PADDING_SIZE as usize,
            );

            (*params_ptr).extradata = buf;
            (*params_ptr).extradata_size = size as i32;
        }

        tracing::info!(
            "Set audio extradata: {} bytes for stream {}",
            extradata.len(),
            stream_index
        );

        Ok(())
    }
}

impl Default for FfmpegMuxer {
    fn default() -> Self {
        Self::new()
    }
}

impl Muxer for FfmpegMuxer {
    fn open(&mut self, path: &str, format: ContainerFormat) -> Result<()> {
        // Create parent directory if it doesn't exist
        if let Some(parent) = Path::new(path).parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    Error::Other(format!(
                        "Failed to create output directory {}: {}",
                        parent.display(),
                        e
                    ))
                })?;
                tracing::info!("Created output directory: {}", parent.display());
            }
        }

        // Create output context
        let output_ctx = ffmpeg::format::output_as(path, format.ffmpeg_name())?;

        self.output_ctx = Some(output_ctx);
        self.video_stream_index = None;
        self.audio_stream_index = None;
        self.header_written = false;

        tracing::info!("Muxer opened: {} (format: {:?})", path, format);

        Ok(())
    }

    fn add_video_stream(&mut self, config: &EncoderConfig) -> Result<StreamInfo> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Cannot add stream after header is written".to_string(),
            ));
        }

        // Find encoder for codec
        let codec = ffmpeg::encoder::find(Self::video_codec_id(config.codec))
            .ok_or_else(|| Error::Ffmpeg(format!("Video codec {:?} not found", config.codec)))?;

        // Add stream
        let mut stream = output_ctx.add_stream(codec)?;
        let stream_index = stream.index();

        // Set stream time_base to match encoder's time_base
        // Encoder uses: time_base = 1000 / (fps * 1000) = 1/fps
        // For 30fps: time_base = 1/30
        // PTS values from encoder are frame indices (0, 1, 2, ...)
        // So PTS=1 means 1/30 second
        let time_base = Rational::new(1, config.fps as i32);
        stream.set_time_base(time_base);

        // Set codec parameters including frame rate
        unsafe {
            let mut params = stream.parameters();
            let params_ptr = params.as_mut_ptr();

            (*params_ptr).codec_type = ffmpeg::ffi::AVMediaType::AVMEDIA_TYPE_VIDEO;
            (*params_ptr).codec_id = Self::video_codec_id(config.codec).into();
            (*params_ptr).width = config.width as i32;
            (*params_ptr).height = config.height as i32;
            (*params_ptr).bit_rate = config.bitrate as i64;
            (*params_ptr).format = match config.codec {
                VideoCodec::ProRes => ffmpeg::ffi::AVPixelFormat::AV_PIX_FMT_YUV422P10LE as i32,
                _ => ffmpeg::ffi::AVPixelFormat::AV_PIX_FMT_YUV420P as i32,
            };
            // Set frame rate explicitly
            (*params_ptr).framerate.num = config.fps as i32;
            (*params_ptr).framerate.den = 1;
        }

        self.video_stream_index = Some(stream_index);
        self.video_time_base = time_base;

        tracing::info!(
            "Added video stream: index={}, codec={:?}, {}x{}",
            stream_index,
            config.codec,
            config.width,
            config.height
        );

        Ok(StreamInfo {
            index: stream_index,
            time_base,
        })
    }

    fn add_audio_stream(&mut self, config: &AudioEncoderConfig) -> Result<StreamInfo> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Cannot add stream after header is written".to_string(),
            ));
        }

        // Find encoder for codec
        let codec = ffmpeg::encoder::find(Self::audio_codec_id(config.codec))
            .ok_or_else(|| Error::Ffmpeg(format!("Audio codec {:?} not found", config.codec)))?;

        // Add stream
        let mut stream = output_ctx.add_stream(codec)?;
        let stream_index = stream.index();

        // Set stream parameters
        let time_base = Rational::new(1, config.sample_rate as i32);
        stream.set_time_base(time_base);

        // Set codec parameters
        unsafe {
            let mut params = stream.parameters();
            let params_ptr = params.as_mut_ptr();

            (*params_ptr).codec_type = ffmpeg::ffi::AVMediaType::AVMEDIA_TYPE_AUDIO;
            (*params_ptr).codec_id = Self::audio_codec_id(config.codec).into();
            (*params_ptr).sample_rate = config.sample_rate as i32;

            // Set channel layout using the new API
            (*params_ptr).ch_layout.nb_channels = config.channels as i32;

            (*params_ptr).bit_rate = config.bitrate as i64;
        }

        self.audio_stream_index = Some(stream_index);
        self.audio_time_base = time_base;

        tracing::info!(
            "Added audio stream: index={}, codec={:?}, {}Hz, {} channels",
            stream_index,
            config.codec,
            config.sample_rate,
            config.channels
        );

        Ok(StreamInfo {
            index: stream_index,
            time_base,
        })
    }

    fn write_header(&mut self) -> Result<()> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        if self.header_written {
            return Err(Error::InvalidParameter(
                "Header already written".to_string(),
            ));
        }

        output_ctx.write_header()?;
        self.header_written = true;

        tracing::info!("Muxer header written");

        Ok(())
    }

    fn write_video_packet(&mut self, packet: &EncodedPacket) -> Result<()> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .video_stream_index
            .ok_or_else(|| Error::InvalidParameter("No video stream added".to_string()))?;

        if !self.header_written {
            return Err(Error::InvalidParameter(
                "Header must be written before packets".to_string(),
            ));
        }

        // Get the actual stream time_base from FFmpeg (may differ from what we set)
        let stream = output_ctx
            .stream(stream_index)
            .ok_or_else(|| Error::InvalidParameter("Video stream not found".to_string()))?;
        let stream_time_base = stream.time_base();

        // Rescale PTS from encoder time_base (1/fps) to stream time_base
        // Encoder outputs PTS as frame index (0, 1, 2, ...)
        // Each frame represents 1/fps seconds
        // Use proper rescaling to avoid precision loss
        // Formula: scaled_pts = pts * stream_time_base.den / video_time_base.den
        let stream_tb_den = stream_time_base.denominator() as i64;
        let video_tb_den = self.video_time_base.denominator() as i64;

        // Log time_base info for debugging (only once)
        static LOGGED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !LOGGED.swap(true, std::sync::atomic::Ordering::Relaxed) {
            tracing::info!(
                "Muxer time_base: video_tb=1/{}, stream_tb=1/{}, scale={}",
                video_tb_den,
                stream_tb_den,
                stream_tb_den / video_tb_den
            );
        }

        // Use multiplication first to avoid precision loss from integer division
        let scaled_pts = packet.pts * stream_tb_den / video_tb_den;
        let scaled_dts = packet.dts * stream_tb_den / video_tb_den;
        let scaled_duration = if packet.duration > 0 {
            packet.duration * stream_tb_den / video_tb_den
        } else {
            stream_tb_den / video_tb_den // Default to 1 frame duration
        };

        // Create FFmpeg packet with rescaled timestamps
        let mut ffmpeg_packet = ffmpeg::Packet::copy(&packet.data);
        ffmpeg_packet.set_stream(stream_index);
        ffmpeg_packet.set_pts(Some(scaled_pts));
        ffmpeg_packet.set_dts(Some(scaled_dts));
        ffmpeg_packet.set_duration(scaled_duration);

        if packet.is_keyframe {
            ffmpeg_packet.set_flags(ffmpeg::codec::packet::Flags::KEY);
        }

        // Write packet interleaved (required for proper A/V sync)
        ffmpeg_packet.write_interleaved(output_ctx)?;

        Ok(())
    }

    fn write_audio_packet(&mut self, packet: &EncodedPacket) -> Result<()> {
        let output_ctx = self.output_ctx.as_mut().ok_or(Error::MuxerNotInitialized)?;

        let stream_index = self
            .audio_stream_index
            .ok_or_else(|| Error::InvalidParameter("No audio stream added".to_string()))?;

        if !self.header_written {
            return Err(Error::InvalidParameter(
                "Header must be written before packets".to_string(),
            ));
        }

        // Create FFmpeg packet
        let mut ffmpeg_packet = ffmpeg::Packet::copy(&packet.data);
        ffmpeg_packet.set_stream(stream_index);
        ffmpeg_packet.set_pts(Some(packet.pts));
        ffmpeg_packet.set_dts(Some(packet.dts));
        ffmpeg_packet.set_duration(packet.duration);

        // Write packet
        ffmpeg_packet.write_interleaved(output_ctx)?;

        Ok(())
    }

    fn finish(&mut self) -> Result<()> {
        if let Some(ref mut output_ctx) = self.output_ctx {
            if self.header_written {
                output_ctx.write_trailer()?;
                tracing::info!("Muxer finished");
            }
        }

        self.output_ctx = None;
        self.video_stream_index = None;
        self.audio_stream_index = None;
        self.header_written = false;

        Ok(())
    }

    fn is_open(&self) -> bool {
        self.output_ctx.is_some()
    }
}

impl Drop for FfmpegMuxer {
    fn drop(&mut self) {
        let _ = self.finish();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encoder::codec_ext::ContainerFormatExt;

    #[test]
    fn test_container_format() {
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
        assert!(!ContainerFormat::Mp4.supports_codec(VideoCodec::Vp9));

        assert!(ContainerFormat::Webm.supports_codec(VideoCodec::Vp9));
        assert!(!ContainerFormat::Webm.supports_codec(VideoCodec::H264));

        assert!(ContainerFormat::Mkv.supports_codec(VideoCodec::H264));
        assert!(ContainerFormat::Mkv.supports_codec(VideoCodec::Vp9));
    }
}
