//! Audio codec traits and types
//!
//! The canonical `AudioCodec` enum lives in `neko_engine_types` and is re-exported
//! here. FFmpeg-specific methods are provided via [`AudioCodecExt`] in
//! `encoder::codec_ext`.

use crate::error::Result;

// Re-export canonical audio contracts from neko_engine_types (single source of truth).
pub use neko_engine_types::{AudioCodec, AudioEncoderConfig, SampleFormat};

/// Audio stream information
#[derive(Debug, Clone)]
pub struct AudioInfo {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Sample format
    pub sample_format: SampleFormat,
    /// Duration in seconds
    pub duration: f64,
    /// Codec name
    pub codec: String,
    /// Bitrate in bps (0 for lossless)
    pub bitrate: u64,
    /// Total number of samples
    pub total_samples: u64,
}

/// Decoded audio frame
#[derive(Debug)]
pub struct DecodedAudioFrame {
    /// Audio sample data (interleaved)
    pub data: Vec<u8>,
    /// Number of samples per channel
    pub samples: usize,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Sample rate
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Sample format
    pub format: SampleFormat,
}

impl DecodedAudioFrame {
    /// Get duration of this frame in seconds
    pub fn duration(&self) -> f64 {
        self.samples as f64 / self.sample_rate as f64
    }

    /// Get total byte size
    pub fn byte_size(&self) -> usize {
        self.samples * self.channels as usize * self.format.bytes_per_sample()
    }
}

/// Encoded audio packet
#[derive(Debug)]
pub struct EncodedAudioPacket {
    /// Encoded data
    pub data: Vec<u8>,
    /// Presentation timestamp (in time base units)
    pub pts: i64,
    /// Duration (in time base units)
    pub duration: i64,
    /// Stream index
    pub stream_index: usize,
}

/// Audio decoder trait
pub trait AudioDecoder {
    /// Open an audio file
    fn open(&mut self, path: &str) -> Result<AudioInfo>;

    /// Seek to a specific time position
    fn seek(&mut self, time_seconds: f64) -> Result<()>;

    /// Decode the next audio frame
    fn decode_next(&mut self) -> Result<Option<DecodedAudioFrame>>;

    /// Decode audio at specific time
    fn decode_at(&mut self, time_seconds: f64) -> Result<Option<DecodedAudioFrame>> {
        self.seek(time_seconds)?;
        self.decode_next()
    }

    /// Get current position in seconds
    fn position(&self) -> f64;

    /// Get audio info (must call open first)
    fn audio_info(&self) -> Option<&AudioInfo>;

    /// Close the decoder
    fn close(&mut self);
}

/// Audio encoder trait
pub trait AudioEncoder {
    /// Initialize the encoder
    fn open(&mut self, config: &AudioEncoderConfig) -> Result<()>;

    /// Encode audio samples
    /// `data` should be interleaved samples in the configured format
    /// `samples` is the number of samples per channel
    fn encode_frame(&mut self, data: &[u8], samples: usize) -> Result<Vec<EncodedAudioPacket>>;

    /// Flush the encoder and get remaining packets
    fn flush(&mut self) -> Result<Vec<EncodedAudioPacket>>;

    /// Close the encoder
    fn close(&mut self);

    /// Get current encoder configuration
    fn config(&self) -> Option<&AudioEncoderConfig>;

    /// Check if encoder is open
    fn is_open(&self) -> bool {
        self.config().is_some()
    }
}
