//! Decoder module - hardware-accelerated video decoding.
//!
//! `engine-kernel` re-exports this module as a temporary migration surface.

pub mod common;
pub mod hwaccel;
pub mod idr_scanner;
pub mod pool;
mod traits;

pub use common::{detect_hw_accel, get_best_hw_accel, HwAccelType, HwAccelTypeExt};
pub use hwaccel::{HwAccelDecoder, HwAccelDecoderConfig, Nv12GpuTexture};
pub use idr_scanner::{IdrScanner, KeyframeInfo, VideoCodecType};
pub use pool::{
    global_pool, init_global_pool, DecoderGuard, DecoderPool, DecoderPoolConfig, DecoderPoolStats,
};
pub use traits::{DecodedFrame, Decoder, FrameData, GpuTextureHandle, MediaInfo, PixelFormat};
