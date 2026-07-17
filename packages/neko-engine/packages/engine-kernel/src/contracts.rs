//! Host-facing kernel contracts.
//!
//! This module is the approved import surface for host crates that need kernel
//! DTOs, service traits, or temporary compatibility types. Implementation
//! modules remain behind the facade or compatibility paths.

/// Audio contracts used by host controllers and N-API conversions.
pub mod audio {
    pub use crate::domain::{
        AudioOutputFormat, AudioRenderEffectConfig, AudioTranscodeOptions, StreamConfig,
    };
    pub use crate::services::audio_mixdown::{
        AudioMixdown, MixdownConfig, MixdownElement, MixdownTrack,
    };
    pub use neko_engine_audio::{
        AudioCodec, AudioEncoder, AudioEncoderConfig, AudioInfo, FfmpegAudioEncoder,
    };
}

/// Codec helper contracts used by host controllers.
pub mod codec {
    pub use crate::encoder::codec_ext::HwEncoderTypeExt;
    pub use crate::encoder::hwaccel::detect_hw_encoders;
}

/// Domain contracts that remain part of the host-facing kernel API.
pub mod domain {
    pub use crate::domain::operations::EditOperationEnvelope;
    pub use crate::domain::{
        infer_resource_type, AudioOutputFormat, AudioRenderEffectConfig, AudioTranscodeOptions,
        CaptureOptions, ExtractOptions, ExtractType, FrameData, ResourceHandle, StreamCodec,
        StreamConfig, StreamEntry, StreamTransitionError, Timeline, TranscodeOptions,
    };
}

/// Error contracts shared by kernel and host error mapping.
pub mod error {
    pub use crate::error::{Error, Result};
}

/// Export contracts used by timeline and view adapters.
pub mod export {
    pub use crate::export::{
        ExportHwEncoder, ExportJobConfig, ExportPreset, ExportSettings, ExportVideoCodec,
    };
}

/// GPU contracts used by host adapters.
pub mod gpu {
    pub use neko_engine_gpu::ParamDef;
    pub use neko_engine_gpu::{GpuContext, Lut3DData, LutRegistry};
    pub use neko_engine_gpu::{GpuInfo, GpuInfo as GpuDeviceInfo};
}

/// JVI project loading contracts.
pub mod jvi {
    pub use crate::domain::JviLoader;
}

/// Media helper contracts used by host controllers and N-API conversions.
pub mod media {
    pub use neko_runtime_media::{
        diff_audio_content_with_options, diff_media, diff_timeline_content_with_options,
        diff_video_content, encode_rgba_to_jpeg, AudioDiffOptions, ContentDiff, DiffCategory,
        ExtractedSubtitleTrack, MediaInfo, SubtitleCue, SubtitleStream, TimelineDiffOptions,
        VideoDiffOptions,
    };
}

/// Preview contracts used by stream setup.
pub mod preview {
    pub use crate::preview::PreviewPipelineConfig;
}

/// Media service traits approved for host callers.
pub mod services {
    pub use crate::services::{
        EffectRegistry, IAudioService, IEffectsService, IExportService, IImageService,
        INodeService, IStreamPlayback, ITaskService, ITimelineService, IVideoService, PipelineSink,
        StreamSink,
    };
}
