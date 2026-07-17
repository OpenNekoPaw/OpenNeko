//! FFmpeg-based audio encoder

use super::traits::{
    AudioCodec, AudioEncoder, AudioEncoderConfig, EncodedAudioPacket, SampleFormat,
};
use crate::error::{Error, Result};
use neko_engine_codec::encoder::codec_ext::AudioCodecExt;

use ffmpeg_next as ffmpeg;
use ffmpeg_next::codec::Id;
use ffmpeg_next::format::Sample;
use ffmpeg_next::software::resampling::Context as ResamplerContext;
use ffmpeg_next::util::frame::audio::Audio as AudioFrame;
use ffmpeg_next::{ChannelLayout, Dictionary, Rational};

/// FFmpeg audio encoder with FIFO buffering
///
/// Audio decoders output variable-size frames, but encoders (especially Opus)
/// require fixed-size frames (e.g. 960 samples at 48kHz = 20ms).
/// The internal FIFO buffer accumulates decoded samples and feeds the encoder
/// in exact `frame_size` chunks.
///
/// Pipeline: Input PCM → Resampler → FIFO → Encoder → Packets
pub struct FfmpegAudioEncoder {
    encoder: Option<ffmpeg::encoder::Audio>,
    resampler: Option<ResamplerContext>,
    config: Option<AudioEncoderConfig>,
    pts: i64,
    time_base: Rational,
    frame_size: usize,
    /// FIFO buffer: accumulates resampled samples until we have frame_size
    fifo: Vec<u8>,
    /// Encoder's required sample format (after resampling)
    encoder_format: Option<Sample>,
    /// Encoder's channel layout
    encoder_channel_layout: Option<ChannelLayout>,
}

impl FfmpegAudioEncoder {
    /// Create a new audio encoder
    pub fn new() -> Self {
        Self {
            encoder: None,
            resampler: None,
            config: None,
            pts: 0,
            time_base: Rational::new(1, 48000),
            frame_size: 1024,
            fifo: Vec::new(),
            encoder_format: None,
            encoder_channel_layout: None,
        }
    }

    /// Get FFmpeg codec ID for audio codec
    fn codec_id(codec: AudioCodec) -> Id {
        match codec {
            AudioCodec::Aac => Id::AAC,
            AudioCodec::Mp3 => Id::MP3,
            AudioCodec::Opus => Id::OPUS,
            AudioCodec::Flac => Id::FLAC,
            AudioCodec::Pcm => Id::PCM_S16LE,
            AudioCodec::Vorbis => Id::VORBIS,
        }
    }

