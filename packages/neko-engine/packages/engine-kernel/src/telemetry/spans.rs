//! Span name constants for consistent tracing across the video export pipeline
//!
//! These constants ensure consistent naming for Tracy zones and tracing spans,
//! making it easier to analyze performance data.

/// Span name constants organized by pipeline stage
pub mod span {
    // ========== Top-level operations ==========
    /// Top-level video export operation
    pub const EXPORT_VIDEO: &str = "export_video";
    /// Single frame processing
    pub const FRAME: &str = "frame";
    /// Finalization and cleanup
    pub const FINALIZE: &str = "finalize";

    // ========== Decode stage ==========
    /// Decode stage (parent span)
    pub const DECODE: &str = "decode";
    /// Hardware-accelerated decoding
    pub const HW_DECODE: &str = "hw_decode";
    /// Video seek operation
    pub const SEEK: &str = "seek";
    /// Decode visible media layers
    pub const DECODE_VISIBLE_MEDIA: &str = "decode_visible_media";

    // ========== GPU pipeline ==========
    /// GPU pipeline stage (parent span)
    pub const GPU_PIPELINE: &str = "gpu_pipeline";
    /// NV12 texture import from hardware decoder
    pub const NV12_IMPORT: &str = "nv12_import";
    /// NV12 to RGBA color space conversion
    pub const NV12_TO_RGBA: &str = "nv12_to_rgba";
    /// Layer rendering
    pub const LAYER_RENDER: &str = "layer_render";
    /// Effect processing
    pub const EFFECT: &str = "effect";
    /// Multi-layer compositing
    pub const COMPOSITE: &str = "composite";
    /// RGBA to NV12 conversion for encoder
    pub const RGBA_TO_NV12: &str = "rgba_to_nv12";
    /// GPU command submission
    pub const GPU_SUBMIT: &str = "gpu_submit";

    // ========== Encode stage ==========
    /// Encode stage (parent span)
    pub const ENCODE: &str = "encode";
    /// Hardware-accelerated encoding
    pub const HW_ENCODE: &str = "hw_encode";
    /// GPU to CPU data readback
    pub const CPU_READBACK: &str = "cpu_readback";

    // ========== Mux stage ==========
    /// Muxing/container writing
    pub const MUX: &str = "mux";
    /// Write video packet
    pub const WRITE_VIDEO: &str = "write_video";
    /// Write audio packet
    pub const WRITE_AUDIO: &str = "write_audio";

    // ========== Audio processing ==========
    /// Audio mixing
    pub const AUDIO_MIX: &str = "audio_mix";
    /// Audio encoding
    pub const AUDIO_ENCODE: &str = "audio_encode";
}

/// Mark a frame boundary for Tracy profiler
///
/// This helps Tracy visualize frame-by-frame performance in video processing.
/// Call this at the start of each frame's processing.
#[cfg(feature = "tracy")]
pub fn mark_frame_boundary() {
    tracy_client::frame_mark();
}

/// No-op when Tracy is not enabled
#[cfg(not(feature = "tracy"))]
pub fn mark_frame_boundary() {}

/// Mark a named frame boundary (for multiple frame streams)
///
/// Note: Tracy requires static string literals for frame names.
/// This function is a no-op placeholder; use `frame_mark!` macro directly
/// if you need named frames with static strings.
#[cfg(feature = "tracy")]
pub fn mark_named_frame(_name: &str) {
    // tracy_client::frame_name requires a static string literal
    // For dynamic names, this is a no-op. Use frame_mark!() for static names.
    tracy_client::frame_mark();
}

/// No-op when Tracy is not enabled
#[cfg(not(feature = "tracy"))]
pub fn mark_named_frame(_name: &str) {}

/// Create a Tracy plot value (for graphing metrics over time)
///
/// Note: Tracy's plot! macro requires a static string literal for the name.
/// This function is a no-op placeholder for dynamic names.
#[cfg(feature = "tracy")]
pub fn plot_value(_name: &str, _value: f64) {
    // tracy_client::plot! requires a static string literal
    // For dynamic names, this is a no-op
}

/// No-op when Tracy is not enabled
#[cfg(not(feature = "tracy"))]
pub fn plot_value(_name: &str, _value: f64) {}
