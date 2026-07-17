//! Pipeline output contracts shared by GPU producers and output sinks.
//!
//! These types intentionally avoid GPU, codec-runtime, and kernel dependencies.
//! `GpuOutputHandle` is only a platform resource identifier; safe lifetime
//! ownership is provided by higher-level RAII holders such as `GpuFrameLease`.

use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{AudioCodec, FrameFormat, VideoCodec};

/// Error type for pure pipeline output contract helpers.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum PipelineContractError {
    /// The current platform or capability cannot provide the requested handle.
    #[error("GPU output handle is unsupported on {platform}: {reason}")]
    UnsupportedHandle {
        /// Platform name.
        platform: &'static str,
        /// Actionable reason.
        reason: String,
    },

    /// The handle variant exists but has no native encoder bridge yet.
    #[error("GPU encoder input is not implemented for {handle:?}")]
    EncoderInputUnsupported {
        /// Handle variant that could not be consumed by the encoder.
        handle: GpuOutputHandle,
    },

    /// A terminal readback was requested from a lease with no readback target.
    #[error("GPU handle '{kind}' does not expose a terminal readback target")]
    MissingReadback {
        /// Human-readable handle kind.
        kind: &'static str,
    },

    /// The readback adapter failed.
    #[error("GPU readback failed: {0}")]
    ReadbackFailed(String),
}

/// Top-level media output produced by a pipeline.
#[derive(Clone, Debug)]
pub enum PipelineOutput {
    /// Video output variants.
    Video(Box<VideoOutput>),
    /// Audio output variants.
    Audio(AudioOutput),
}

impl PipelineOutput {
    /// Create a boxed video pipeline output.
    pub fn video(output: VideoOutput) -> Self {
        Self::Video(Box::new(output))
    }

    /// Borrow the video output if this item carries video.
    pub fn as_video(&self) -> Option<&VideoOutput> {
        match self {
            Self::Video(output) => Some(output.as_ref()),
            Self::Audio(_) => None,
        }
    }

    /// Mutably borrow the video output if this item carries video.
    pub fn as_video_mut(&mut self) -> Option<&mut VideoOutput> {
        match self {
            Self::Video(output) => Some(output.as_mut()),
            Self::Audio(_) => None,
        }
    }
}

/// High-level realtime render path label for diagnostics.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GpuRenderPath {
    /// Render output is converted to an encoder-owned GPU surface without CPU copies.
    GpuZeroCopy,
    /// GPU surface is used, but the encoder falls back to CPU-visible IOSurface memory.
    PartialZeroCopy,
    /// CPU readback/encode fallback path.
    #[default]
    LegacyCpu,
}

impl GpuRenderPath {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GpuZeroCopy => "gpu-zero-copy",
            Self::PartialZeroCopy => "partial-zero-copy",
            Self::LegacyCpu => "legacy-cpu",
        }
    }
}

/// Engine-owned per-frame diagnostics. Sinks may attach these to stream
/// metadata without exposing GPU implementation types to clients.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderFrameDiagnostics {
    pub render_path: GpuRenderPath,
    pub iosurface_creations: u64,
    pub texture_allocations: u64,
    pub render_time_ms: f32,
    pub convert_time_ms: f32,
    pub encode_time_ms: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality_tier: Option<String>,
    pub gpu_wait_time_ms: f32,
    pub dropped_frames_since_last: u32,
    pub queue_depth: u32,
    pub producer_frame_time_ms: f32,
    pub stream_submit_time_ms: f32,
    pub schedule_lag_ms: f32,
    pub skipped_intervals: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coded_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coded_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_fps: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gop_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec_string: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec_profile: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latency_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_process_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub helper_passes_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub render_mode: Option<String>,
}

