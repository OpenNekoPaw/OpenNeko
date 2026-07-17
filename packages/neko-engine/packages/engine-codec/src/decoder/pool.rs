//! Decoder Pool - Reuse hardware decoders to avoid initialization overhead
//!
//! This module provides a pool of `HwAccelDecoder` instances that can be
//! reused across multiple frame extraction requests. This significantly
//! reduces latency by avoiding the ~15-30ms decoder initialization cost.
//!
//! ## Architecture
//!
//! ```text
//! DecoderPool
//! ├── HashMap<video_path, Vec<PooledDecoder>>
//! └── LRU eviction when max capacity reached
//!
//! acquire(path) → DecoderGuard (RAII)
//!     └── on drop → return decoder to pool
//! ```
//!
//! ## Usage
//!
//! ```ignore
//! use neko_engine_codec::decoder::{DecoderPool, DecoderPoolConfig};
//!
//! let pool = DecoderPool::new(DecoderPoolConfig::default());
//!
//! // Acquire decoder (reuses existing or creates new)
//! let mut guard = pool.acquire("/path/to/video.mp4", HwAccelType::Auto)?;
//! guard.seek(1.5)?;
//! let frame = guard.decode_next_gpu()?;
//! // Decoder automatically returned to pool when guard is dropped
//! ```

use super::hwaccel::{HwAccelDecoder, HwAccelDecoderConfig};
use super::traits::Decoder;
use super::HwAccelType;
use crate::error::{Error, Result};

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Decoder pool configuration
#[derive(Debug, Clone)]
pub struct DecoderPoolConfig {
    /// Maximum decoders per video file (default: 2)
    pub max_decoders_per_file: usize,
    /// Maximum total decoders in pool (default: 8)
    pub max_total_decoders: usize,
    /// Idle timeout before decoder is closed (default: 30s)
    pub idle_timeout: Duration,
    /// Whether to enable hardware acceleration (default: true)
    pub enable_hw_accel: bool,
}

impl Default for DecoderPoolConfig {
    fn default() -> Self {
        Self {
            max_decoders_per_file: 2,
            max_total_decoders: 16,
            idle_timeout: Duration::from_secs(120),
            enable_hw_accel: true,
        }
    }
}

/// Pooled decoder entry - stores decoder with metadata
struct PooledDecoderEntry {
    decoder: HwAccelDecoder,
    hw_accel: HwAccelType,
    last_used: Instant,
}

impl PooledDecoderEntry {
    fn new(decoder: HwAccelDecoder, hw_accel: HwAccelType) -> Self {
        Self {
            decoder,
            hw_accel,
            last_used: Instant::now(),
        }
    }

    fn touch(&mut self) {
        self.last_used = Instant::now();
    }

    fn is_expired(&self, timeout: Duration) -> bool {
        self.last_used.elapsed() > timeout
    }
}

/// Internal pool state
struct PoolState {
    /// Available decoders: Map<video_path, Vec<PooledDecoderEntry>>
    available: HashMap<String, Vec<PooledDecoderEntry>>,
    /// LRU order for eviction (oldest first)
    lru_order: VecDeque<String>,
    /// Total decoder count (available + in use)
    total_count: usize,
    /// Count of decoders currently in use
    in_use_count: usize,
}

impl PoolState {
    fn new() -> Self {
        Self {
            available: HashMap::new(),
            lru_order: VecDeque::new(),
            total_count: 0,
            in_use_count: 0,
        }
    }
}

/// Thread-safe decoder pool
///
/// Manages a pool of hardware decoders to avoid initialization overhead.
/// Decoders are keyed by video file path and hardware acceleration type.
pub struct DecoderPool {
    config: DecoderPoolConfig,
    state: Mutex<PoolState>,
}

impl DecoderPool {
    /// Create a new decoder pool with the given configuration
    pub fn new(config: DecoderPoolConfig) -> Arc<Self> {
        Arc::new(Self {
            config,
            state: Mutex::new(PoolState::new()),
        })
    }

    /// Create a pool with default configuration
    pub fn with_defaults() -> Arc<Self> {
        Self::new(DecoderPoolConfig::default())
    }

