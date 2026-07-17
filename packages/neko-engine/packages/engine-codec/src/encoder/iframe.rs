//! H.264 I-Frame Encoder - Single frame encoding for static image extraction
//!
//! This module provides high-performance single-frame H.264 encoding using
//! hardware acceleration (VideoToolbox on macOS). Each frame is encoded as
//! an I-frame (keyframe) for independent decoding.
//!
//! ## Advantages over JPEG
//!
//! - **Faster encoding**: ~3-5ms vs ~15ms (VideoToolbox vs CPU JPEG)
//! - **Smaller size**: ~50% smaller at equivalent quality
//! - **Native NV12 input**: No RGBA conversion needed
//!
//! ## Usage
//!
//! ```ignore
//! use neko_engine_codec::encoder::iframe::{IFrameEncoder, IFrameConfig};
//!
//! let mut encoder = IFrameEncoder::new()?;
//! let config = IFrameConfig::new(1920, 1080);
//! let h264_data = encoder.encode_nv12(&nv12_buffer, &config)?;
//! ```
//!
//! ## Webview Decoding
//!
//! The output can be decoded using WebCodecs VideoDecoder:
//! ```javascript
//! decoder.decode(new EncodedVideoChunk({
//!   type: 'key',
//!   timestamp: 0,
//!   data: h264Data,
//! }));
//! ```

use super::hwaccel::HwAccelEncoder;
use super::traits::{Encoder, EncoderConfig, EncoderPreset, HwEncoderType, VideoCodec};
use crate::error::{Error, Result};

/// I-Frame encoding configuration
#[derive(Debug, Clone)]
pub struct IFrameConfig {
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Quality level (1-100, higher is better, default 85)
    pub quality: u32,
    /// Hardware encoder type
    pub hw_encoder: HwEncoderType,
}

impl IFrameConfig {
    /// Create new config with default quality
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            quality: 85,
            hw_encoder: HwEncoderType::Auto,
        }
    }

    /// Set quality (1-100)
    pub fn with_quality(mut self, quality: u32) -> Self {
        self.quality = quality.clamp(1, 100);
        self
    }

    /// Set hardware encoder type
    pub fn with_hw_encoder(mut self, hw_encoder: HwEncoderType) -> Self {
        self.hw_encoder = hw_encoder;
        self
    }

    /// Calculate bitrate from quality
    /// Higher quality = higher bitrate
    fn bitrate(&self) -> u64 {
        let base_bitrate = (self.width as u64) * (self.height as u64) * 4; // ~4 bits per pixel base
        let quality_factor = self.quality as u64;
        // Scale: quality 1 = 0.5x, quality 50 = 1x, quality 100 = 2x
        base_bitrate * (50 + quality_factor) / 100
    }
}

/// H.264 I-Frame encoder for single frame encoding
///
/// Optimized for encoding individual frames as independent keyframes.
/// Uses hardware acceleration when available.
pub struct IFrameEncoder {
    encoder: Option<HwAccelEncoder>,
    current_config: Option<IFrameConfig>,
}

impl IFrameEncoder {
    /// Create a new I-Frame encoder
    pub fn new() -> Result<Self> {
        Ok(Self {
            encoder: None,
            current_config: None,
        })
    }

    /// Initialize or reconfigure encoder for given dimensions
    fn ensure_encoder(&mut self, config: &IFrameConfig) -> Result<()> {
        // Check if we need to reinitialize
        let needs_init = match &self.current_config {
            None => true,
            Some(current) => {
                current.width != config.width
                    || current.height != config.height
                    || current.hw_encoder != config.hw_encoder
            }
        };

        if needs_init {
            // Close existing encoder
            if let Some(ref mut enc) = self.encoder {
                enc.close();
            }

            // Create encoder config optimized for I-frame only encoding
            let encoder_config = EncoderConfig::new(
                config.width,
                config.height,
                30.0, // FPS doesn't matter for single frames
                VideoCodec::H264,
            )
            .with_gop_size(1) // Every frame is a keyframe
            .with_max_b_frames(0) // No B-frames
            .with_preset(EncoderPreset::Ultrafast) // Fastest encoding
            .with_profile("baseline") // Baseline profile for best compatibility
            .with_hw_encoder(config.hw_encoder)
            .with_bitrate(config.bitrate());

            // Create and open encoder
            let mut encoder = HwAccelEncoder::new();
            encoder.open(&encoder_config)?;

            self.encoder = Some(encoder);
            self.current_config = Some(config.clone());
        } else if let Some(current) = &self.current_config {
            // Only quality changed - update bitrate if significantly different
            if (current.quality as i32 - config.quality as i32).abs() > 10 {
                // For now, we don't support dynamic bitrate change
                // Would need to reinitialize encoder
                self.current_config = Some(config.clone());
            }
        }

        Ok(())
    }

