//! Command-line argument definitions
//!
//! Each engine controller group is exposed as a top-level subcommand.
//! Actions within each group are listed as sub-subcommands with shared options.
//!
//! Special handling:
//! - `timelines export` supports rich CLI flags (--jvi-file, --output, --codec, etc.)
//!   with progress bar display, in addition to the generic JSON mode.

use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// Neko Engine - Media Processing CLI
///
/// Dispatch actions to engine controller groups.
///
/// Examples:
///   neko-engine nodes health
///   neko-engine videos probe --options '{"source":"/path/to/video.mp4"}'
///   neko-engine timelines export -i project.nkv -o output.mp4
///   neko-engine serve -p 8765
#[derive(Parser, Debug)]
#[command(name = "neko-engine")]
#[command(version, about, long_about = None)]
pub struct Args {
    #[command(subcommand)]
    pub command: Command,
}

// ---------------------------------------------------------------------------
// Shared action options (--id, --options, --body, -f)
// ---------------------------------------------------------------------------

/// Common options shared by all generic actions
#[derive(Debug, Clone, clap::Args)]
pub struct ActionOpts {
    /// Resource ID (optional)
    #[arg(long)]
    pub id: Option<String>,

    /// Source file path
    #[arg(short = 'i', long)]
    pub source: Option<String>,

    /// Session ID for multi-window isolation
    #[arg(long)]
    pub session: Option<String>,

    /// Stream ID for stream control actions
    #[arg(long)]
    pub stream: Option<String>,

    /// Options as JSON string
    #[arg(long)]
    pub options: Option<String>,

    /// Body as JSON string (for complex payloads)
    #[arg(long)]
    pub body: Option<String>,

    /// Output format (json, pretty)
    #[arg(short, long, default_value = "pretty")]
    pub format: String,
}

// ---------------------------------------------------------------------------
// Macro: define action enum for a controller group
// ---------------------------------------------------------------------------