    /// Acquire a decoder for the given video file
    ///
    /// Returns a guard that automatically returns the decoder to the pool
    /// when dropped. If no decoder is available, creates a new one.
    pub fn acquire(
        self: &Arc<Self>,
        video_path: &str,
        hw_accel: HwAccelType,
    ) -> Result<DecoderGuard> {
        // First, try to get an existing decoder from the pool
        let existing = {
            let mut state = self.state.lock().unwrap();

            let mut result = None;
            if let Some(decoders) = state.available.get_mut(video_path) {
                // Find a decoder with matching hw_accel
                if let Some(idx) = decoders.iter().position(|d| d.hw_accel == hw_accel) {
                    let mut entry = decoders.swap_remove(idx);
                    entry.touch();
                    result = Some((entry.decoder, entry.hw_accel));
                }
            }

            if result.is_some() {
                state.in_use_count += 1;

                // Update LRU
                state.lru_order.retain(|p| p != video_path);
                state.lru_order.push_back(video_path.to_string());

                // Remove empty vec from map
                if let Some(decoders) = state.available.get(video_path) {
                    if decoders.is_empty() {
                        state.available.remove(video_path);
                    }
                }
            }

            result
        };

        if let Some((decoder, actual_hw_accel)) = existing {
            return Ok(DecoderGuard {
                pool: Arc::clone(self),
                decoder: Some(decoder),
                video_path: video_path.to_string(),
                hw_accel: actual_hw_accel,
            });
        }

        // No existing decoder available, need to create a new one
        // First ensure we have capacity
        self.ensure_capacity()?;

        // Create new decoder
        let decoder = self.create_decoder(video_path, hw_accel)?;

        // Update state
        {
            let mut state = self.state.lock().unwrap();
            state.total_count += 1;
            state.in_use_count += 1;

            // Update LRU
            state.lru_order.retain(|p| p != video_path);
            state.lru_order.push_back(video_path.to_string());
        }

        Ok(DecoderGuard {
            pool: Arc::clone(self),
            decoder: Some(decoder),
            video_path: video_path.to_string(),
            hw_accel,
        })
    }

    /// Create a new decoder for the given video file
    fn create_decoder(&self, video_path: &str, hw_accel: HwAccelType) -> Result<HwAccelDecoder> {
        let actual_hw_accel = if self.config.enable_hw_accel {
            hw_accel
        } else {
            HwAccelType::Auto
        };

        let config = HwAccelDecoderConfig {
            hw_accel: actual_hw_accel,
            gpu_index: 0,
        };

        let mut decoder = HwAccelDecoder::new().with_config(config);
        decoder.open(video_path)?;

        Ok(decoder)
    }

    /// Ensure there's capacity for a new decoder
    fn ensure_capacity(&self) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if state.total_count >= self.config.max_total_decoders {
            // Need to evict an available decoder
            self.evict_one_locked(&mut state)?;
        }

        Ok(())
    }

    /// Evict one decoder (must hold lock)
    fn evict_one_locked(&self, state: &mut PoolState) -> Result<()> {
        // Find oldest path with available decoder
        for path in state.lru_order.iter() {
            if let Some(decoders) = state.available.get_mut(path) {
                if !decoders.is_empty() {
                    decoders.pop(); // Remove last (oldest)
                    state.total_count = state.total_count.saturating_sub(1);

                    if decoders.is_empty() {
                        let path_clone = path.clone();
                        state.available.remove(&path_clone);
                        state.lru_order.retain(|p| p != &path_clone);
                    }
                    return Ok(());
                }
            }
        }

        // No available decoders to evict - all are in use
        // This is fine, we'll just exceed the limit temporarily
        Ok(())
    }

    /// Return a decoder to the pool for reuse.
    ///
    /// Called automatically by `DecoderGuard::drop`, but can also be called
    /// manually after `DecoderGuard::take_decoder()` for long-lived decoder usage.
    pub fn return_decoder(&self, decoder: HwAccelDecoder, video_path: &str, hw_accel: HwAccelType) {
        let mut state = self.state.lock().unwrap();
        state.in_use_count = state.in_use_count.saturating_sub(1);

        // Check if we should keep this decoder
        let decoders_for_file = state
            .available
            .get(video_path)
            .map(|v| v.len())
            .unwrap_or(0);

        if decoders_for_file >= self.config.max_decoders_per_file {
            // Already have enough decoders for this file, drop it
            state.total_count = state.total_count.saturating_sub(1);
            return;
        }

        // Add decoder back to pool
        let entry = PooledDecoderEntry::new(decoder, hw_accel);
        state
            .available
            .entry(video_path.to_string())
            .or_default()
            .push(entry);

        // Update LRU
        state.lru_order.retain(|p| p != video_path);
        state.lru_order.push_back(video_path.to_string());
    }

    /// Clean up idle decoders that have exceeded the timeout
    pub fn cleanup_idle(&self) {
        let mut state = self.state.lock().unwrap();
        let timeout = self.config.idle_timeout;
        let paths_to_check: Vec<String> = state.available.keys().cloned().collect();

        for path in paths_to_check {
            let (removed_count, is_empty) = {
                if let Some(decoders) = state.available.get_mut(&path) {
                    let before_len = decoders.len();
                    decoders.retain(|d| !d.is_expired(timeout));
                    let removed = before_len - decoders.len();
                    (removed, decoders.is_empty())
                } else {
                    (0, false)
                }
            };

            state.total_count = state.total_count.saturating_sub(removed_count);

            if is_empty {
                state.available.remove(&path);
                state.lru_order.retain(|p| p != &path);
            }
        }
    }

    /// Evict all decoders for a specific video file
    pub fn evict(&self, video_path: &str) {
        let mut state = self.state.lock().unwrap();

        if let Some(decoders) = state.available.remove(video_path) {
            state.total_count = state.total_count.saturating_sub(decoders.len());
        }

        state.lru_order.retain(|p| p != video_path);
    }

    /// Get pool statistics
    pub fn stats(&self) -> DecoderPoolStats {
        let state = self.state.lock().unwrap();

        let available: usize = state.available.values().map(|v| v.len()).sum();

        DecoderPoolStats {
            total_decoders: state.total_count,
            in_use: state.in_use_count,
            available,
            video_files: state.available.len(),
        }
    }

    /// Clear all decoders from the pool
    pub fn clear(&self) {
        let mut state = self.state.lock().unwrap();
        state.available.clear();
        state.lru_order.clear();
        // Note: total_count includes in-use decoders, only reset available portion
        let available_count: usize = state.available.values().map(|v| v.len()).sum();
        state.total_count = state.total_count.saturating_sub(available_count);
    }
}