    /// Encode NV12 frame data to H.264 I-frame
    ///
    /// # Arguments
    /// * `nv12_data` - NV12 pixel data (Y plane + interleaved UV plane)
    /// * `config` - Encoding configuration
    ///
    /// # Returns
    /// * H.264 NAL units (SPS + PPS + IDR slice)
    pub fn encode_nv12(&mut self, nv12_data: &[u8], config: &IFrameConfig) -> Result<Vec<u8>> {
        self.ensure_encoder(config)?;

        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Validate input size
        let expected_size = (config.width * config.height * 3 / 2) as usize;
        if nv12_data.len() < expected_size {
            return Err(Error::InvalidParameter(format!(
                "NV12 data too small: expected {} bytes, got {}",
                expected_size,
                nv12_data.len()
            )));
        }

        // Encode frame
        let packets = encoder.encode_frame(nv12_data, 0)?;

        // Flush to get all data (important for single frame)
        let flush_packets = encoder.flush()?;

        // Combine all packet data
        let mut h264_data = Vec::new();
        for packet in packets.into_iter().chain(flush_packets) {
            h264_data.extend_from_slice(&packet.data);
        }

        // Reinitialize encoder for next frame (since we flushed)
        self.current_config = None;

        if h264_data.is_empty() {
            return Err(Error::EncodeFailed(
                "H.264 encoding produced no output".to_string(),
            ));
        }

        Ok(h264_data)
    }

    /// Encode from GPU texture handle (zero-copy path on macOS)
    ///
    /// # Arguments
    /// * `io_surface` - IOSurface handle containing NV12 data
    /// * `config` - Encoding configuration
    #[cfg(target_os = "macos")]
    pub fn encode_gpu(&mut self, io_surface: usize, config: &IFrameConfig) -> Result<Vec<u8>> {
        self.ensure_encoder(config)?;

        let encoder = self.encoder.as_mut().ok_or(Error::EncoderNotInitialized)?;

        // Use GPU encoding path
        let packets = encoder.encode_frame_gpu(io_surface, 0)?;
        let flush_packets = encoder.flush()?;

        let mut h264_data = Vec::new();
        for packet in packets.into_iter().chain(flush_packets) {
            h264_data.extend_from_slice(&packet.data);
        }

        self.current_config = None;

        if h264_data.is_empty() {
            return Err(Error::EncodeFailed(
                "H.264 encoding produced no output".to_string(),
            ));
        }

        Ok(h264_data)
    }

    /// Check if hardware encoding is available
    pub fn is_hw_available(&self) -> bool {
        self.encoder
            .as_ref()
            .map(|e| e.is_hw_active())
            .unwrap_or(false)
    }

    /// Close the encoder and release resources
    pub fn close(&mut self) {
        if let Some(ref mut encoder) = self.encoder {
            encoder.close();
        }
        self.encoder = None;
        self.current_config = None;
    }
}

impl Default for IFrameEncoder {
    fn default() -> Self {
        Self::new().expect("Failed to create IFrameEncoder")
    }
}

impl Drop for IFrameEncoder {
    fn drop(&mut self) {
        self.close();
    }
}

/// Global I-Frame encoder instance for reuse
static IFRAME_ENCODER: std::sync::OnceLock<std::sync::Mutex<IFrameEncoder>> =
    std::sync::OnceLock::new();

/// Get or create the global I-Frame encoder
pub fn global_iframe_encoder() -> &'static std::sync::Mutex<IFrameEncoder> {
    IFRAME_ENCODER.get_or_init(|| {
        std::sync::Mutex::new(IFrameEncoder::new().expect("Failed to create global IFrameEncoder"))
    })
}

/// Encode NV12 data to H.264 I-frame using global encoder
///
/// Convenience function that uses a global encoder instance.
pub fn encode_nv12_to_h264_iframe(
    nv12_data: &[u8],
    width: u32,
    height: u32,
    quality: u32,
) -> Result<Vec<u8>> {
    let config = IFrameConfig::new(width, height).with_quality(quality);
    let encoder = global_iframe_encoder();
    let mut encoder = encoder
        .lock()
        .map_err(|_| Error::Other("Failed to lock global encoder".to_string()))?;
    encoder.encode_nv12(nv12_data, &config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iframe_config_default() {
        let config = IFrameConfig::new(1920, 1080);
        assert_eq!(config.width, 1920);
        assert_eq!(config.height, 1080);
        assert_eq!(config.quality, 85);
    }

    #[test]
    fn test_iframe_config_quality() {
        let config = IFrameConfig::new(1920, 1080).with_quality(50);
        assert_eq!(config.quality, 50);

        // Test clamping
        let config = IFrameConfig::new(1920, 1080).with_quality(150);
        assert_eq!(config.quality, 100);

        let config = IFrameConfig::new(1920, 1080).with_quality(0);
        assert_eq!(config.quality, 1);
    }

    #[test]
    fn test_bitrate_calculation() {
        let config_low = IFrameConfig::new(1920, 1080).with_quality(1);
        let config_high = IFrameConfig::new(1920, 1080).with_quality(100);

        // Higher quality should have higher bitrate
        assert!(config_high.bitrate() > config_low.bitrate());
    }
}
