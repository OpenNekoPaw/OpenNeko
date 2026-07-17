//! EditOperation types for incremental timeline updates
//!
//! Defines TypeScript EditOperation types that the Rust engine can apply
//! incrementally to a stored Timeline, avoiding full JSON parse + JVI conversion.
//!
//! Supported operations (fast path):
//! - P0: element.update, track.toggle, element.toggle
//! - P1: track.update, element.splitKeepLeft, element.splitKeepRight, project.update
//! - P2: element.add/remove/move, track.add/remove/reorder,
//!   element.splitAt, element.linkAudio, element.unlinkAudio, batch
//!
//! Unsupported operations fall back to full `streams:update` via Extension.

use neko_engine_types::BlendMode;
use serde::Deserialize;
use serde_json::Value;

use super::Transform;

/// Envelope matching TypeScript EditOperation JSON shape.
/// Only `type` and `payload` are needed; `meta` and `before` are ignored.
#[derive(Debug, Deserialize)]
pub struct EditOperationEnvelope {
    #[serde(rename = "type")]
    pub op_type: String,
    #[serde(default)]
    pub payload: Value,
}

/// Result of attempting to apply an operation incrementally
pub enum ApplyResult {
    /// Operation applied successfully to the timeline
    Applied,
    /// Operation type not supported for incremental apply;
    /// caller should fall back to full `streams:update`
    Unsupported,
}

// ==========================================================================
// P0: element.update, track.toggle, element.toggle
// ==========================================================================

/// Payload for `element.update` — covers drag, resize, trim, transform operations
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementUpdatePayload {
    pub track_id: String,
    pub element_id: String,
    pub updates: ElementUpdates,
}

/// Element fields that can be incrementally patched.
/// All fields are optional; only provided fields are applied.
/// Unknown JSON fields are silently ignored via serde(default).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementUpdates {
    #[serde(default)]
    pub start_time: Option<f64>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub trim_start: Option<f64>,
    #[serde(default)]
    pub trim_end: Option<f64>,
    #[serde(default)]
    pub opacity: Option<f64>,
    #[serde(default)]
    pub muted: Option<bool>,
    #[serde(default)]
    pub hidden: Option<bool>,
    #[serde(default)]
    pub locked: Option<bool>,
    #[serde(default)]
    pub name: Option<String>,
    // P0 additions: rendering-critical fields
    #[serde(default)]
    pub transform: Option<Transform>,
    /// Blend mode as string (TS sends camelCase: "colorDodge", "softLight", etc.)
    #[serde(default)]
    pub blend_mode: Option<String>,
    /// Visual effects (replaces entire Vec when Some)
    #[serde(default)]
    pub effects: Option<Vec<neko_engine_types::ElementEffect>>,
}

/// Payload for `track.toggle` — mute/lock/hide a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTogglePayload {
    pub track_id: String,
    /// One of: "muted", "locked", "hidden"
    pub field: String,
}

/// Payload for `element.toggle` — mute/hide/lock an element
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementTogglePayload {
    pub track_id: String,
    pub element_id: String,
    /// One of: "muted", "hidden", "locked"
    pub field: String,
}

// ==========================================================================
// P1: track.update, element.splitKeepLeft/Right, project.update
// ==========================================================================

/// Payload for `track.update` — rename, mute, lock, hide a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackUpdatePayload {
    pub track_id: String,
    pub updates: TrackUpdates,
}

/// Track fields that can be incrementally patched
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackUpdates {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub muted: Option<bool>,
    #[serde(default)]
    pub locked: Option<bool>,
    #[serde(default)]
    pub hidden: Option<bool>,
    #[serde(default)]
    pub is_main: Option<bool>,
}

/// Payload for `element.splitKeepLeft` — trim right side at split point
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementSplitKeepLeftPayload {
    pub track_id: String,
    pub element_id: String,
    pub split_point: f64,
    #[serde(default)]
    pub new_duration: Option<f64>,
}