/// Pool statistics
#[derive(Debug, Clone)]
pub struct DecoderPoolStats {
    /// Total number of decoders (available + in use)
    pub total_decoders: usize,
    /// Number of decoders currently in use
    pub in_use: usize,
    /// Number of available decoders
    pub available: usize,
    /// Number of unique video files with available decoders
    pub video_files: usize,
}

/// RAII guard for borrowed decoder
///
/// Automatically returns the decoder to the pool when dropped.
/// Provides access to the underlying `HwAccelDecoder` methods.
pub struct DecoderGuard {
    pool: Arc<DecoderPool>,
    decoder: Option<HwAccelDecoder>,
    video_path: String,
    hw_accel: HwAccelType,
}

impl DecoderGuard {
    /// Get a reference to the decoder
    pub fn decoder(&self) -> &HwAccelDecoder {
        self.decoder.as_ref().expect("Decoder already taken")
    }

    /// Get a mutable reference to the decoder
    pub fn decoder_mut(&mut self) -> &mut HwAccelDecoder {
        self.decoder.as_mut().expect("Decoder already taken")
    }

    /// Check if hardware decoding is active
    pub fn is_hw_active(&self) -> bool {
        self.decoder().is_hw_active()
    }

    /// Take ownership of the decoder, preventing auto-return to pool on drop.
    ///
    /// Use this when the caller needs to hold the decoder for an extended period
    /// (e.g., stream loops). The caller is responsible for returning the decoder
    /// to the pool via `DecoderPool::return_decoder()` when done.
    pub fn take_decoder(&mut self) -> Option<HwAccelDecoder> {
        self.decoder.take()
    }

    /// Get the video path this guard was acquired for
    pub fn video_path(&self) -> &str {
        &self.video_path
    }

    /// Get the hardware acceleration type
    pub fn hw_accel(&self) -> HwAccelType {
        self.hw_accel
    }
}

impl std::ops::Deref for DecoderGuard {
    type Target = HwAccelDecoder;

    fn deref(&self) -> &Self::Target {
        self.decoder()
    }
}

impl std::ops::DerefMut for DecoderGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.decoder_mut()
    }
}

impl Drop for DecoderGuard {
    fn drop(&mut self) {
        if let Some(decoder) = self.decoder.take() {
            self.pool
                .return_decoder(decoder, &self.video_path, self.hw_accel);
        }
    }
}

/// Global decoder pool instance
static GLOBAL_POOL: std::sync::OnceLock<Arc<DecoderPool>> = std::sync::OnceLock::new();

/// Get the global decoder pool
pub fn global_pool() -> Arc<DecoderPool> {
    GLOBAL_POOL.get_or_init(DecoderPool::with_defaults).clone()
}

/// Initialize the global pool with custom configuration
///
/// Must be called before any `global_pool()` calls.
/// Returns `Err` if the pool was already initialized.
pub fn init_global_pool(config: DecoderPoolConfig) -> Result<()> {
    GLOBAL_POOL
        .set(DecoderPool::new(config))
        .map_err(|_| Error::Other("Global decoder pool already initialized".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_config_default() {
        let config = DecoderPoolConfig::default();
        assert_eq!(config.max_decoders_per_file, 2);
        assert_eq!(config.max_total_decoders, 16);
        assert_eq!(config.idle_timeout, Duration::from_secs(120));
        assert!(config.enable_hw_accel);
    }

    #[test]
    fn test_pool_stats_initial() {
        let pool = DecoderPool::with_defaults();
        let stats = pool.stats();
        assert_eq!(stats.total_decoders, 0);
        assert_eq!(stats.in_use, 0);
        assert_eq!(stats.available, 0);
        assert_eq!(stats.video_files, 0);
    }

    #[test]
    fn test_pool_clear() {
        let pool = DecoderPool::with_defaults();
        pool.clear();
        let stats = pool.stats();
        assert_eq!(stats.available, 0);
    }
}