/// Video output variants, from GPU-resident hot-path frames to terminal artifacts.
#[derive(Clone, Debug)]
pub enum VideoOutput {
    /// GPU-resident frame intended for zero-copy consumers.
    GpuFrame(Box<VideoGpuFrame>),
    /// Terminal preview artifact such as RGBA/JPEG/PNG bytes.
    PreviewFrame(VideoPreviewFrame),
    /// Encoded video packet.
    EncodedPacket(VideoEncodedPacket),
    /// Raw terminal frame buffer.
    RawFrame(VideoRawFrame),
}

impl VideoOutput {
    /// Create a boxed GPU frame video output.
    pub fn gpu_frame(frame: VideoGpuFrame) -> Self {
        Self::GpuFrame(Box::new(frame))
    }
}

/// Audio output variants.
#[derive(Clone, Debug)]
pub enum AudioOutput {
    /// Interleaved f32 PCM audio.
    PcmF32(AudioBuffer),
    /// Encoded audio packet.
    EncodedPacket(AudioEncodedPacket),
}

/// Platform-aware GPU resource identifier.
///
/// This enum does not own or retain the underlying platform resource. Callers
/// that pass a native handle to an encoder or worker must keep a corresponding
/// RAII owner, such as `GpuFrameLease`, alive for the whole use period.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GpuOutputHandle {
    /// macOS IOSurface handle.
    #[cfg(target_os = "macos")]
    IOSurface(usize),
    /// Linux VA-API surface placeholder until zero-copy interop is implemented.
    #[cfg(target_os = "linux")]
    VaSurface { id: u64 },
    /// Windows D3D11 texture placeholder until zero-copy interop is implemented.
    #[cfg(target_os = "windows")]
    D3D11Texture { handle: usize },
    /// Explicit unsupported platform/capability marker.
    Unsupported {
        /// Platform name.
        platform: &'static str,
        /// Actionable reason.
        reason: String,
    },
}

impl GpuOutputHandle {
    /// Return the native encoder handle for platforms supported in P0.
    pub fn native_encoder_handle(&self) -> Result<usize, PipelineContractError> {
        match self {
            #[cfg(target_os = "macos")]
            Self::IOSurface(handle) => Ok(*handle),
            Self::Unsupported { platform, reason } => {
                Err(PipelineContractError::UnsupportedHandle {
                    platform,
                    reason: reason.clone(),
                })
            }
            #[allow(unreachable_patterns)]
            other => Err(PipelineContractError::EncoderInputUnsupported {
                handle: other.clone(),
            }),
        }
    }

    /// Human-readable variant name for diagnostics.
    pub fn kind(&self) -> &'static str {
        match self {
            #[cfg(target_os = "macos")]
            Self::IOSurface(_) => "IOSurface",
            #[cfg(target_os = "linux")]
            Self::VaSurface { .. } => "VaSurface",
            #[cfg(target_os = "windows")]
            Self::D3D11Texture { .. } => "D3D11Texture",
            Self::Unsupported { .. } => "Unsupported",
        }
    }
}

/// Terminal readback adapter contract for GPU frame leases.
///
/// Implementations live outside `engine-types` and may depend on GPU APIs.
pub trait GpuFrameReadback: fmt::Debug + Send + Sync {
    /// Read this target back as RGBA8 bytes.
    fn read_rgba8(&self) -> Result<Vec<u8>, PipelineContractError>;

    /// Readback width.
    fn width(&self) -> u32;

    /// Readback height.
    fn height(&self) -> u32;
}

/// Opaque owner kept alive for the lifetime of a GPU frame lease.
///
/// Platform bridges can attach native resources such as IOSurface backing
/// stores here without exposing platform-specific types through the pure
/// `engine-types` contract.
pub trait GpuFrameKeepAlive: Send + Sync {}

impl<T: Send + Sync> GpuFrameKeepAlive for T {}

/// Cloneable GPU frame lease.
#[derive(Clone)]
pub struct GpuFrameLease {
    inner: Arc<GpuFrameLeaseInner>,
}

struct GpuFrameLeaseInner {
    handle: GpuOutputHandle,
    readback: Option<Arc<dyn GpuFrameReadback>>,
    keepalives: Vec<Arc<dyn GpuFrameKeepAlive>>,
}

