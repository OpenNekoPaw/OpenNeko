//! Service traits for dependency injection
//!
//! This module defines the service interfaces (traits) that abstract business logic.
//! Implementations can be swapped for testing or different backends.

#![allow(unused_imports)]

mod audio;
pub mod audio_mixdown;
mod effect_registry;
mod effects;
mod export;
mod image;
mod node;
pub mod pipeline_sink;
mod playback;
mod task;
mod timeline;
mod video;

pub mod impls;

pub use audio::IAudioService;
pub use effect_registry::EffectRegistry;
pub use effects::IEffectsService;
pub use export::IExportService;
pub use image::IImageService;
pub use node::{GpuInfo, INodeService};
pub use pipeline_sink::{
    AudioBuffer, AudioEncodedPacket, AudioOutput, GpuFrameLease, GpuOutputHandle,
    GpuReadbackTarget, PipelineOutput, PipelineSink, PreviewUnavailable, PreviewUnavailableReason,
    VideoEncodedPacket, VideoGpuFrame, VideoOutput, VideoPreviewFrame, VideoRawFrame,
};
pub use playback::IStreamPlayback;
pub use task::ITaskService;
pub use timeline::{ITimelineService, StreamStats, TimelineStreamResult};
pub use video::IVideoService;

// Re-export implementations
pub use impls::{
    AudioService, EffectsService, ExportService, ImageService, MuxerSink, NodeService, StreamSink,
    TaskService, TimelineService, VideoService,
};
