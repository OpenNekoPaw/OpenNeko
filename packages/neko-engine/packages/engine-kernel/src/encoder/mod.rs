//! Encoder module - video encoding with hardware acceleration.
//!
//! Codec implementation lives in `neko-engine-codec`. This module keeps the
//! previous kernel import surface as a temporary migration compatibility layer,
//! while `pipeline` remains kernel-owned because it still mixes GPU/export
//! orchestration with encode/mux workers.

pub mod pipeline;

pub use neko_engine_codec::encoder::codec_ext;
pub use neko_engine_codec::encoder::hwaccel;
pub use neko_engine_codec::encoder::{global_encoder_pool, FfmpegMuxer, HwAccelEncoder, Muxer};
pub use neko_engine_codec::encoder::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwEncoderType,
    VideoCodec,
};
pub use pipeline::{AsyncExportPipeline, CompositedFrame, PipelineConfig};
