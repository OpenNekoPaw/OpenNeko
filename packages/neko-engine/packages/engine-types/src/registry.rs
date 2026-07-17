//! Canonical action registry for the pruned media engine.

/// Group names exposed by Host API, CLI, and N-API.
pub mod groups {
    pub const NODES: &str = "nodes";
    pub const TASKS: &str = "tasks";
    pub const VIDEOS: &str = "videos";
    pub const AUDIOS: &str = "audios";
    pub const IMAGES: &str = "images";
    pub const TIMELINES: &str = "timelines";
    pub const STREAMS: &str = "streams";
    pub const EFFECTS: &str = "effects";
    pub const COLOR_CORRECTION: &str = "color-correction";
    pub const FILES: &str = "files";
    pub const PREVIEWS: &str = "previews";

    pub const ALL: &[&str] = &[
        NODES,
        TASKS,
        VIDEOS,
        AUDIOS,
        IMAGES,
        TIMELINES,
        STREAMS,
        EFFECTS,
        COLOR_CORRECTION,
        FILES,
        PREVIEWS,
    ];
}

/// Actions exposed by each retained group.
pub mod actions {
    pub const NODES: &[&str] = &["health", "metric", "gpu", "hw_capabilities"];
    pub const TASKS: &[&str] = &["probe", "pause", "resume", "cancel", "list"];
    pub const VIDEOS: &[&str] = &[
        "probe",
        "capture",
        "extract",
        "stream",
        "transcode",
        "keyframes",
        "waveform",
        "proxy",
        "diff",
        "stop",
        "pause",
        "resume",
        "speed",
        "seek",
        "loop",
    ];
    pub const AUDIOS: &[&str] = &[
        "probe",
        "transcode",
        "segment",
        "stream",
        "waveform",
        "diff",
        "stop",
        "pause",
        "resume",
        "speed",
        "seek",
        "loop",
        "analyze_loudness",
        "detect_silence",
        "mixdown",
        "mix_stream",
        "mix_export",
    ];
    pub const IMAGES: &[&str] = &["probe", "capture", "encode", "diff"];
    pub const TIMELINES: &[&str] = &[
        "probe",
        "composite",
        "stream",
        "stream_stats",
        "stop",
        "pause",
        "resume",
        "speed",
        "loop",
        "seek",
        "diff",
        "export",
        "export_progress",
        "export_cancel",
    ];
    pub const STREAMS: &[&str] = &[
        "create",
        "activate",
        "pause",
        "resume",
        "destroy",
        "list",
        "stop",
        "seek",
        "speed",
        "loop",
        "stats",
        "update",
        "quality",
        "applyOperation",
    ];
    pub const EFFECTS: &[&str] = &["apply", "list", "info", "register", "list-capabilities"];
    pub const COLOR_CORRECTION: &[&str] = &["upload_lut", "remove_lut", "list_luts"];
    pub const FILES: &[&str] = &["register", "unregister", "stat", "resolve"];
    pub const PREVIEWS: &[&str] = &[
        "register-asset",
        "request-variant",
        "update-metadata",
        "unregister",
        "register-token",
        "unregister-token",
        "generate",
    ];
}