impl GpuFrameLease {
    /// Create a lease from a platform handle.
    pub fn new(handle: GpuOutputHandle) -> Self {
        Self {
            inner: Arc::new(GpuFrameLeaseInner {
                handle,
                readback: None,
                keepalives: Vec::new(),
            }),
        }
    }

    /// Create a lease from a platform handle and an opaque native owner.
    pub fn with_keepalive(handle: GpuOutputHandle, keepalive: Arc<dyn GpuFrameKeepAlive>) -> Self {
        Self {
            inner: Arc::new(GpuFrameLeaseInner {
                handle,
                readback: None,
                keepalives: vec![keepalive],
            }),
        }
    }

    /// Create a lease from a platform handle and an optional terminal readback adapter.
    pub fn with_readback<R>(handle: GpuOutputHandle, readback: Option<Arc<R>>) -> Self
    where
        R: GpuFrameReadback + 'static,
    {
        Self {
            inner: Arc::new(GpuFrameLeaseInner {
                handle,
                readback: readback.map(|target| target as Arc<dyn GpuFrameReadback>),
                keepalives: Vec::new(),
            }),
        }
    }

    /// Create a lease with both terminal readback and an opaque native owner.
    pub fn with_readback_and_keepalive<R>(
        handle: GpuOutputHandle,
        readback: Option<Arc<R>>,
        keepalive: Arc<dyn GpuFrameKeepAlive>,
    ) -> Self
    where
        R: GpuFrameReadback + 'static,
    {
        Self {
            inner: Arc::new(GpuFrameLeaseInner {
                handle,
                readback: readback.map(|target| target as Arc<dyn GpuFrameReadback>),
                keepalives: vec![keepalive],
            }),
        }
    }

    /// Borrow the platform handle.
    pub fn handle(&self) -> &GpuOutputHandle {
        &self.inner.handle
    }

    /// Return the native encoder handle for platforms supported in P0.
    pub fn native_encoder_handle(&self) -> Result<usize, PipelineContractError> {
        self.inner.handle.native_encoder_handle()
    }

    /// Read back this frame as RGBA8 if a terminal readback adapter is present.
    pub fn read_rgba8(&self) -> Result<VideoRawFrame, PipelineContractError> {
        let readback =
            self.inner
                .readback
                .as_ref()
                .ok_or(PipelineContractError::MissingReadback {
                    kind: self.inner.handle.kind(),
                })?;

        Ok(VideoRawFrame {
            data: readback.read_rgba8()?,
            width: readback.width(),
            height: readback.height(),
            format: FrameFormat::Rgba,
            pts: 0,
            duration: 0,
        })
    }

    /// Number of active lease references.
    pub fn strong_count(&self) -> usize {
        Arc::strong_count(&self.inner)
    }
}

impl fmt::Debug for GpuFrameLease {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GpuFrameLease")
            .field("handle", &self.inner.handle)
            .field("has_readback", &self.inner.readback.is_some())
            .field("keepalive_count", &self.inner.keepalives.len())
            .field("strong_count", &Arc::strong_count(&self.inner))
            .finish()
    }
}

/// GPU-resident video frame.
#[derive(Clone, Debug)]
pub struct VideoGpuFrame {
    /// GPU lease.
    pub lease: GpuFrameLease,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Monotonic frame index.
    pub frame_index: u64,
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
    /// Request this frame to be independently decodable in realtime streams.
    pub force_keyframe: bool,
    /// Optional producer-side diagnostics for realtime streams.
    pub diagnostics: Option<RenderFrameDiagnostics>,
}

/// Terminal preview artifact.
#[derive(Clone, Debug)]
pub struct VideoPreviewFrame {
    /// Encoded or raw preview bytes.
    pub data: Vec<u8>,
    /// Width.
    pub width: u32,
    /// Height.
    pub height: u32,
    /// Format.
    pub format: FrameFormat,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Optional retryable unavailability state.
    pub unavailable: Option<PreviewUnavailable>,
}

