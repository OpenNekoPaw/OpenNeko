//! FFmpeg-based audio decoder

use super::traits::{AudioDecoder, AudioInfo, DecodedAudioFrame, SampleFormat};
use crate::error::{Error, Result};

use ffmpeg_next as ffmpeg;
use ffmpeg_next::ffi;
use ffmpeg_next::format::input;
use ffmpeg_next::format::Sample;
use ffmpeg_next::media::Type;
use ffmpeg_next::software::resampling::Context as ResamplerContext;
use ffmpeg_next::util::frame::audio::Audio as AudioFrame;
use ffmpeg_next::ChannelLayout;

use std::path::Path;

const MAX_CONSECUTIVE_CORRUPT_PACKETS: u32 = 64;

/// Controls whether a decoder may treat a proven corrupt packet tail as EOF.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum CorruptTailPolicy {
    /// Preserve terminal FFmpeg errors after skipped invalid packets.
    #[default]
    Reject,
    /// Recover only after valid decoded output followed by contiguous corruption.
    RecoverAfterValidOutput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CorruptPacketDecision {
    Continue,
    Skip,
    RecoverTail,
    Reject,
}

#[derive(Debug, Default)]
struct CorruptPacketRecoveryState {
    policy: CorruptTailPolicy,
    has_decoded_output: bool,
    consecutive_corrupt_packets: u32,
    recovered_corrupt_tail: bool,
}

impl CorruptPacketRecoveryState {
    fn new(policy: CorruptTailPolicy) -> Self {
        Self {
            policy,
            ..Self::default()
        }
    }

    fn set_policy(&mut self, policy: CorruptTailPolicy) {
        self.policy = policy;
        self.reset_runtime();
    }

    fn reset_runtime(&mut self) {
        self.has_decoded_output = false;
        self.consecutive_corrupt_packets = 0;
        self.recovered_corrupt_tail = false;
    }

    fn on_decoded_output(&mut self) {
        self.has_decoded_output = true;
        self.consecutive_corrupt_packets = 0;
    }

    fn on_packet_accepted(&mut self) {
        self.consecutive_corrupt_packets = 0;
    }

    fn on_packet_error(&mut self, error: ffmpeg::Error) -> CorruptPacketDecision {
        match error {
            ffmpeg::Error::InvalidData => {
                self.consecutive_corrupt_packets =
                    self.consecutive_corrupt_packets.saturating_add(1);

                if self.policy != CorruptTailPolicy::RecoverAfterValidOutput
                    || self.consecutive_corrupt_packets < MAX_CONSECUTIVE_CORRUPT_PACKETS
                {
                    return CorruptPacketDecision::Skip;
                }

                if self.has_decoded_output {
                    self.recovered_corrupt_tail = true;
                    CorruptPacketDecision::RecoverTail
                } else {
                    CorruptPacketDecision::Reject
                }
            }
            ffmpeg::Error::Other { errno }
                if errno == ffmpeg::error::EPERM
                    && self.policy == CorruptTailPolicy::RecoverAfterValidOutput
                    && self.has_decoded_output
                    && self.consecutive_corrupt_packets > 0 =>
            {
                self.recovered_corrupt_tail = true;
                CorruptPacketDecision::RecoverTail
            }
            _ => CorruptPacketDecision::Reject,
        }
    }

    fn on_packet_stream_end(&mut self) -> CorruptPacketDecision {
        if self.policy != CorruptTailPolicy::RecoverAfterValidOutput
            || self.consecutive_corrupt_packets == 0
        {
            return CorruptPacketDecision::Continue;
        }

        if self.has_decoded_output {
            self.recovered_corrupt_tail = true;
            CorruptPacketDecision::RecoverTail
        } else {
            CorruptPacketDecision::Reject
        }
    }

    fn consecutive_corrupt_packets(&self) -> u32 {
        self.consecutive_corrupt_packets
    }

    fn recovered_corrupt_tail(&self) -> bool {
        self.recovered_corrupt_tail
    }
}

