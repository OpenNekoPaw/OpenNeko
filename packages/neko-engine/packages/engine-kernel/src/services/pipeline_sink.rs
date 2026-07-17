//! Pipeline sink trait and kernel-owned GPU readback adapter.
//!
//! Pure output DTOs live in `neko-engine-types`. This module keeps sink behavior
//! and terminal readback implementation in kernel so `engine-types` stays free of
//! `wgpu`, `GpuContext`, and kernel error dependencies.

use crate::error::{Error, Result};
use neko_engine_types::PipelineContractError;

pub use neko_engine_gpu::GpuReadbackTarget;
pub use neko_engine_types::{
    AudioBuffer, AudioEncodedPacket, AudioOutput, GpuFrameLease, GpuOutputHandle, PipelineOutput,
    PreviewUnavailable, PreviewUnavailableReason, VideoEncodedPacket, VideoGpuFrame, VideoOutput,
    VideoPreviewFrame, VideoRawFrame,
};

/// Convert a pure pipeline contract error into the kernel domain error type.
#[allow(dead_code)]
pub fn pipeline_contract_error(error: PipelineContractError) -> Error {
    match error {
        PipelineContractError::UnsupportedHandle { .. }
        | PipelineContractError::EncoderInputUnsupported { .. }
        | PipelineContractError::MissingReadback { .. } => {
            Error::UnsupportedCapability(error.to_string())
        }
        PipelineContractError::ReadbackFailed(message) => Error::GpuError(message),
    }
}

/// Kernel convenience helpers for GPU leases.
#[allow(dead_code)]
pub trait KernelGpuFrameLeaseExt {
    /// Return the native encoder handle for platforms supported in P0.
    fn native_encoder_handle_kernel(&self) -> Result<usize>;

    /// Read back this frame as RGBA8 if a terminal readback target is present.
    fn read_rgba8_kernel(&self) -> Result<VideoRawFrame>;
}

impl KernelGpuFrameLeaseExt for GpuFrameLease {
    fn native_encoder_handle_kernel(&self) -> Result<usize> {
        self.native_encoder_handle()
            .map_err(pipeline_contract_error)
    }

    fn read_rgba8_kernel(&self) -> Result<VideoRawFrame> {
        self.read_rgba8().map_err(pipeline_contract_error)
    }
}

/// Synchronous output adapter contract.
pub trait PipelineSink: Send + Sync {
    /// Return whether this sink accepts the output.
    fn accepts(&self, output: &PipelineOutput) -> bool;

    /// Submit one output item.
    fn submit(&self, output: PipelineOutput) -> Result<()>;

    /// Flush buffered state.
    fn flush(&self) -> Result<()>;

    /// Close the sink and release resources.
    fn close(&self) -> Result<()>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::FrameFormat;

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
    fn unsupported_handle_maps_to_kernel_error() {
        let handle = GpuOutputHandle::Unsupported {
            platform: "test",
            reason: "missing native interop".to_string(),
        };

        let err = pipeline_contract_error(handle.native_encoder_handle().unwrap_err());
        assert!(matches!(err, Error::UnsupportedCapability(_)));
        assert!(err.to_string().contains("missing native interop"));
    }

    #[test]
    fn missing_readback_maps_to_kernel_error() {
        let err = GpuFrameLease::new(test_handle())
            .read_rgba8_kernel()
            .unwrap_err();
        assert!(matches!(err, Error::UnsupportedCapability(_)));
        assert!(err.to_string().contains("terminal readback"));
    }

    #[test]
    fn readback_raw_frames_use_existing_frame_format_contract() {
        let frame = VideoRawFrame {
            data: vec![0, 0, 0, 255],
            width: 1,
            height: 1,
            format: FrameFormat::Rgba,
            pts: 0,
            duration: 0,
        };
        assert_eq!(frame.format, FrameFormat::Rgba);
    }
}
