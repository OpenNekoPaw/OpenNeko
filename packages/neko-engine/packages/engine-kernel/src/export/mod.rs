//! Export module - Server-side video export
//!
//! All processing (decode, composite, encode, mux) happens server-side.
//! GPU-centric pipeline keeps all visual data on GPU textures until final encoding.
//!
//! Accessed via ActionRouter: `timelines:export`, `timelines:export_progress`, `timelines:export_cancel`

#![allow(unused_imports)]

mod audio_mixer;
mod backend;
mod gpu_export_pipeline;
mod service;
mod sink_factory;
mod types;

pub use audio_mixer::{AudioMixer, MixedAudioFrame};
pub use backend::{
    build_audio_encoder_config, build_export_metadata, DefaultExportAudioBackendFactory,
    DefaultExportAudioEncodeBackendFactory, DefaultExportEncodeBackendFactory,
    DefaultExportRenderBackendFactory, ExportAudioBackend, ExportAudioBackendFactory,
    ExportAudioEncodeBackend, ExportAudioEncodeBackendFactory, ExportBackendBundle,
    ExportEncodeBackend, ExportEncodeBackendFactory, ExportRenderBackend,
    ExportRenderBackendFactory, ExportRenderedFrame,
};
pub use gpu_export_pipeline::GpuExportPipeline;
pub use neko_engine_gpu::EffectDispatcher;
pub use neko_engine_gpu::GpuPipelineTiming;
pub use service::ExportService;
pub use sink_factory::{DefaultExportSinkFactory, ExportSink, ExportSinkFactory};
pub use types::*;
