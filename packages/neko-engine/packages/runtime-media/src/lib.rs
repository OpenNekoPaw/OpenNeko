//! runtime-media — Media processing runtime for Neko Engine
//!
//! Provides audio/video/image domain logic that does NOT depend on GPU:
//! - Media file probing (FFmpeg metadata extraction + ProbeCache)
//! - Audio content diff (SNR-based waveform comparison)
//! - Video content diff (FFmpeg SSIM/PSNR frame comparison)
//! - Image content diff (pixel-level SSIM/PSNR)
//! - Subtitle extraction
//! - JPEG encoding (RGBA → JPEG via image crate)
//! - Timeline/JVI structural diff and raw project parsing

pub mod audio_diff;
pub mod diff;
pub mod error;
pub mod ffmpeg_parser;
pub mod frame_capture;
pub mod image_analysis;
pub mod image_diff;
pub mod image_variant;
pub mod jpeg_encoder;
pub mod jvi;
pub mod probe;
pub mod sidecar;
pub mod subtitle;
pub mod timeline_diff;
pub mod video_diff;

#[cfg(test)]
mod architecture_tests;

// Re-export primary types
pub use audio_diff::{
    diff_audio_content, diff_audio_content_with_options, AudioContentDiff, AudioDiffOptions,
    AudioDiffRegion,
};
pub use diff::{diff_media, ContentDiff, DiffCategory, DiffResult, FieldDiff};
pub use error::{MediaError, Result};
pub use frame_capture::{capture_video_frame, CapturedVideoFrame, VideoFrameCaptureOptions};
pub use image_analysis::{
    contains_gpano_metadata, default_panorama_view_state, infer_projection,
    manual_projection_metadata, parse_gpano_coverage, probe_dimensions, PanoramaCoverageAngle,
    PanoramaViewMode, PanoramaViewState, PreviewDimensions, PreviewProjectionConfidence,
    PreviewProjectionMetadata, PreviewProjectionType, PreviewToneMapping, ProjectionInferenceInput,
};
pub use image_diff::{diff_image_content, ImageContentDiff};
pub use image_variant::{
    generate_preview_variant, generated_proxy_needed, infer_dynamic_range, is_exr_path,
    is_hdr_path, ImageVariantArtifact, ImageVariantFormat, ImageVariantRequest, ImageVariantRole,
    PreviewDynamicRange,
};
pub use jpeg_encoder::{encode_rgb_to_jpeg, encode_rgba_to_jpeg};
pub use jvi::{
    load_project, load_project_from_json, AudioDefaults, JviAudioElement, JviAudioProperties,
    JviElement, JviMediaElement, JviProjectLoader, JviShapeElement, JviSubtitleElement,
    JviTextElement, JviTrack, JviTransform, ProjectData, ProjectDefaults, Resolution, TextDefaults,
    TransformDefaults,
};
pub use probe::{global_probe_cache, probe_media_info, MediaInfo, ProbeCache, SubtitleStream};
pub use sidecar::{read_sidecar, sidecar_path, write_sidecar_update, PreviewAssetSidecar};
pub use subtitle::{extract_subtitles, ExtractedSubtitleTrack, SubtitleCue};
pub use timeline_diff::{
    diff_timeline_content, diff_timeline_content_with_options, ElementChange, ElementContentDiff,
    ElementContentDiffResult, PropertyChange, TimelineChangeType, TimelineContentDiff,
    TimelineDiffOptions, TimelineDiffSummary, TimelineProjectMeta, TrackChange,
};
pub use video_diff::{
    diff_video_content, FrameMetric, VideoContentDiff, VideoDiffOptions, VideoDiffRegion,
};
