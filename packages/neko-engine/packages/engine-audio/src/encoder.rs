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

    fn append_frame_to_packed_fifo(
        fifo: &mut Vec<u8>,
        frame: &AudioFrame,
        format: Sample,
        channels: usize,
    ) -> Result<()> {
        let bytes_per_sample = Self::bytes_per_sample(format);
        let samples = frame.samples();
        match format {
            Sample::F32(ffmpeg::format::sample::Type::Planar) => {
                for sample in 0..samples {
                    for channel in 0..channels {
                        fifo.extend_from_slice(&frame.plane::<f32>(channel)[sample].to_ne_bytes());
                    }
                }
            }
            Sample::I16(ffmpeg::format::sample::Type::Planar) => {
                for sample in 0..samples {
                    for channel in 0..channels {
                        fifo.extend_from_slice(&frame.plane::<i16>(channel)[sample].to_ne_bytes());
                    }
                }
            }
            Sample::I32(ffmpeg::format::sample::Type::Planar) => {
                for sample in 0..samples {
                    for channel in 0..channels {
                        fifo.extend_from_slice(&frame.plane::<i32>(channel)[sample].to_ne_bytes());
                    }
                }
            }
            Sample::F64(ffmpeg::format::sample::Type::Planar) => {
                for sample in 0..samples {
                    for channel in 0..channels {
                        fifo.extend_from_slice(&frame.plane::<f64>(channel)[sample].to_ne_bytes());
                    }
                }
            }
            Sample::U8(ffmpeg::format::sample::Type::Planar) => {
                for sample in 0..samples {
                    for channel in 0..channels {
                        fifo.push(frame.plane::<u8>(channel)[sample]);
                    }
                }
            }
            Sample::None => {
                return Err(Error::EncodeFailed(
                    "resampled audio frame has no sample format".to_string(),
                ));
            }
            _ => {
                let byte_count = samples
                    .checked_mul(channels)
                    .and_then(|value| value.checked_mul(bytes_per_sample))
                    .ok_or_else(|| {
                        Error::EncodeFailed("resampled audio frame size overflow".to_string())
                    })?;
                let data = frame.data(0);
                if byte_count > data.len() {
                    return Err(Error::EncodeFailed(format!(
                        "resampled packed audio is shorter than {samples} samples"
                    )));
                }
                fifo.extend_from_slice(&data[..byte_count]);
            }
        }
        Ok(())
    }

    fn copy_packed_samples_to_frame(
        frame: &mut AudioFrame,
        format: Sample,
        channels: usize,
        samples: usize,
        packed: &[u8],
    ) -> Result<()> {
        let bytes_per_sample = Self::bytes_per_sample(format);
        let required_bytes = samples
            .checked_mul(channels)
            .and_then(|value| value.checked_mul(bytes_per_sample))
            .ok_or_else(|| Error::EncodeFailed("audio frame size overflow".to_string()))?;
        if packed.len() < required_bytes {
            return Err(Error::EncodeFailed(format!(
                "packed audio is shorter than {samples} samples"
            )));
        }
        match format {
            Sample::F32(ffmpeg::format::sample::Type::Planar) => {
                for channel in 0..channels {
                    let plane = frame.plane_mut::<f32>(channel);
                    for (sample, value) in plane.iter_mut().take(samples).enumerate() {
                        let offset = (sample * channels + channel) * 4;
                        *value = f32::from_ne_bytes(
                            packed[offset..offset + 4]
                                .try_into()
                                .expect("validated f32 sample width"),
                        );
                    }
                }
            }
            Sample::I16(ffmpeg::format::sample::Type::Planar) => {
                for channel in 0..channels {
                    let plane = frame.plane_mut::<i16>(channel);
                    for (sample, value) in plane.iter_mut().take(samples).enumerate() {
                        let offset = (sample * channels + channel) * 2;
                        *value = i16::from_ne_bytes(
                            packed[offset..offset + 2]
                                .try_into()
                                .expect("validated i16 sample width"),
                        );
                    }
                }
            }
            Sample::I32(ffmpeg::format::sample::Type::Planar) => {
                for channel in 0..channels {
                    let plane = frame.plane_mut::<i32>(channel);
                    for (sample, value) in plane.iter_mut().take(samples).enumerate() {
                        let offset = (sample * channels + channel) * 4;
                        *value = i32::from_ne_bytes(
                            packed[offset..offset + 4]
                                .try_into()
                                .expect("validated i32 sample width"),
                        );
                    }
                }
            }
            Sample::F64(ffmpeg::format::sample::Type::Planar) => {
                for channel in 0..channels {
                    let plane = frame.plane_mut::<f64>(channel);
                    for (sample, value) in plane.iter_mut().take(samples).enumerate() {
                        let offset = (sample * channels + channel) * 8;
                        *value = f64::from_ne_bytes(
                            packed[offset..offset + 8]
                                .try_into()
                                .expect("validated f64 sample width"),
                        );
                    }
                }
            }
            Sample::U8(ffmpeg::format::sample::Type::Planar) => {
                for channel in 0..channels {
                    let plane = frame.plane_mut::<u8>(channel);
                    for (sample, value) in plane.iter_mut().take(samples).enumerate() {
                        *value = packed[sample * channels + channel];
                    }
                }
            }
            Sample::None => {
                return Err(Error::EncodeFailed(
                    "audio frame has no sample format".to_string(),
                ));
            }
            _ => {
                frame.data_mut(0)[..required_bytes].copy_from_slice(&packed[..required_bytes]);
            }
        }
        Ok(())
    }

    fn bytes_per_sample(format: Sample) -> usize {
        match format {
            Sample::U8(_) => 1,
            Sample::I16(_) => 2,
            Sample::I32(_) | Sample::F32(_) => 4,
            Sample::F64(_) => 8,
            _ => 4,
        }
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

        Self::append_frame_to_packed_fifo(
            &mut self.fifo,
            &resampled,
            encoder_format,
            channels as usize,
        )?;

        // Calculate bytes per frame_size chunk
        let bytes_per_sample = Self::bytes_per_sample(encoder_format);
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

            Self::copy_packed_samples_to_frame(
                &mut enc_frame,
                encoder_format,
                ch_count,
                self.frame_size,
                &chunk,
            )?;

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
            let bytes_per_sample = Self::bytes_per_sample(encoder_format);
            let remaining_samples = self.fifo.len() / (channels * bytes_per_sample);

            if remaining_samples > 0 {
                let mut enc_frame =
                    AudioFrame::new(encoder_format, remaining_samples, channel_layout);
                enc_frame.set_rate(sample_rate);
                enc_frame.set_pts(Some(self.pts));

                let chunk = std::mem::take(&mut self.fifo);
                Self::copy_packed_samples_to_frame(
                    &mut enc_frame,
                    encoder_format,
                    channels,
                    remaining_samples,
                    &chunk,
                )?;

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

    #[test]
    fn aac_encoder_accepts_finite_stereo_pcm_across_export_frame_boundaries() {
        ffmpeg::init().expect("initialize FFmpeg");
        let config = AudioEncoderConfig::new(48_000, 2, AudioCodec::Aac);
        let mut encoder = FfmpegAudioEncoder::new();
        encoder.open(&config).expect("open AAC encoder");
        let samples = 1_600;
        let mut packets = Vec::new();
        for frame_index in 0..60 {
            let pcm = (0..samples)
                .flat_map(|index| {
                    let sample_index = frame_index * samples + index;
                    let sample = ((sample_index as f32 / 48_000.0) * 440.0 * std::f32::consts::TAU)
                        .sin()
                        * 0.25;
                    [sample, sample]
                })
                .collect::<Vec<_>>();
            let pcm_bytes = pcm
                .iter()
                .flat_map(|sample| sample.to_ne_bytes())
                .collect::<Vec<_>>();
            packets.extend(
                encoder
                    .encode_frame(&pcm_bytes, samples)
                    .unwrap_or_else(|error| {
                        panic!("encode finite PCM frame {frame_index}: {error}")
                    }),
            );
        }
        packets.extend(encoder.flush().expect("flush AAC encoder"));

        assert!(!packets.is_empty());
        assert!(packets.iter().all(|packet| !packet.data.is_empty()));
    }

    #[test]
    fn planar_resampler_padding_does_not_enter_the_packed_fifo() {
        let format = Sample::F32(ffmpeg::format::sample::Type::Planar);
        let mut frame = AudioFrame::new(format, 3, ChannelLayout::STEREO);
        for channel in 0..2 {
            let plane = frame.plane_mut::<f32>(channel);
            for sample in 0..3 {
                let value = (channel * 10 + sample) as f32;
                plane[sample] = value;
            }
        }
        for chunk in frame.data_mut(0)[3 * 4..].chunks_exact_mut(4) {
            chunk.copy_from_slice(&f32::NAN.to_ne_bytes());
        }
        let mut fifo = Vec::new();

        FfmpegAudioEncoder::append_frame_to_packed_fifo(&mut fifo, &frame, format, 2)
            .expect("interleave planar frame");

        let values = fifo
            .chunks_exact(4)
            .map(|chunk| f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect::<Vec<_>>();
        assert_eq!(values, vec![0.0, 10.0, 1.0, 11.0, 2.0, 12.0]);
        assert!(values.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn packed_fifo_populates_every_planar_encoder_channel() {
        let format = Sample::F32(ffmpeg::format::sample::Type::Planar);
        let mut frame = AudioFrame::new(format, 3, ChannelLayout::STEREO);
        let values = [0.0_f32, 10.0, 1.0, 11.0, 2.0, 12.0];
        let packed = values
            .iter()
            .flat_map(|value| value.to_ne_bytes())
            .collect::<Vec<_>>();

        FfmpegAudioEncoder::copy_packed_samples_to_frame(&mut frame, format, 2, 3, &packed)
            .expect("populate planar frame");

        assert_eq!(frame.plane::<f32>(0), &[0.0, 1.0, 2.0]);
        assert_eq!(frame.plane::<f32>(1), &[10.0, 11.0, 12.0]);
    }
}