    /// Convert SampleFormat to FFmpeg Sample format (packed for input)
    fn to_ffmpeg_sample_format_packed(format: SampleFormat) -> Sample {
        match format {
            SampleFormat::U8 => Sample::U8(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S16 => Sample::I16(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S32 => Sample::I32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F32 => Sample::F32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F64 => Sample::F64(ffmpeg::format::sample::Type::Packed),
        }
    }

    /// Get the preferred sample format for encoder
    fn encoder_sample_format(codec: AudioCodec) -> Sample {
        match codec {
            AudioCodec::Aac => Sample::F32(ffmpeg::format::sample::Type::Planar),
            AudioCodec::Mp3 => Sample::I16(ffmpeg::format::sample::Type::Planar),
            AudioCodec::Opus => Sample::I16(ffmpeg::format::sample::Type::Packed),
            AudioCodec::Flac => Sample::I16(ffmpeg::format::sample::Type::Packed),
            AudioCodec::Pcm => Sample::I16(ffmpeg::format::sample::Type::Packed),
            AudioCodec::Vorbis => Sample::F32(ffmpeg::format::sample::Type::Planar),
        }
    }

    /// Get channel layout for channel count
    fn channel_layout_for_channels(channels: u16) -> ChannelLayout {
        match channels {
            1 => ChannelLayout::MONO,
            2 => ChannelLayout::STEREO,
            6 => ChannelLayout::_5POINT1,
            8 => ChannelLayout::_7POINT1,
            _ => ChannelLayout::default(channels as i32),
        }
    }

    /// Get codec extradata (e.g. OpusHead for Opus) from the encoder context.
    /// Must be called after `open()`. Returns None if encoder has no extradata.
    pub fn get_extradata(&self) -> Option<Vec<u8>> {
        let encoder = self.encoder.as_ref()?;
        unsafe {
            let ctx = encoder.as_ptr();
            let extradata = (*ctx).extradata;
            let size = (*ctx).extradata_size as usize;
            if extradata.is_null() || size == 0 {
                return None;
            }
            let data = std::slice::from_raw_parts(extradata, size).to_vec();
            tracing::debug!("Audio encoder extradata: {} bytes", size,);
            Some(data)
        }
    }

    /// Receive encoded packets from encoder
    fn receive_packets(&mut self) -> Result<Vec<EncodedAudioPacket>> {
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        let mut packets = Vec::new();
        let mut packet = ffmpeg::Packet::empty();

        loop {
            match encoder.receive_packet(&mut packet) {
                Ok(_) => {
                    packets.push(EncodedAudioPacket {
                        data: packet.data().unwrap_or(&[]).to_vec(),
                        pts: packet.pts().unwrap_or(0),
                        duration: packet.duration(),
                        stream_index: 0,
                    });
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    break;
                }
                Err(ffmpeg::Error::Eof) => {
                    break;
                }
                Err(e) => {
                    return Err(Error::EncodeFailed(e.to_string()));
                }
            }
        }

        Ok(packets)
    }
}

impl Default for FfmpegAudioEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioEncoder for FfmpegAudioEncoder {
    fn open(&mut self, config: &AudioEncoderConfig) -> Result<()> {
        // Find encoder
        let codec = ffmpeg::encoder::find(Self::codec_id(config.codec))
            .ok_or_else(|| Error::Ffmpeg(format!("Audio codec {:?} not found", config.codec)))?;

        // Create encoder context
        let _context = ffmpeg::codec::context::Context::new_with_codec(codec);
        let mut encoder = _context.encoder().audio()?;

        // Set encoding parameters
        encoder.set_rate(config.sample_rate as i32);

        let channel_layout = Self::channel_layout_for_channels(config.channels);
        encoder.set_channel_layout(channel_layout);

        // Set sample format
        let encoder_format = Self::encoder_sample_format(config.codec);
        encoder.set_format(encoder_format);

        // Set bitrate (if not lossless)
        if !config.codec.is_lossless() && config.bitrate > 0 {
            encoder.set_bit_rate(config.bitrate as usize);
        }

        // Set time base
        self.time_base = Rational::new(1, config.sample_rate as i32);
        encoder.set_time_base(self.time_base);

        // Build encoder options
        let opts = Dictionary::new();

        // Open encoder
        let encoder = encoder.open_with(opts)?;

        // Get frame size from encoder
        self.frame_size = encoder.frame_size() as usize;
        if self.frame_size == 0 {
            self.frame_size = 1024; // Default frame size
        }

        // Setup resampler if input format differs from encoder format
        let input_format = Self::to_ffmpeg_sample_format_packed(config.sample_format);
        let needs_resampling = input_format != encoder_format;

        if needs_resampling {
            let resampler = ResamplerContext::get(
                input_format,
                channel_layout,
                config.sample_rate,
                encoder_format,
                channel_layout,
                config.sample_rate,
            )?;

            self.resampler = Some(resampler);
        }

        self.encoder = Some(encoder);
        self.config = Some(config.clone());
        self.pts = 0;
        self.fifo.clear();
        self.encoder_format = Some(encoder_format);
        self.encoder_channel_layout = Some(channel_layout);

        tracing::info!(
            "Audio encoder opened: {:?}, {} Hz, {} channels, {} bps",
            config.codec,
            config.sample_rate,
            config.channels,
            config.bitrate
        );

        Ok(())
    }

    fn encode_frame(&mut self, data: &[u8], samples: usize) -> Result<Vec<EncodedAudioPacket>> {
        let config = self.config.as_ref().ok_or(Error::EncoderNotInitialized)?;
        let encoder_format = self.encoder_format.ok_or(Error::EncoderNotInitialized)?;
        let channel_layout = self
            .encoder_channel_layout
            .ok_or(Error::EncoderNotInitialized)?;

        // Extract values from config to avoid holding the borrow
        let sample_format = config.sample_format;
        let sample_rate = config.sample_rate;
        let channels = config.channels;

        // Create input frame
        let input_format = Self::to_ffmpeg_sample_format_packed(sample_format);
        let input_layout = Self::channel_layout_for_channels(channels);

        let mut input_frame = AudioFrame::new(input_format, samples, input_layout);
        input_frame.set_rate(sample_rate);

        // Copy data to frame
        let plane_data = input_frame.data_mut(0);
        let copy_size = data.len().min(plane_data.len());
        plane_data[..copy_size].copy_from_slice(&data[..copy_size]);

        // Resample if needed
        let resampled = if let Some(ref mut resampler) = self.resampler {
            let mut output = AudioFrame::empty();
            resampler.run(&input_frame, &mut output)?;
            output
        } else {
            input_frame
        };

        // Append resampled data to FIFO
        let resampled_data = resampled.data(0);
        self.fifo.extend_from_slice(resampled_data);

        // Calculate bytes per frame_size chunk
        let bytes_per_sample = match encoder_format {
            Sample::U8(_) => 1,
            Sample::I16(_) => 2,
            Sample::I32(_) | Sample::F32(_) => 4,
            Sample::F64(_) => 8,
            _ => 4,
        };
        let ch_count = channels as usize;
        let chunk_bytes = self.frame_size * ch_count * bytes_per_sample;

        // Drain FIFO in frame_size chunks and encode each
        let mut all_packets = Vec::new();
        while self.fifo.len() >= chunk_bytes {
            let chunk: Vec<u8> = self.fifo.drain(..chunk_bytes).collect();

            let mut enc_frame = AudioFrame::new(encoder_format, self.frame_size, channel_layout);
            enc_frame.set_rate(sample_rate);
            enc_frame.set_pts(Some(self.pts));
            self.pts += self.frame_size as i64;

            // Copy chunk data into frame planes
            // For planar formats, we need to deinterleave
            match encoder_format {
                Sample::F32(ffmpeg::format::sample::Type::Planar)
                | Sample::I16(ffmpeg::format::sample::Type::Planar)
                | Sample::I32(ffmpeg::format::sample::Type::Planar)
                | Sample::F64(ffmpeg::format::sample::Type::Planar)
                | Sample::U8(ffmpeg::format::sample::Type::Planar) => {
                    // Deinterleave: packed input → separate planes
                    let samples_per_ch = self.frame_size;
                    for ch in 0..ch_count {
                        let plane = enc_frame.data_mut(ch);
                        for s in 0..samples_per_ch {
                            let src_offset = (s * ch_count + ch) * bytes_per_sample;
                            let dst_offset = s * bytes_per_sample;
                            if src_offset + bytes_per_sample <= chunk.len()
                                && dst_offset + bytes_per_sample <= plane.len()
                            {
                                plane[dst_offset..dst_offset + bytes_per_sample].copy_from_slice(
                                    &chunk[src_offset..src_offset + bytes_per_sample],
                                );
                            }
                        }
                    }
                }
                _ => {
                    // Packed format: direct copy to plane 0
                    let plane = enc_frame.data_mut(0);
                    let copy_len = chunk.len().min(plane.len());
                    plane[..copy_len].copy_from_slice(&chunk[..copy_len]);
                }
            }

            let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
            encoder.send_frame(&enc_frame)?;
            let packets = self.receive_packets()?;
            all_packets.extend(packets);
        }

        Ok(all_packets)
    }

    fn flush(&mut self) -> Result<Vec<EncodedAudioPacket>> {
        let config = self.config.as_ref().ok_or(Error::EncoderNotInitialized)?;
        let encoder_format = self.encoder_format.ok_or(Error::EncoderNotInitialized)?;
        let channel_layout = self
            .encoder_channel_layout
            .ok_or(Error::EncoderNotInitialized)?;

        // Extract values to avoid holding borrow
        let sample_rate = config.sample_rate;
        let channels = config.channels as usize;

        let mut all_packets = Vec::new();

        // Flush remaining FIFO data as a partial frame (zero-padded)
        if !self.fifo.is_empty() {
            let bytes_per_sample = match encoder_format {
                Sample::U8(_) => 1,
                Sample::I16(_) => 2,
                Sample::I32(_) | Sample::F32(_) => 4,
                Sample::F64(_) => 8,
                _ => 4,
            };
            let remaining_samples = self.fifo.len() / (channels * bytes_per_sample);

            if remaining_samples > 0 {
                let mut enc_frame =
                    AudioFrame::new(encoder_format, remaining_samples, channel_layout);
                enc_frame.set_rate(sample_rate);
                enc_frame.set_pts(Some(self.pts));

                // Copy remaining data (same planar/packed logic)
                let chunk = std::mem::take(&mut self.fifo);
                match encoder_format {
                    Sample::F32(ffmpeg::format::sample::Type::Planar)
                    | Sample::I16(ffmpeg::format::sample::Type::Planar)
                    | Sample::I32(ffmpeg::format::sample::Type::Planar)
                    | Sample::F64(ffmpeg::format::sample::Type::Planar)
                    | Sample::U8(ffmpeg::format::sample::Type::Planar) => {
                        for ch in 0..channels {
                            let plane = enc_frame.data_mut(ch);
                            for s in 0..remaining_samples {
                                let src_offset = (s * channels + ch) * bytes_per_sample;
                                let dst_offset = s * bytes_per_sample;
                                if src_offset + bytes_per_sample <= chunk.len()
                                    && dst_offset + bytes_per_sample <= plane.len()
                                {
                                    plane[dst_offset..dst_offset + bytes_per_sample]
                                        .copy_from_slice(
                                            &chunk[src_offset..src_offset + bytes_per_sample],
                                        );
                                }
                            }
                        }
                    }
                    _ => {
                        let plane = enc_frame.data_mut(0);
                        let copy_len = chunk.len().min(plane.len());
                        plane[..copy_len].copy_from_slice(&chunk[..copy_len]);
                    }
                }

                let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
                encoder.send_frame(&enc_frame)?;
                all_packets.extend(self.receive_packets()?);
            }
        }

        // Send EOF
        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;
        encoder.send_eof()?;

        // Receive remaining packets
        all_packets.extend(self.receive_packets()?);
        Ok(all_packets)
    }

    fn close(&mut self) {
        self.encoder = None;
        self.resampler = None;
        self.config = None;
        self.pts = 0;
        self.fifo.clear();
        self.encoder_format = None;
        self.encoder_channel_layout = None;
    }

    fn config(&self) -> Option<&AudioEncoderConfig> {
        self.config.as_ref()
    }
}

impl Drop for FfmpegAudioEncoder {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_codec_bitrate() {
        assert_eq!(AudioCodec::Aac.default_bitrate(), 128_000);
        assert_eq!(AudioCodec::Mp3.default_bitrate(), 192_000);
        assert_eq!(AudioCodec::Opus.default_bitrate(), 96_000);
        assert_eq!(AudioCodec::Flac.default_bitrate(), 0);
        assert_eq!(AudioCodec::Vorbis.default_bitrate(), 128_000);
    }

    #[test]
    fn test_audio_encoder_config() {
        let config = AudioEncoderConfig::new(48000, 2, AudioCodec::Aac).with_bitrate(256_000);

        assert_eq!(config.sample_rate, 48000);
        assert_eq!(config.channels, 2);
        assert_eq!(config.bitrate, 256_000);
    }
}
