//! Encoder Pool - Reuse hardware encoders to avoid initialization overhead
//!
//! Caches opened `HwAccelEncoder` instances by config signature.
//! When a stream requests an encoder, the pool returns a pre-opened one
//! if available, avoiding the ~30-50ms HW encoder initialization cost.
//!
//! ## Lifecycle
//!
//! ```text
//! acquire(config) → HwAccelEncoder (open and ready to encode)
//!   ↓ (stream uses encoder)
//! release(encoder, config) → flush + close + re-open → back to pool
//! ```

use crate::encoder::{Encoder, EncoderConfig, HwAccelEncoder, VideoCodec};
use crate::error::Result;

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Signature for matching encoder configs.
/// Two configs match if they produce compatible encoder sessions.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct EncoderSignature {
    width: u32,
    height: u32,
    fps_millis: u64,
    bitrate: u64,
    codec: u8, // discriminant of VideoCodec
    pixel_format: u8,
    preset: u8,
    profile: Option<String>,
    gop_size: Option<u32>,
    max_b_frames: Option<u32>,
    hw_encoder: u8,
    use_zero_copy_gpu: bool,
    global_header: bool,
}

impl EncoderSignature {
    fn from_config(config: &EncoderConfig) -> Self {
        Self {
            width: config.width,
            height: config.height,
            fps_millis: (config.fps.max(0.0) * 1000.0).round() as u64,
            bitrate: config.bitrate,
            codec: match config.codec {
                VideoCodec::H264 => 0,
                VideoCodec::H265 => 1,
                VideoCodec::Av1 => 2,
                VideoCodec::Vp9 => 3,
                VideoCodec::ProRes => 4,
            },
            pixel_format: match config.pixel_format {
                crate::encoder::PixelFormat::Nv12 => 0,
                crate::encoder::PixelFormat::Yuv420p => 1,
                crate::encoder::PixelFormat::Yuv422p => 2,
                crate::encoder::PixelFormat::Yuv444p => 3,
                crate::encoder::PixelFormat::Rgba => 4,
                crate::encoder::PixelFormat::Bgra => 5,
                crate::encoder::PixelFormat::Rgb24 => 6,
                crate::encoder::PixelFormat::P010le => 7,
            },
            preset: match config.preset {
                crate::encoder::EncoderPreset::Ultrafast => 0,
                crate::encoder::EncoderPreset::Fast => 1,
                crate::encoder::EncoderPreset::Medium => 2,
                crate::encoder::EncoderPreset::Slow => 3,
                crate::encoder::EncoderPreset::Veryslow => 4,
            },
            profile: config.profile.clone(),
            gop_size: config.gop_size,
            max_b_frames: config.max_b_frames,
            hw_encoder: match config.hw_encoder {
                crate::encoder::HwEncoderType::None => 0,
                crate::encoder::HwEncoderType::Auto => 1,
                crate::encoder::HwEncoderType::VideoToolbox => 2,
                crate::encoder::HwEncoderType::Nvenc => 3,
                crate::encoder::HwEncoderType::Vaapi => 4,
                crate::encoder::HwEncoderType::Qsv => 5,
                crate::encoder::HwEncoderType::Amf => 6,
            },
            use_zero_copy_gpu: config.use_zero_copy_gpu,
            global_header: config.global_header,
        }
    }
}

struct PooledEncoder {
    encoder: HwAccelEncoder,
    signature: EncoderSignature,
    #[allow(dead_code)]
    config: EncoderConfig,
    last_used: Instant,
}

/// Thread-safe encoder pool
pub struct EncoderPool {
    available: Mutex<Vec<PooledEncoder>>,
    max_encoders: usize,
    idle_timeout: Duration,
}

impl EncoderPool {
    /// Create a new encoder pool
    pub fn new(max_encoders: usize, idle_timeout: Duration) -> Self {
        Self {
            available: Mutex::new(Vec::new()),
            max_encoders,
            idle_timeout,
        }
    }