/// Payload for `element.splitKeepRight` — trim left side at split point
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementSplitKeepRightPayload {
    pub track_id: String,
    pub element_id: String,
    pub split_point: f64,
    pub new_start_time: f64,
    #[serde(default)]
    pub new_duration: Option<f64>,
}

/// Payload for `project.update` — fps/resolution changes
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdatePayload {
    pub updates: ProjectUpdates,
}

/// Project-level fields that can be patched
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdates {
    #[serde(default)]
    pub fps: Option<f64>,
    #[serde(default)]
    pub resolution: Option<neko_engine_types::Resolution>,
}

// ==========================================================================
// P2: structural operations (add/remove/move/reorder/split/link/batch)
// ==========================================================================

/// Payload for `element.add` — add a new element to a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementAddPayload {
    pub track_id: String,
    /// Element data as raw JSON (deserialized to domain Element later)
    pub element: Value,
    #[serde(default)]
    pub index: Option<usize>,
}

/// Payload for `element.remove` — remove an element from a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementRemovePayload {
    pub track_id: String,
    pub element_id: String,
}

/// Payload for `element.move` — move an element between tracks
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementMovePayload {
    pub from_track_id: String,
    pub to_track_id: String,
    pub element_id: String,
}

/// Payload for `element.splitAt` — split element and add right half
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementSplitAtPayload {
    pub track_id: String,
    pub element_id: String,
    pub split_point: f64,
    /// Right element data as raw JSON
    pub right_element: Value,
}

/// Payload for `element.linkAudio` — link audio to a video element
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementLinkAudioPayload {
    pub video_track_id: String,
    pub video_element_id: String,
    pub audio_track_id: String,
    /// Audio element data as raw JSON
    pub audio_element: Value,
    /// Optional new audio track as raw JSON (created if needed)
    #[serde(default)]
    pub audio_track: Option<Value>,
}

/// Payload for `element.unlinkAudio` — unlink audio from a video element
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementUnlinkAudioPayload {
    pub video_track_id: String,
    pub video_element_id: String,
}

/// Payload for `track.add` — add a new track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackAddPayload {
    /// Track data as raw JSON
    pub track: Value,
    #[serde(default)]
    pub index: Option<usize>,
}

/// Payload for `track.remove` — remove a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRemovePayload {
    pub track_id: String,
}

/// Payload for `track.reorder` — reorder a track
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackReorderPayload {
    pub track_id: String,
    pub from_index: usize,
    pub to_index: usize,
}

/// Payload for `batch` — apply multiple operations atomically
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPayload {
    pub operations: Vec<EditOperationEnvelope>,
}

// ==========================================================================
// Helper: blend mode string → BlendMode conversion
// ==========================================================================

/// Parse blend mode from TS camelCase string to Rust BlendMode enum.
/// Accepts both camelCase (TS standard) and lowercase (legacy).
pub fn parse_blend_mode(s: &str) -> BlendMode {
    match s.to_lowercase().as_str() {
        "normal" => BlendMode::Normal,
        "multiply" => BlendMode::Multiply,
        "screen" => BlendMode::Screen,
        "overlay" => BlendMode::Overlay,
        "darken" => BlendMode::Darken,
        "lighten" => BlendMode::Lighten,
        "colordodge" | "color_dodge" => BlendMode::ColorDodge,
        "colorburn" | "color_burn" => BlendMode::ColorBurn,
        "hardlight" | "hard_light" => BlendMode::HardLight,
        "softlight" | "soft_light" => BlendMode::SoftLight,
        "difference" => BlendMode::Difference,
        "exclusion" => BlendMode::Exclusion,
        "hue" => BlendMode::Hue,
        "saturation" => BlendMode::Saturation,
        "color" => BlendMode::Color,
        "luminosity" => BlendMode::Luminosity,
        _ => BlendMode::Normal,
    }
}