/// Open a media file using only `avformat_open_input`, skipping the expensive
/// (and sometimes error-prone) `avformat_find_stream_info` call.
///
/// For container formats (MP4/M4A/MOV/MKV) all codec parameters are stored in
/// the container header and are available immediately after `avformat_open_input`.
/// `avformat_find_stream_info` is mainly needed for raw bitstream formats (ADTS
/// AAC, MP3) that lack a container. Using it on AAC streams with non-standard
/// channel configurations (e.g. "channel element 2.7") can cause
/// `AVERROR_INVALIDDATA`, aborting the open entirely.
///
/// # Safety
/// Calls the FFmpeg C API directly. The returned `Input` takes ownership of
/// the allocated `AVFormatContext` and will free it on drop.
unsafe fn open_input_no_probe(
    path: &str,
) -> std::result::Result<ffmpeg::format::context::Input, ffmpeg::Error> {
    use std::ffi::CString;

    let c_path = CString::new(path).map_err(|_| ffmpeg::Error::InvalidData)?;
    let mut ps: *mut ffi::AVFormatContext = std::ptr::null_mut();

    let ret = ffi::avformat_open_input(
        &mut ps,
        c_path.as_ptr(),
        std::ptr::null_mut(),
        std::ptr::null_mut(),
    );

    if ret < 0 {
        return Err(ffmpeg::Error::from(ret));
    }

    // Wrap without calling avformat_find_stream_info — container header provides
    // the codec parameters we need (sample_rate, channels, codec_id).
    Ok(ffmpeg::format::context::Input::wrap(ps))
}

/// FFmpeg audio decoder
pub struct FfmpegAudioDecoder {
    input_ctx: Option<ffmpeg::format::context::Input>,
    decoder: Option<ffmpeg::decoder::Audio>,
    resampler: Option<ResamplerContext>,
    stream_index: usize,
    audio_info: Option<AudioInfo>,
    current_position: f64,
    time_base: f64,
    output_format: SampleFormat,
    output_sample_rate: Option<u32>,
    output_channels: Option<u16>,
    corrupt_packet_recovery: CorruptPacketRecoveryState,
}

impl FfmpegAudioDecoder {
    /// Create a new audio decoder
    pub fn new() -> Self {
        Self {
            input_ctx: None,
            decoder: None,
            resampler: None,
            stream_index: 0,
            audio_info: None,
            current_position: 0.0,
            time_base: 1.0,
            output_format: SampleFormat::F32,
            output_sample_rate: None,
            output_channels: None,
            corrupt_packet_recovery: CorruptPacketRecoveryState::new(CorruptTailPolicy::default()),
        }
    }

    /// Set output sample format
    pub fn with_output_format(mut self, format: SampleFormat) -> Self {
        self.output_format = format;
        self
    }

    /// Set output sample rate (resampling)
    pub fn with_output_sample_rate(mut self, sample_rate: u32) -> Self {
        self.output_sample_rate = Some(sample_rate);
        self
    }

    /// Set output channels (channel mixing)
    pub fn with_output_channels(mut self, channels: u16) -> Self {
        self.output_channels = Some(channels);
        self
    }

    /// Set corrupt-tail handling for sequential decode operations.
    pub fn with_corrupt_tail_policy(mut self, policy: CorruptTailPolicy) -> Self {
        self.corrupt_packet_recovery.set_policy(policy);
        self
    }

    /// Whether the current decode terminated through corrupt-tail recovery.
    pub fn recovered_corrupt_tail(&self) -> bool {
        self.corrupt_packet_recovery.recovered_corrupt_tail()
    }

