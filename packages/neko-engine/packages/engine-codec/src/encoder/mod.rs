//! Encoder module - video encoding and container muxing.
//!
//! `engine-kernel` re-exports this module as a temporary migration surface.

pub mod codec_ext;
pub mod hwaccel;
pub mod iframe;
pub mod muxer;
pub mod pool;
mod traits;

pub use codec_ext::{
    AudioCodecExt, ContainerFormatExt, EncoderPresetExt, HwEncoderTypeExt, VideoCodecExt,
};
pub use hwaccel::HwAccelEncoder;
pub use iframe::{encode_nv12_to_h264_iframe, global_iframe_encoder, IFrameConfig, IFrameEncoder};
pub use muxer::{FfmpegMuxer, Muxer, StreamInfo};
pub use pool::{global_encoder_pool, EncoderPool};
pub use traits::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwEncoderType,
    PixelFormat, VideoCodec,
};
