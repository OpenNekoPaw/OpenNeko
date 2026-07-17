//! Performance metrics for video export pipeline
//!
//! Provides atomic counters and timing metrics for tracking pipeline performance.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Pipeline performance metrics
///
/// Thread-safe metrics collection for the video export pipeline.
/// All timing values are stored in nanoseconds for precision.
pub struct PipelineMetrics {
    // Timing accumulators (nanoseconds)
    decode_time_ns: AtomicU64,
    gpu_time_ns: AtomicU64,
    encode_time_ns: AtomicU64,
    mux_time_ns: AtomicU64,

    // Counters
    frames_processed: AtomicU64,
    bytes_written: AtomicU64,

    // Throughput tracking
    start_time: Instant,
}

impl Default for PipelineMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineMetrics {
    /// Create new metrics instance
    pub fn new() -> Self {
        Self {
            decode_time_ns: AtomicU64::new(0),
            gpu_time_ns: AtomicU64::new(0),
            encode_time_ns: AtomicU64::new(0),
            mux_time_ns: AtomicU64::new(0),
            frames_processed: AtomicU64::new(0),
            bytes_written: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    /// Reset all metrics
    pub fn reset(&self) {
        self.decode_time_ns.store(0, Ordering::Relaxed);
        self.gpu_time_ns.store(0, Ordering::Relaxed);
        self.encode_time_ns.store(0, Ordering::Relaxed);
        self.mux_time_ns.store(0, Ordering::Relaxed);
        self.frames_processed.store(0, Ordering::Relaxed);
        self.bytes_written.store(0, Ordering::Relaxed);
    }

    // ========== Timing recording ==========

    /// Record decode stage duration
    pub fn record_decode(&self, duration_ns: u64) {
        self.decode_time_ns
            .fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record GPU pipeline duration
    pub fn record_gpu(&self, duration_ns: u64) {
        self.gpu_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record encode stage duration
    pub fn record_encode(&self, duration_ns: u64) {
        self.encode_time_ns
            .fetch_add(duration_ns, Ordering::Relaxed);
    }

    /// Record mux stage duration
    pub fn record_mux(&self, duration_ns: u64) {
        self.mux_time_ns.fetch_add(duration_ns, Ordering::Relaxed);
    }

    // ========== Counter updates ==========

    /// Increment frame counter
    pub fn increment_frames(&self) {
        self.frames_processed.fetch_add(1, Ordering::Relaxed);
    }

    /// Add bytes written
    pub fn add_bytes_written(&self, bytes: u64) {
        self.bytes_written.fetch_add(bytes, Ordering::Relaxed);
    }

    // ========== Getters ==========

    /// Get total frames processed
    pub fn frames(&self) -> u64 {
        self.frames_processed.load(Ordering::Relaxed)
    }

    /// Get total bytes written
    pub fn bytes_written(&self) -> u64 {
        self.bytes_written.load(Ordering::Relaxed)
    }

    /// Get elapsed time since metrics creation
    pub fn elapsed_secs(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Calculate current FPS throughput
    pub fn current_fps(&self) -> f64 {
        let frames = self.frames();
        let elapsed = self.elapsed_secs();
        if elapsed > 0.0 {
            frames as f64 / elapsed
        } else {
            0.0
        }
    }

    /// Get average decode time per frame (milliseconds)
    pub fn avg_decode_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.decode_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average GPU time per frame (milliseconds)
    pub fn avg_gpu_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.gpu_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average encode time per frame (milliseconds)
    pub fn avg_encode_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.encode_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Get average mux time per frame (milliseconds)
    pub fn avg_mux_ms(&self) -> f64 {
        let frames = self.frames();
        if frames > 0 {
            (self.mux_time_ns.load(Ordering::Relaxed) as f64 / 1_000_000.0) / frames as f64
        } else {
            0.0
        }
    }

    /// Log summary to tracing
    pub fn log_summary(&self) {
        let frames = self.frames();
        if frames == 0 {
            tracing::info!("Pipeline metrics: no frames processed");
            return;
        }

        tracing::info!(
            frames = frames,
            fps = format!("{:.2}", self.current_fps()),
            decode_avg_ms = format!("{:.2}", self.avg_decode_ms()),
            gpu_avg_ms = format!("{:.2}", self.avg_gpu_ms()),
            encode_avg_ms = format!("{:.2}", self.avg_encode_ms()),
            mux_avg_ms = format!("{:.2}", self.avg_mux_ms()),
            bytes_written = self.bytes_written(),
            elapsed_secs = format!("{:.2}", self.elapsed_secs()),
            "Pipeline metrics summary"
        );
    }
}

/// RAII guard for timing a code section
pub struct TimingGuard<'a, F>
where
    F: FnOnce(u64),
{
    start: Instant,
    recorder: Option<F>,
    _phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a, F> TimingGuard<'a, F>
where
    F: FnOnce(u64),
{
    /// Create a new timing guard
    pub fn new(recorder: F) -> Self {
        Self {
            start: Instant::now(),
            recorder: Some(recorder),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<F> Drop for TimingGuard<'_, F>
where
    F: FnOnce(u64),
{
    fn drop(&mut self) {
        if let Some(recorder) = self.recorder.take() {
            let elapsed_ns = self.start.elapsed().as_nanos() as u64;
            recorder(elapsed_ns);
        }
    }
}

/// Create a timing guard that records to the given metrics
#[macro_export]
macro_rules! time_decode {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_decode(ns))
    };
}

#[macro_export]
macro_rules! time_gpu {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_gpu(ns))
    };
}

#[macro_export]
macro_rules! time_encode {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_encode(ns))
    };
}

#[macro_export]
macro_rules! time_mux {
    ($metrics:expr) => {
        $crate::telemetry::metrics::TimingGuard::new(|ns| $metrics.record_mux(ns))
    };
}

// =============================================================================
// Frame Stats Collector - Periodic stats output
// =============================================================================

/// Per-frame timing breakdown with detailed pipeline stages
#[derive(Debug, Clone, Default)]
pub struct FrameTiming {
    // === Decode Stage ===
    /// Hardware decode time (VideoToolbox/NVDEC) in nanoseconds
    pub hw_decode_ns: u64,

    // === GPU Pipeline Stage ===
    /// NV12 texture import to wgpu (CPU→GPU transfer) in nanoseconds
    pub nv12_import_ns: u64,
    /// NV12 to RGBA conversion (GPU shader) in nanoseconds
    pub nv12_to_rgba_ns: u64,
    /// Layer composition (GPU render) in nanoseconds
    pub composite_ns: u64,
    /// RGBA to NV12 conversion for encoder (GPU compute) in nanoseconds
    pub rgba_to_nv12_ns: u64,
    /// GPU data readback to CPU (for software encoder) in nanoseconds
    pub cpu_readback_ns: u64,

    // === Encode Stage ===
    /// Encoder submission time in nanoseconds
    pub encode_submit_ns: u64,

    // === Mux Stage ===
    /// Mux time in nanoseconds
    pub mux_ns: u64,

    // === Aggregates (for backward compatibility) ===
    /// Total decode time (hw_decode_ns alias)
    pub decode_ns: u64,
    /// Total GPU time (nv12_import + nv12_to_rgba + composite + rgba_to_nv12 + cpu_readback)
    pub gpu_ns: u64,
    /// Total encode time (encode_submit_ns alias)
    pub encode_ns: u64,
    /// Total frame time in nanoseconds
    pub total_ns: u64,
}

impl FrameTiming {
    /// Calculate aggregate gpu_ns from detailed stages
    pub fn calculate_gpu_total(&mut self) {
        self.gpu_ns = self.nv12_import_ns
            + self.nv12_to_rgba_ns
            + self.composite_ns
            + self.rgba_to_nv12_ns
            + self.cpu_readback_ns;
    }

    /// Get hardware decode time in milliseconds
    pub fn hw_decode_ms(&self) -> f64 {
        self.hw_decode_ns as f64 / 1_000_000.0
    }

    /// Get NV12 import time in milliseconds
    pub fn nv12_import_ms(&self) -> f64 {
        self.nv12_import_ns as f64 / 1_000_000.0
    }

    /// Get NV12 to RGBA conversion time in milliseconds
    pub fn nv12_to_rgba_ms(&self) -> f64 {
        self.nv12_to_rgba_ns as f64 / 1_000_000.0
    }

    /// Get composite time in milliseconds
    pub fn composite_ms(&self) -> f64 {
        self.composite_ns as f64 / 1_000_000.0
    }

    /// Get RGBA to NV12 conversion time in milliseconds
    pub fn rgba_to_nv12_ms(&self) -> f64 {
        self.rgba_to_nv12_ns as f64 / 1_000_000.0
    }

    /// Get CPU readback time in milliseconds
    pub fn cpu_readback_ms(&self) -> f64 {
        self.cpu_readback_ns as f64 / 1_000_000.0
    }

    /// Get encode submission time in milliseconds
    pub fn encode_submit_ms(&self) -> f64 {
        self.encode_submit_ns as f64 / 1_000_000.0
    }

    /// Get decode time in milliseconds (aggregate)
    pub fn decode_ms(&self) -> f64 {
        self.decode_ns as f64 / 1_000_000.0
    }

    /// Get GPU time in milliseconds (aggregate)
    pub fn gpu_ms(&self) -> f64 {
        self.gpu_ns as f64 / 1_000_000.0
    }

    /// Get encode time in milliseconds (aggregate)
    pub fn encode_ms(&self) -> f64 {
        self.encode_ns as f64 / 1_000_000.0
    }

    /// Get mux time in milliseconds
    pub fn mux_ms(&self) -> f64 {
        self.mux_ns as f64 / 1_000_000.0
    }

    /// Get total time in milliseconds
    pub fn total_ms(&self) -> f64 {
        self.total_ns as f64 / 1_000_000.0
    }
}

/// Collects frame timing stats and outputs periodically
///
/// Usage:
/// ```ignore
/// let mut collector = FrameStatsCollector::new(Duration::from_millis(100));
///
/// for frame in 0..total_frames {
///     let timing = FrameTiming { decode_ns: ..., gpu_ns: ..., ... };
///     collector.record_frame(timing);
/// }
///
/// collector.log_final_summary();
/// ```
pub struct FrameStatsCollector {
    /// Output interval
    interval: Duration,
    /// Last output time
    last_output: Instant,
    /// Start time
    start_time: Instant,
    /// Total frames processed
    total_frames: u64,
    /// Accumulated timing for current interval
    interval_timing: FrameTiming,
    /// Frames in current interval
    interval_frames: u64,
    /// Accumulated timing for all frames
    total_timing: FrameTiming,
}

impl FrameStatsCollector {
    /// Create a new stats collector with the given output interval
    pub fn new(interval: Duration) -> Self {
        let now = Instant::now();
        Self {
            interval,
            last_output: now,
            start_time: now,
            total_frames: 0,
            interval_timing: FrameTiming::default(),
            interval_frames: 0,
            total_timing: FrameTiming::default(),
        }
    }

    /// Create with default 100ms interval
    pub fn default_interval() -> Self {
        Self::new(Duration::from_millis(100))
    }

    /// Record a frame's timing and output stats if interval elapsed
    pub fn record_frame(&mut self, timing: FrameTiming) {
        // Accumulate interval stats - detailed stages
        self.interval_timing.hw_decode_ns += timing.hw_decode_ns;
        self.interval_timing.nv12_import_ns += timing.nv12_import_ns;
        self.interval_timing.nv12_to_rgba_ns += timing.nv12_to_rgba_ns;
        self.interval_timing.composite_ns += timing.composite_ns;
        self.interval_timing.rgba_to_nv12_ns += timing.rgba_to_nv12_ns;
        self.interval_timing.cpu_readback_ns += timing.cpu_readback_ns;
        self.interval_timing.encode_submit_ns += timing.encode_submit_ns;
        // Accumulate interval stats - aggregates
        self.interval_timing.decode_ns += timing.decode_ns;
        self.interval_timing.gpu_ns += timing.gpu_ns;
        self.interval_timing.encode_ns += timing.encode_ns;
        self.interval_timing.mux_ns += timing.mux_ns;
        self.interval_timing.total_ns += timing.total_ns;
        self.interval_frames += 1;

        // Accumulate total stats - detailed stages
        self.total_timing.hw_decode_ns += timing.hw_decode_ns;
        self.total_timing.nv12_import_ns += timing.nv12_import_ns;
        self.total_timing.nv12_to_rgba_ns += timing.nv12_to_rgba_ns;
        self.total_timing.composite_ns += timing.composite_ns;
        self.total_timing.rgba_to_nv12_ns += timing.rgba_to_nv12_ns;
        self.total_timing.cpu_readback_ns += timing.cpu_readback_ns;
        self.total_timing.encode_submit_ns += timing.encode_submit_ns;
        // Accumulate total stats - aggregates
        self.total_timing.decode_ns += timing.decode_ns;
        self.total_timing.gpu_ns += timing.gpu_ns;
        self.total_timing.encode_ns += timing.encode_ns;
        self.total_timing.mux_ns += timing.mux_ns;
        self.total_timing.total_ns += timing.total_ns;
        self.total_frames += 1;

        // Check if we should output
        let now = Instant::now();
        if now.duration_since(self.last_output) >= self.interval {
            self.output_interval_stats();
            self.last_output = now;
            // Reset interval accumulators
            self.interval_timing = FrameTiming::default();
            self.interval_frames = 0;
        }
    }

    /// Output interval statistics
    fn output_interval_stats(&self) {
        if self.interval_frames == 0 {
            return;
        }

        let n = self.interval_frames as f64;
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let fps = self.total_frames as f64 / elapsed;

        // Detailed GPU breakdown
        let nv12_import = self.interval_timing.nv12_import_ns as f64 / n / 1_000_000.0;
        let nv12_to_rgba = self.interval_timing.nv12_to_rgba_ns as f64 / n / 1_000_000.0;
        let composite = self.interval_timing.composite_ns as f64 / n / 1_000_000.0;
        let rgba_to_nv12 = self.interval_timing.rgba_to_nv12_ns as f64 / n / 1_000_000.0;
        let cpu_readback = self.interval_timing.cpu_readback_ns as f64 / n / 1_000_000.0;

        tracing::info!(
            "[{:.1}s] frames={} fps={:.1} | dec:{:.2}ms | import:{:.2}ms nv12→rgba:{:.2}ms comp:{:.2}ms rgba→nv12:{:.2}ms read:{:.2}ms | enc:{:.2}ms | total:{:.2}ms",
            elapsed,
            self.total_frames,
            fps,
            self.interval_timing.hw_decode_ns as f64 / n / 1_000_000.0,
            nv12_import,
            nv12_to_rgba,
            composite,
            rgba_to_nv12,
            cpu_readback,
            self.interval_timing.encode_submit_ns as f64 / n / 1_000_000.0,
            self.interval_timing.total_ns as f64 / n / 1_000_000.0,
        );
    }

    /// Output final summary
    pub fn log_final_summary(&self) {
        if self.total_frames == 0 {
            tracing::info!("No frames processed");
            return;
        }

        let n = self.total_frames as f64;
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let fps = n / elapsed;

        tracing::info!(
            "=== Export Complete ===\n\
             Total frames: {}\n\
             Total time: {:.2}s\n\
             Average FPS: {:.1}\n\
             \n\
             Per-frame averages:\n\
             [Decode]\n\
             - HW Decode:     {:.2}ms\n\
             \n\
             [GPU Pipeline]\n\
             - NV12 Import:   {:.2}ms\n\
             - NV12→RGBA:     {:.2}ms\n\
             - Composite:     {:.2}ms\n\
             - RGBA→NV12:     {:.2}ms\n\
             - CPU Readback:  {:.2}ms\n\
             - GPU Total:     {:.2}ms\n\
             \n\
             [Encode]\n\
             - Encode Submit: {:.2}ms\n\
             \n\
             [Total]\n\
             - Frame Total:   {:.2}ms",
            self.total_frames,
            elapsed,
            fps,
            self.total_timing.hw_decode_ns as f64 / n / 1_000_000.0,
            self.total_timing.nv12_import_ns as f64 / n / 1_000_000.0,
            self.total_timing.nv12_to_rgba_ns as f64 / n / 1_000_000.0,
            self.total_timing.composite_ns as f64 / n / 1_000_000.0,
            self.total_timing.rgba_to_nv12_ns as f64 / n / 1_000_000.0,
            self.total_timing.cpu_readback_ns as f64 / n / 1_000_000.0,
            self.total_timing.gpu_ns as f64 / n / 1_000_000.0,
            self.total_timing.encode_submit_ns as f64 / n / 1_000_000.0,
            self.total_timing.total_ns as f64 / n / 1_000_000.0,
        );
    }

    /// Get total frames processed
    pub fn total_frames(&self) -> u64 {
        self.total_frames
    }

    /// Get elapsed time in seconds
    pub fn elapsed_secs(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Get current FPS
    pub fn current_fps(&self) -> f64 {
        let elapsed = self.elapsed_secs();
        if elapsed > 0.0 {
            self.total_frames as f64 / elapsed
        } else {
            0.0
        }
    }

    /// Get average timing per frame (for ExportStats)
    pub fn avg_timing(&self) -> FrameTiming {
        if self.total_frames == 0 {
            return FrameTiming::default();
        }
        let n = self.total_frames;
        FrameTiming {
            hw_decode_ns: self.total_timing.hw_decode_ns / n,
            nv12_import_ns: self.total_timing.nv12_import_ns / n,
            nv12_to_rgba_ns: self.total_timing.nv12_to_rgba_ns / n,
            composite_ns: self.total_timing.composite_ns / n,
            rgba_to_nv12_ns: self.total_timing.rgba_to_nv12_ns / n,
            cpu_readback_ns: self.total_timing.cpu_readback_ns / n,
            encode_submit_ns: self.total_timing.encode_submit_ns / n,
            mux_ns: self.total_timing.mux_ns / n,
            decode_ns: self.total_timing.decode_ns / n,
            gpu_ns: self.total_timing.gpu_ns / n,
            encode_ns: self.total_timing.encode_ns / n,
            total_ns: self.total_timing.total_ns / n,
        }
    }

    /// Get total accumulated timing
    pub fn total_timing(&self) -> &FrameTiming {
        &self.total_timing
    }
}

/// Helper to time a code block and return duration in nanoseconds
pub fn time_block<F, R>(f: F) -> (R, u64)
where
    F: FnOnce() -> R,
{
    let start = Instant::now();
    let result = f();
    let elapsed_ns = start.elapsed().as_nanos() as u64;
    (result, elapsed_ns)
}