    fn lock_available(&self) -> std::sync::MutexGuard<'_, Vec<PooledEncoder>> {
        self.available.lock().unwrap_or_else(|poisoned| {
            tracing::warn!("EncoderPool: recovering from poisoned pool lock");
            poisoned.into_inner()
        })
    }

    /// Acquire an opened encoder matching the given config.
    ///
    /// Returns a pre-opened encoder if one with matching signature is available,
    /// otherwise creates and opens a new one.
    pub fn acquire(&self, config: &EncoderConfig) -> Result<HwAccelEncoder> {
        let target_sig = EncoderSignature::from_config(config);

        // Try to find a matching encoder in the pool
        {
            let mut pool = self.lock_available();
            if let Some(idx) = pool.iter().position(|e| e.signature == target_sig) {
                let entry = pool.swap_remove(idx);
                tracing::debug!(
                    "EncoderPool: reusing pooled encoder ({}x{}, pool_size={})",
                    config.width,
                    config.height,
                    pool.len()
                );
                return Ok(entry.encoder);
            }
        }

        // No match — create and open a new encoder
        let mut encoder = HwAccelEncoder::new();
        Encoder::open(&mut encoder, config)?;

        tracing::debug!(
            "EncoderPool: created new encoder ({}x{})",
            config.width,
            config.height
        );

        Ok(encoder)
    }

    /// Release an encoder back to the pool for reuse.
    ///
    /// The encoder is closed and re-opened with the same config so it's
    /// in a clean state for the next consumer.
    pub fn release(&self, mut encoder: HwAccelEncoder, config: EncoderConfig) {
        // Close and re-open to reset internal state
        Encoder::close(&mut encoder);
        if Encoder::open(&mut encoder, &config).is_err() {
            // If re-open fails, just drop the encoder
            tracing::warn!("EncoderPool: failed to re-open encoder, dropping");
            return;
        }

        let signature = EncoderSignature::from_config(&config);
        let mut pool = self.lock_available();

        // Evict expired entries
        pool.retain(|e| e.last_used.elapsed() < self.idle_timeout);

        // Check capacity
        if pool.len() >= self.max_encoders {
            // Drop the oldest
            if let Some(oldest_idx) = pool
                .iter()
                .enumerate()
                .min_by_key(|(_, e)| e.last_used)
                .map(|(i, _)| i)
            {
                pool.swap_remove(oldest_idx);
            }
        }

        pool.push(PooledEncoder {
            encoder,
            signature,
            config,
            last_used: Instant::now(),
        });
    }

    /// Close an encoder without returning it to the pool.
    ///
    /// Realtime preview reconfiguration uses this path to release platform
    /// hardware encoder resources before opening a differently configured
    /// session. Returning those retired encoders to the pool can transiently
    /// keep VideoToolbox/NVENC sessions alive and stall the next open.
    pub fn discard(&self, mut encoder: HwAccelEncoder) {
        Encoder::close(&mut encoder);
    }

    /// Clean up idle encoders that have exceeded the timeout
    pub fn cleanup_idle(&self) {
        let mut pool = self.lock_available();
        let timeout = self.idle_timeout;
        pool.retain(|e| e.last_used.elapsed() < timeout);
    }

    /// Clear all pooled encoders
    pub fn clear(&self) {
        let mut pool = self.lock_available();
        pool.clear();
    }
}

/// Default max pooled encoders
const DEFAULT_MAX_ENCODERS: usize = 4;

/// Default idle timeout (2 minutes)
const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

static GLOBAL_ENCODER_POOL: OnceLock<EncoderPool> = OnceLock::new();

/// Get the global encoder pool singleton
pub fn global_encoder_pool() -> &'static EncoderPool {
    GLOBAL_ENCODER_POOL.get_or_init(|| EncoderPool::new(DEFAULT_MAX_ENCODERS, DEFAULT_IDLE_TIMEOUT))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encoder_signature_separates_runtime_session_parameters() {
        let config_a = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264);
        let config_b = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264);
        let config_c = EncoderConfig::new(1920, 1080, 60.0, VideoCodec::H264);
        let config_d = EncoderConfig::new(1920, 1080, 30.0, VideoCodec::H264)
            .with_bitrate(config_a.bitrate.saturating_mul(2));
        let config_e = EncoderConfig::new(1280, 720, 30.0, VideoCodec::H264);

        let sig_a = EncoderSignature::from_config(&config_a);
        let sig_b = EncoderSignature::from_config(&config_b);
        let sig_c = EncoderSignature::from_config(&config_c);
        let sig_d = EncoderSignature::from_config(&config_d);
        let sig_e = EncoderSignature::from_config(&config_e);

        assert_eq!(sig_a, sig_b);
        assert_ne!(sig_a, sig_c);
        assert_ne!(sig_a, sig_d);
        assert_ne!(sig_a, sig_e);
    }
}
