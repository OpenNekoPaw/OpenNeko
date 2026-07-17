//! Neko Native NAPI - Node.js N-API bindings for neko-engine-kernel

mod bridge;
mod engine;
mod types;

// New unified API (Phase 4)
pub use engine::NativeEngine;

// Bridge functions (Phase A + B)
pub use bridge::{
    bridge_audio_info, bridge_effects_apply, bridge_effects_info, bridge_effects_list,
    bridge_effects_register, bridge_encode_jpeg, bridge_extract_frame, bridge_extract_subtitles,
    bridge_generate_waveform, bridge_get_keyframes, bridge_gpu_info, bridge_probe_media,
};

// Types used by bridge functions
pub use types::{
    JsAudioInfo, JsExtractedSubtitleTrack, JsFrameData, JsGpuInfo, JsHwAccelInfo, JsProbeMediaInfo,
    JsProbeSubtitleStream, JsSubtitleCue,
};