/// Generate a typed action enum where each variant carries `ActionOpts`.
macro_rules! define_actions {
    (
        $enum_name:ident {
            $( $(#[$meta:meta])* $variant:ident => $action_str:literal ),+ $(,)?
        }
    ) => {
        #[derive(Subcommand, Debug)]
        pub enum $enum_name {
            $(
                $(#[$meta])*
                $variant {
                    #[command(flatten)]
                    opts: ActionOpts,
                },
            )+
        }

        impl $enum_name {
            /// Return the engine action name string
            pub fn action_name(&self) -> &'static str {
                match self {
                    $( $enum_name::$variant { .. } => $action_str, )+
                }
            }

            /// Return the shared action options
            pub fn opts(&self) -> &ActionOpts {
                match self {
                    $( $enum_name::$variant { opts, .. } => opts, )+
                }
            }

            /// Return all action name strings (for registry alignment tests)
            #[allow(dead_code)]
            pub fn all_action_names() -> &'static [&'static str] {
                &[$( $action_str, )+]
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Top-level commands
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start as WebSocket server
    Serve {
        /// Server port (default: 8765)
        #[arg(short, long, default_value = "8765")]
        port: u16,

        /// Config file path (optional)
        #[arg(short, long)]
        config: Option<PathBuf>,

        /// Enable verbose logging
        #[arg(short, long)]
        verbose: bool,
    },

    /// Node management: health, metric, gpu
    Nodes {
        #[command(subcommand)]
        action: NodeAction,
    },

    /// Task management: probe, pause, resume, cancel, list
    Tasks {
        #[command(subcommand)]
        action: TaskAction,
    },

    /// Video processing: probe, capture, extract, stream, transcode, keyframes, waveform, proxy, stop, pause, resume, speed, seek, loop
    Videos {
        #[command(subcommand)]
        action: VideoAction,
    },

    /// Audio processing: probe, transcode, stream, waveform, diff, stop, pause, resume, speed, seek
    Audios {
        #[command(subcommand)]
        action: AudioAction,
    },

    /// Image processing: probe, capture, encode, diff
    Images {
        #[command(subcommand)]
        action: ImageAction,
    },

    /// Timeline editing & export: probe, composite, stream, stop, pause, resume, speed, loop, seek, diff, export, export_progress, export_cancel
    Timelines {
        #[command(subcommand)]
        action: TimelineAction,
    },

    /// Stream lifecycle: create, activate, pause, resume, destroy, list
    Streams {
        #[command(subcommand)]
        action: StreamAction,
    },

    /// File access: register, unregister, stat, resolve
    Files {
        #[command(subcommand)]
        action: FileAction,
    },
}

// ---------------------------------------------------------------------------
// Per-group action enums
// ---------------------------------------------------------------------------

define_actions!(NodeAction {
    /// Check node health status
    Health => "health",
    /// Get node performance metrics
    Metric => "metric",
    /// Get GPU information
    Gpu => "gpu",
    /// Get hardware capabilities
    HwCapabilities => "hw_capabilities",
});

define_actions!(TaskAction {
    /// Query task progress by ID
    Probe => "probe",
    /// Pause a running task
    Pause => "pause",
    /// Resume a paused task
    Resume => "resume",
    /// Cancel a task
    Cancel => "cancel",
    /// List all tasks
    List => "list",
});

define_actions!(VideoAction {
    /// Probe video file metadata
    Probe => "probe",
    /// Capture a single frame as JPEG
    Capture => "capture",
    /// Extract subtitles, frames, or frame sequences
    Extract => "extract",
    /// Start video streaming
    Stream => "stream",
    /// Transcode video file
    Transcode => "transcode",
    /// Extract keyframes
    Keyframes => "keyframes",
    /// Generate audio waveform
    Waveform => "waveform",
    /// Generate proxy file
    Proxy => "proxy",
    /// Compare two video files (metadata + content SSIM/PSNR)
    Diff => "diff",
    /// Stop video stream
    Stop => "stop",
    /// Pause video stream
    Pause => "pause",
    /// Resume video stream
    Resume => "resume",
    /// Set playback speed
    Speed => "speed",
    /// Seek to time position
    Seek => "seek",
    /// Set loop region
    Loop => "loop",
});

define_actions!(AudioAction {
    /// Probe audio file metadata
    Probe => "probe",
    /// Transcode audio file
    Transcode => "transcode",
    /// Return an encoded audio segment as base64
    Segment => "segment",
    /// Start audio streaming
    Stream => "stream",
    /// Generate audio waveform
    Waveform => "waveform",
    /// Compare two audio files (metadata + content)
    Diff => "diff",
    /// Stop audio stream
    Stop => "stop",
    /// Pause audio stream
    Pause => "pause",
    /// Resume audio stream
    Resume => "resume",
    /// Set playback speed
    Speed => "speed",
    /// Seek to time position
    Seek => "seek",
    /// Set loop region for audio stream
    Loop => "loop",
    /// Analyze audio loudness (ITU-R BS.1770-4 / EBU R128)
    AnalyzeLoudness => "analyze_loudness",
    /// Detect silence regions in audio
    DetectSilence => "detect_silence",
    /// Mix down multi-track audio into a single output
    Mixdown => "mixdown",
    /// Start or update a multi-track audio mix stream
    MixStream => "mix_stream",
    /// Export a .nka project file by mapping it to MixdownConfig
    MixExport => "mix_export",
});

define_actions!(ImageAction {
    /// Probe image file metadata
    Probe => "probe",
    /// Capture/convert image
    Capture => "capture",
    /// Encode RGBA data to image format
    Encode => "encode",
    /// Compare two image files (metadata + content)
    Diff => "diff",
});

define_actions!(StreamAction {
    /// Create a new stream
    Create => "create",
    /// Activate a stream
    Activate => "activate",
    /// Pause a stream
    Pause => "pause",
    /// Resume a stream
    Resume => "resume",
    /// Destroy a stream
    Destroy => "destroy",
    /// List all streams
    List => "list",
    /// Stop a stream
    Stop => "stop",
    /// Seek within a stream
    Seek => "seek",
    /// Set stream playback speed
    Speed => "speed",
    /// Set stream loop region
    Loop => "loop",
    /// Get stream statistics
    Stats => "stats",
    /// Update stream configuration
    Update => "update",
    /// Set stream quality
    Quality => "quality",
    /// Apply an operation to a stream
    ApplyOperation => "applyOperation",
});

define_actions!(FileAction {
    /// Register a local file and receive an engine token
    Register => "register",
    /// Release a registered file token
    Unregister => "unregister",
    /// Get metadata for a registered file token
    Stat => "stat",
    /// Resolve and authorize a local file path
    Resolve => "resolve",
});

// ---------------------------------------------------------------------------
// Timeline actions (special: export has rich CLI flags)
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
pub enum TimelineAction {
    /// Probe timeline (.nkv) file metadata
    Probe {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Composite a single frame from timeline
    Composite {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Start timeline streaming
    Stream {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Get stream performance stats
    StreamStats {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Stop timeline stream
    Stop {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Pause timeline stream
    Pause {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Resume timeline stream
    Resume {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Set timeline playback speed
    Speed {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Set timeline loop region
    Loop {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Seek timeline to time position
    Seek {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Compare two timeline files (metadata + content)
    Diff {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Export a .nkv project file with progress display
    Export {
        /// Path to .nkv project file
        #[arg(short = 'i', long)]
        jvi_file: PathBuf,

        /// Output video file path
        #[arg(short, long)]
        output: PathBuf,

        /// Video codec (h264, h265, vp9, prores)
        #[arg(long, default_value = "h264")]
        codec: String,

        /// Video bitrate in bps (default: 5000000)
        #[arg(long, default_value = "5000000")]
        bitrate: u64,

        /// Encoder preset (ultrafast, fast, medium, slow, veryslow)
        #[arg(long, default_value = "medium")]
        preset: String,

        /// Hardware encoder (auto, videotoolbox, nvenc, vaapi, qsv, none)
        #[arg(long, default_value = "auto")]
        hw_encoder: String,

        /// Enable zero-copy GPU encoding (macOS only)
        #[arg(long, default_value = "false")]
        zero_copy: bool,
    },

    /// Query export job progress
    ExportProgress {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Cancel an export job
    ExportCancel {
        #[command(flatten)]
        opts: ActionOpts,
    },
}

impl TimelineAction {
    /// Return all action name strings (for registry alignment tests)
    #[allow(dead_code)]
    pub fn all_action_names() -> &'static [&'static str] {
        &[
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
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::registry;

    #[test]
    fn test_node_actions_align_with_registry() {
        assert_eq!(
            NodeAction::all_action_names(),
            registry::actions::NODES,
            "NodeAction variants do not match registry::actions::NODES"
        );
    }

    #[test]
    fn test_task_actions_align_with_registry() {
        assert_eq!(
            TaskAction::all_action_names(),
            registry::actions::TASKS,
            "TaskAction variants do not match registry::actions::TASKS"
        );
    }

    #[test]
    fn test_video_actions_align_with_registry() {
        assert_eq!(
            VideoAction::all_action_names(),
            registry::actions::VIDEOS,
            "VideoAction variants do not match registry::actions::VIDEOS"
        );
    }

    #[test]
    fn test_audio_actions_align_with_registry() {
        assert_eq!(
            AudioAction::all_action_names(),
            registry::actions::AUDIOS,
            "AudioAction variants do not match registry::actions::AUDIOS"
        );
    }

    #[test]
    fn test_image_actions_align_with_registry() {
        assert_eq!(
            ImageAction::all_action_names(),
            registry::actions::IMAGES,
            "ImageAction variants do not match registry::actions::IMAGES"
        );
    }

    #[test]
    fn test_timeline_actions_align_with_registry() {
        assert_eq!(
            TimelineAction::all_action_names(),
            registry::actions::TIMELINES,
            "TimelineAction variants do not match registry::actions::TIMELINES"
        );
    }

    #[test]
    fn test_stream_actions_align_with_registry() {
        assert_eq!(
            StreamAction::all_action_names(),
            registry::actions::STREAMS,
            "StreamAction variants do not match registry::actions::STREAMS"
        );
    }

    #[test]
    fn test_file_actions_align_with_registry() {
        assert_eq!(
            FileAction::all_action_names(),
            registry::actions::FILES,
            "FileAction variants do not match registry::actions::FILES"
        );
    }
}