    /// Convert SampleFormat to FFmpeg Sample format
    fn to_ffmpeg_sample_format(format: SampleFormat) -> Sample {
        match format {
            SampleFormat::U8 => Sample::U8(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S16 => Sample::I16(ffmpeg::format::sample::Type::Packed),
            SampleFormat::S32 => Sample::I32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F32 => Sample::F32(ffmpeg::format::sample::Type::Packed),
            SampleFormat::F64 => Sample::F64(ffmpeg::format::sample::Type::Packed),
        }
    }

    /// Convert FFmpeg Sample format to SampleFormat
    fn from_ffmpeg_sample_format(format: Sample) -> SampleFormat {
        match format {
            Sample::U8(_) => SampleFormat::U8,
            Sample::I16(_) => SampleFormat::S16,
            Sample::I32(_) => SampleFormat::S32,
            Sample::F32(_) => SampleFormat::F32,
            Sample::F64(_) => SampleFormat::F64,
            _ => SampleFormat::F32, // Default fallback
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

    /// Convert decoded frame to output format
    fn convert_frame(&mut self, decoded_frame: AudioFrame) -> Result<Option<DecodedAudioFrame>> {
        let audio_info = self
            .audio_info
            .as_ref()
            .ok_or(Error::DecoderNotInitialized)?
            .clone();

        // Get timestamp
        let pts = decoded_frame.pts().unwrap_or(0);
        let timestamp = pts as f64 * self.time_base;
        self.current_position = timestamp;

        // Resample if needed, handling input format changes (common with AAC)
        let output_frame = if let Some(resampler) = self.resampler.as_mut() {
            let mut output = AudioFrame::empty();
            let result = resampler.run(&decoded_frame, &mut output);

            if result.is_ok() {
                output
            } else {
                let frame_channels = decoded_frame.channels();
                let output_channels = self.output_channels.unwrap_or(audio_info.channels);
                let output_rate = self.output_sample_rate.unwrap_or(audio_info.sample_rate);

                // Guard: AAC bitstream errors (e.g. "channel element N.M is not allocated")
                // cause FFmpeg to report implausible channel counts (e.g. 43).
                // ChannelLayout::default(N) for large N has no channel routing, so SWR
                // cannot rematrix it → would error again. Return silence instead.
                if frame_channels == 0 || frame_channels > 8 {
                    tracing::warn!(
                        "Corrupt audio frame at {:.3}s: {}ch (AAC bitstream error) — substituting silence",
                        timestamp,
                        frame_channels
                    );
                    let samples = decoded_frame.samples().max(1);
                    let bytes = self.output_format.bytes_per_sample();
                    return Ok(Some(DecodedAudioFrame {
                        data: vec![0u8; samples * output_channels as usize * bytes],
                        samples,
                        timestamp,
                        sample_rate: output_rate,
                        channels: output_channels,
                        format: self.output_format,
                    }));
                }

                // Input format legitimately changed — rebuild resampler
                let frame_layout = {
                    let layout = decoded_frame.channel_layout();
                    if layout.bits() != 0 {
                        layout
                    } else {
                        Self::channel_layout_for_channels(frame_channels)
                    }
                };

                tracing::warn!(
                    "Resampler input changed, rebuilding: {:?}/{}ch/{} Hz -> {:?}/{}ch/{} Hz",
                    decoded_frame.format(),
                    frame_channels,
                    decoded_frame.rate(),
                    Self::to_ffmpeg_sample_format(self.output_format),
                    output_channels,
                    output_rate
                );

                let new_resampler = ResamplerContext::get(
                    decoded_frame.format(),
                    frame_layout,
                    decoded_frame.rate(),
                    Self::to_ffmpeg_sample_format(self.output_format),
                    Self::channel_layout_for_channels(output_channels),
                    output_rate,
                )?;
                self.resampler = Some(new_resampler);

                let mut output = AudioFrame::empty();
                self.resampler
                    .as_mut()
                    .expect("resampler just assigned")
                    .run(&decoded_frame, &mut output)?;
                output
            }
        } else {
            decoded_frame
        };

        // Copy data from frame
        let output_samples = output_frame.samples();
        let output_channels = self.output_channels.unwrap_or(audio_info.channels);
        let bytes_per_sample = self.output_format.bytes_per_sample();
        let buffer_size = output_samples * output_channels as usize * bytes_per_sample;

        let mut buffer = vec![0u8; buffer_size];

        // Copy interleaved data from plane 0 (packed format)
        let plane_data = output_frame.data(0);
        let copy_size = buffer_size.min(plane_data.len());
        buffer[..copy_size].copy_from_slice(&plane_data[..copy_size]);

        Ok(Some(DecodedAudioFrame {
            data: buffer,
            samples: output_samples,
            timestamp,
            sample_rate: self.output_sample_rate.unwrap_or(audio_info.sample_rate),
            channels: output_channels,
            format: self.output_format,
        }))
    }

    fn convert_decoded_frame(
        &mut self,
        decoded_frame: AudioFrame,
    ) -> Result<Option<DecodedAudioFrame>> {
        let output = self.convert_frame(decoded_frame)?;
        if output.is_some() {
            self.corrupt_packet_recovery.on_decoded_output();
        }
        Ok(output)
    }

    fn log_corrupt_tail_recovery(&self) {
        tracing::warn!(
            event = "audio_corrupt_tail_recovered",
            position_seconds = self.current_position,
            corrupt_packets = self.corrupt_packet_recovery.consecutive_corrupt_packets(),
            "Recovered decoded audio prefix after a corrupt packet tail"
        );
    }
}

impl Default for FfmpegAudioDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioDecoder for FfmpegAudioDecoder {
    fn open(&mut self, path: &str) -> Result<AudioInfo> {
        // Check file exists
        if !Path::new(path).exists() {
            return Err(Error::FileNotFound(path.to_string()));
        }

        // Open input.
        // Full probe (avformat_open_input + avformat_find_stream_info) works for
        // most files. However, find_stream_info decodes probe packets from every
        // stream; for AAC with non-standard channel configs (e.g. "channel element
        // 2.7 is not allocated") this returns AVERROR_INVALIDDATA, preventing the
        // decoder from opening at all.
        //
        // For container formats (MP4/M4A/MOV/MKV) the codec parameters already
        // exist in the container header, so we can safely skip find_stream_info
        // and still get a working decoder.  The per-frame resampler-rebuild logic
        // in convert_frame() handles any remaining format surprises.
        let input_ctx = match input(&path) {
            Ok(ctx) => ctx,
            Err(ffmpeg::Error::InvalidData) => {
                tracing::warn!(
                    "avformat_find_stream_info failed (AVERROR_INVALIDDATA) for '{}'; \
                     retrying with container-header-only open (skipping probe)",
                    path
                );
                // SAFETY: wraps the AVFormatContext returned by avformat_open_input;
                // ownership transfers to the returned Input which frees it on drop.
                unsafe { open_input_no_probe(path) }?
            }
            Err(e) => return Err(Error::from(e)),
        };

        // Find audio stream
        let stream = input_ctx
            .streams()
            .best(Type::Audio)
            .ok_or_else(|| Error::Ffmpeg("No audio stream found".to_string()))?;

        let stream_index = stream.index();

        // Get time base
        let time_base = stream.time_base();
        self.time_base = time_base.numerator() as f64 / time_base.denominator() as f64;

        // Create decoder
        let codec_params = stream.parameters();
        let context = ffmpeg::codec::context::Context::from_parameters(codec_params)?;
        let decoder = context.decoder().audio()?;

        let sample_rate = decoder.rate();
        let channels = decoder.channels() as u16;
        let input_format = decoder.format();

        // Calculate duration
        let duration = if stream.duration() > 0 {
            stream.duration() as f64 * self.time_base
        } else {
            input_ctx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        };

        // Get codec name
        let codec_name = decoder
            .codec()
            .map(|c| c.name().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Get bitrate (from codec context if available)
        let bitrate = 0u64; // Bitrate not directly available from parameters

        // Calculate total samples
        let total_samples = (duration * sample_rate as f64) as u64;

        let audio_info = AudioInfo {
            sample_rate,
            channels,
            sample_format: Self::from_ffmpeg_sample_format(input_format),
            duration,
            codec: codec_name,
            bitrate,
            total_samples,
        };

        // Setup resampler if output format differs
        let output_sample_rate = self.output_sample_rate.unwrap_or(sample_rate);
        let output_channels = self.output_channels.unwrap_or(channels);
        let output_format = Self::to_ffmpeg_sample_format(self.output_format);

        let needs_resampling = output_sample_rate != sample_rate
            || output_channels != channels
            || output_format != input_format;

        if needs_resampling {
            // Some AAC files (e.g. unusual channel configurations) report channels=0
            // in the container header; the real channel count only becomes known after
            // decoding the first packet. Creating a resampler with a 0-channel source
            // layout is invalid and returns AVERROR_INVALIDDATA.
            // Defer resampler construction to convert_frame() in that case — it already
            // rebuilds the resampler lazily when input format changes.
            if channels == 0 {
                tracing::warn!(
                    "Audio stream reports 0 channels at open time — deferring resampler creation"
                );
            } else {
                let input_layout = Self::channel_layout_for_channels(channels);
                let output_layout = Self::channel_layout_for_channels(output_channels);

                let resampler = ResamplerContext::get(
                    input_format,
                    input_layout,
                    sample_rate,
                    output_format,
                    output_layout,
                    output_sample_rate,
                )?;

                self.resampler = Some(resampler);
            }
        }

        self.input_ctx = Some(input_ctx);
        self.decoder = Some(decoder);
        self.stream_index = stream_index;
        self.audio_info = Some(audio_info.clone());
        self.current_position = 0.0;
        self.corrupt_packet_recovery.reset_runtime();

        tracing::info!(
            "Audio decoder opened: {} Hz, {} channels, codec: {}",
            sample_rate,
            channels,
            audio_info.codec
        );

        Ok(audio_info)
    }

    fn seek(&mut self, time_seconds: f64) -> Result<()> {
        let input_ctx = self
            .input_ctx
            .as_mut()
            .ok_or(Error::DecoderNotInitialized)?;
        let decoder = self.decoder.as_mut().ok_or(Error::DecoderNotInitialized)?;

        if time_seconds < 0.0 {
            return Err(Error::InvalidSeek(time_seconds));
        }

        // avformat_seek_file uses AV_TIME_BASE (microseconds) by default
        let timestamp = (time_seconds * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;

        // Seek
        input_ctx.seek(timestamp, ..timestamp)?;

        // Flush decoder
        decoder.flush();

        self.current_position = time_seconds;
        self.corrupt_packet_recovery.reset_runtime();

        Ok(())
    }

    fn decode_next(&mut self) -> Result<Option<DecodedAudioFrame>> {
        if self.decoder.is_none() || self.input_ctx.is_none() {
            return Err(Error::DecoderNotInitialized);
        }

        if self.corrupt_packet_recovery.recovered_corrupt_tail() {
            return Ok(None);
        }

        let stream_index = self.stream_index;

        // Try to get a frame from decoder first
        {
            let decoder = self.decoder.as_mut().unwrap();
            let mut decoded_frame = AudioFrame::empty();

            match decoder.receive_frame(&mut decoded_frame) {
                Ok(_) => {
                    return self.convert_decoded_frame(decoded_frame);
                }
                Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                    // Need more packets
                }
                Err(ffmpeg::Error::Eof) => {
                    return Ok(None);
                }
                Err(e) => {
                    return Err(Error::DecodeFailed(e.to_string()));
                }
            }
        }

        // Read packets and send to decoder
        loop {
            let packet_result = {
                let input_ctx = self.input_ctx.as_mut().unwrap();
                let mut packet_opt = None;
                for (stream, packet) in input_ctx.packets() {
                    if stream.index() == stream_index {
                        packet_opt = Some(packet);
                        break;
                    }
                }
                packet_opt
            };

            match packet_result {
                Some(packet) => {
                    let decoder = self.decoder.as_mut().unwrap();

                    // AVERROR_INVALIDDATA from send_packet means a corrupt or
                    // non-standard bitstream packet (e.g. AAC "channel element
                    // 2.7 is not allocated").  Skip the packet rather than
                    // propagating the error — the rest of the stream is fine.
                    match decoder.send_packet(&packet) {
                        Ok(()) => {
                            self.corrupt_packet_recovery.on_packet_accepted();
                        }
                        Err(ffmpeg::Error::InvalidData) => {
                            let decision = self
                                .corrupt_packet_recovery
                                .on_packet_error(ffmpeg::Error::InvalidData);
                            if self.corrupt_packet_recovery.consecutive_corrupt_packets() == 1 {
                                tracing::warn!(
                                    "Skipping corrupt audio packet at {:.3}s (AVERROR_INVALIDDATA)",
                                    self.current_position
                                );
                            }
                            match decision {
                                CorruptPacketDecision::Skip => continue,
                                CorruptPacketDecision::RecoverTail => {
                                    self.log_corrupt_tail_recovery();
                                    return Ok(None);
                                }
                                CorruptPacketDecision::Reject => {
                                    return Err(Error::DecodeFailed(format!(
                                        "{} consecutive corrupt audio packets before any decodable output",
                                        self.corrupt_packet_recovery
                                            .consecutive_corrupt_packets()
                                    )));
                                }
                                CorruptPacketDecision::Continue => {
                                    unreachable!(
                                        "packet errors cannot continue without a disposition"
                                    )
                                }
                            }
                        }
                        Err(e) => {
                            if self.corrupt_packet_recovery.on_packet_error(e)
                                == CorruptPacketDecision::RecoverTail
                            {
                                self.log_corrupt_tail_recovery();
                                return Ok(None);
                            }
                            return Err(Error::from(e));
                        }
                    }

                    let mut decoded_frame = AudioFrame::empty();
                    match decoder.receive_frame(&mut decoded_frame) {
                        Ok(_) => {
                            return self.convert_decoded_frame(decoded_frame);
                        }
                        Err(ffmpeg::Error::Other { errno }) if errno == ffmpeg::error::EAGAIN => {
                            continue;
                        }
                        Err(ffmpeg::Error::Eof) => {
                            return Ok(None);
                        }
                        Err(e) => {
                            return Err(Error::DecodeFailed(e.to_string()));
                        }
                    }
                }
                None => {
                    match self.corrupt_packet_recovery.on_packet_stream_end() {
                        CorruptPacketDecision::RecoverTail => {
                            self.log_corrupt_tail_recovery();
                            return Ok(None);
                        }
                        CorruptPacketDecision::Reject => {
                            return Err(Error::DecodeFailed(format!(
                                "{} corrupt audio packets and no decodable output",
                                self.corrupt_packet_recovery.consecutive_corrupt_packets()
                            )));
                        }
                        CorruptPacketDecision::Continue => {}
                        CorruptPacketDecision::Skip => {
                            unreachable!("packet stream end cannot skip a packet")
                        }
                    }

                    // No more packets, send EOF and drain
                    let decoder = self.decoder.as_mut().unwrap();
                    decoder.send_eof()?;

                    let mut decoded_frame = AudioFrame::empty();
                    match decoder.receive_frame(&mut decoded_frame) {
                        Ok(_) => {
                            return self.convert_decoded_frame(decoded_frame);
                        }
                        _ => {
                            return Ok(None);
                        }
                    }
                }
            }
        }
    }

    fn position(&self) -> f64 {
        self.current_position
    }

    fn audio_info(&self) -> Option<&AudioInfo> {
        self.audio_info.as_ref()
    }

    fn close(&mut self) {
        self.decoder = None;
        self.input_ctx = None;
        self.resampler = None;
        self.audio_info = None;
        self.current_position = 0.0;
        self.corrupt_packet_recovery.reset_runtime();
    }
}

impl Drop for FfmpegAudioDecoder {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_format_bytes() {
        assert_eq!(SampleFormat::U8.bytes_per_sample(), 1);
        assert_eq!(SampleFormat::S16.bytes_per_sample(), 2);
        assert_eq!(SampleFormat::S32.bytes_per_sample(), 4);
        assert_eq!(SampleFormat::F32.bytes_per_sample(), 4);
        assert_eq!(SampleFormat::F64.bytes_per_sample(), 8);
    }

    #[test]
    fn corrupt_tail_policy_recovers_only_after_valid_output() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        state.on_decoded_output();

        for _ in 1..MAX_CONSECUTIVE_CORRUPT_PACKETS {
            assert_eq!(
                state.on_packet_error(ffmpeg::Error::InvalidData),
                CorruptPacketDecision::Skip
            );
        }

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::RecoverTail
        );
        assert!(state.recovered_corrupt_tail());
    }

    #[test]
    fn corrupt_tail_policy_rejects_budget_exhaustion_before_output() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);

        for _ in 1..MAX_CONSECUTIVE_CORRUPT_PACKETS {
            assert_eq!(
                state.on_packet_error(ffmpeg::Error::InvalidData),
                CorruptPacketDecision::Skip
            );
        }

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::Reject
        );
        assert!(!state.recovered_corrupt_tail());
    }

    #[test]
    fn accepted_packet_resets_isolated_corruption() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        state.on_decoded_output();

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::Skip
        );
        assert_eq!(state.consecutive_corrupt_packets(), 1);

        state.on_packet_accepted();

        assert_eq!(state.consecutive_corrupt_packets(), 0);
        assert_eq!(
            state.on_packet_error(ffmpeg::Error::Other {
                errno: ffmpeg::error::EPERM,
            }),
            CorruptPacketDecision::Reject
        );
    }

    #[test]
    fn corrupt_tail_policy_recovers_from_eperm_after_corrupt_streak() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        state.on_decoded_output();
        assert_eq!(
            state.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::Skip
        );

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::Other {
                errno: ffmpeg::error::EPERM,
            }),
            CorruptPacketDecision::RecoverTail
        );
        assert!(state.recovered_corrupt_tail());
    }

    #[test]
    fn corrupt_tail_policy_rejects_unrelated_eperm() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        state.on_decoded_output();

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::Other {
                errno: ffmpeg::error::EPERM,
            }),
            CorruptPacketDecision::Reject
        );
        assert!(!state.recovered_corrupt_tail());
    }

    #[test]
    fn default_policy_never_recovers_terminal_packet_errors() {
        let mut state = CorruptPacketRecoveryState::new(CorruptTailPolicy::Reject);
        state.on_decoded_output();

        for _ in 0..MAX_CONSECUTIVE_CORRUPT_PACKETS {
            assert_eq!(
                state.on_packet_error(ffmpeg::Error::InvalidData),
                CorruptPacketDecision::Skip
            );
        }

        assert_eq!(
            state.on_packet_error(ffmpeg::Error::Other {
                errno: ffmpeg::error::EPERM,
            }),
            CorruptPacketDecision::Reject
        );
        assert!(!state.recovered_corrupt_tail());
    }

    #[test]
    fn corrupt_packet_stream_end_requires_valid_output() {
        let mut without_output =
            CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        assert_eq!(
            without_output.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::Skip
        );
        assert_eq!(
            without_output.on_packet_stream_end(),
            CorruptPacketDecision::Reject
        );

        let mut after_output =
            CorruptPacketRecoveryState::new(CorruptTailPolicy::RecoverAfterValidOutput);
        after_output.on_decoded_output();
        assert_eq!(
            after_output.on_packet_error(ffmpeg::Error::InvalidData),
            CorruptPacketDecision::Skip
        );
        assert_eq!(
            after_output.on_packet_stream_end(),
            CorruptPacketDecision::RecoverTail
        );
    }
}