/// Encoded video packet.
#[derive(Clone, Debug)]
pub struct VideoEncodedPacket {
    /// Encoded bytes.
    pub data: Vec<u8>,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Decode timestamp in microseconds.
    pub dts: i64,
    /// Packet duration in microseconds.
    pub duration: i64,
    /// Keyframe marker.
    pub is_keyframe: bool,
    /// Codec.
    pub codec: VideoCodec,
    /// Stream index.
    pub stream_index: usize,
}

/// Raw terminal video frame.
#[derive(Clone, Debug)]
pub struct VideoRawFrame {
    /// Pixel bytes.
    pub data: Vec<u8>,
    /// Width.
    pub width: u32,
    /// Height.
    pub height: u32,
    /// Pixel format.
    pub format: FrameFormat,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
}

/// Interleaved f32 PCM audio buffer.
#[derive(Clone, Debug)]
pub struct AudioBuffer {
    /// Samples.
    pub samples: Vec<f32>,
    /// Sample rate.
    pub sample_rate: u32,
    /// Channel count.
    pub channels: u16,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Buffer duration in microseconds.
    pub duration: i64,
}

/// Retryable preview unavailability contract.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewUnavailable {
    /// Stable machine-readable reason.
    pub reason: PreviewUnavailableReason,
    /// Retry hint in milliseconds.
    pub retry_after_ms: u64,
    /// Human-readable message.
    pub message: String,
}

/// Preview unavailability reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PreviewUnavailableReason {
    /// GPU budget policy paused this preview provider.
    GpuBusy,
}

impl PreviewUnavailable {
    /// Create a retryable GPU-busy preview artifact state.
    pub fn gpu_busy(retry_after: Duration) -> Self {
        Self {
            reason: PreviewUnavailableReason::GpuBusy,
            retry_after_ms: retry_after.as_millis().try_into().unwrap_or(u64::MAX),
            message: "GPU is busy; retry this preview shortly".to_string(),
        }
    }
}

/// Encoded audio packet.
#[derive(Clone, Debug)]
pub struct AudioEncodedPacket {
    /// Encoded bytes.
    pub data: Vec<u8>,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Decode timestamp in microseconds.
    pub dts: i64,
    /// Packet duration in microseconds.
    pub duration: i64,
    /// Codec.
    pub codec: AudioCodec,
    /// Stream index.
    pub stream_index: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::IOSurface(42)
    }

    #[cfg(not(target_os = "macos"))]
    fn test_handle() -> GpuOutputHandle {
        GpuOutputHandle::Unsupported {
            platform: std::env::consts::OS,
            reason: "unit test".to_string(),
        }
    }

    #[test]
    fn gpu_frame_lease_is_cloneable_and_ref_counted() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<GpuFrameLease>();

        let lease = GpuFrameLease::new(test_handle());
        assert_eq!(lease.strong_count(), 1);

        let clone = lease.clone();
        assert_eq!(lease.strong_count(), 2);
        assert_eq!(clone.strong_count(), 2);

        drop(clone);
        assert_eq!(lease.strong_count(), 1);
    }

    #[test]
    fn unsupported_handle_returns_actionable_error() {
        let handle = GpuOutputHandle::Unsupported {
            platform: "test",
            reason: "missing native interop".to_string(),
        };

        let err = handle.native_encoder_handle().unwrap_err();
        assert!(matches!(
            err,
            PipelineContractError::UnsupportedHandle { .. }
        ));
        assert!(err.to_string().contains("missing native interop"));
    }

    #[test]
    fn preview_unavailable_records_retry_hint() {
        let unavailable = PreviewUnavailable::gpu_busy(Duration::from_millis(250));
        assert_eq!(unavailable.reason, PreviewUnavailableReason::GpuBusy);
        assert_eq!(unavailable.retry_after_ms, 250);
        assert!(unavailable.message.contains("retry"));
    }
}
