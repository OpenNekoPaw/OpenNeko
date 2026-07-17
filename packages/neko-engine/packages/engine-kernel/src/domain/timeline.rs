//! Unified Timeline model
//!
//! The single source of truth for timeline data structures.
//! Used by all modules: export, jvi, preview, services.

use neko_engine_types::{BlendMode, ElementEffect, Resolution, TrackType};
use serde::{Deserialize, Serialize};

use super::Transform;
use neko_engine_types::easing::{Easing, EasingType};

mod apply;

#[cfg(test)]
mod tests;

/// A timeline represents a complete editing project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    /// Total duration in seconds
    pub duration: f64,
    /// Output resolution
    pub resolution: Resolution,
    /// Frame rate
    pub fps: f64,
    /// Tracks in the timeline
    pub tracks: Vec<Track>,
    /// Project defaults
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaults: Option<ProjectDefaults>,
}

impl Timeline {
    /// Create a new empty timeline
    pub fn new(resolution: Resolution, fps: f64) -> Self {
        Self {
            duration: 0.0,
            resolution,
            fps,
            tracks: Vec::new(),
            defaults: None,
        }
    }

    /// Calculate duration from elements (max end time across all tracks)
    pub fn calculated_duration(&self) -> f64 {
        self.tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .map(|e| e.end_time())
            .fold(0.0_f64, f64::max)
    }

    /// Return effective duration: use `self.duration` if set, otherwise calculate from elements
    pub fn effective_duration(&self) -> f64 {
        if self.duration > 0.0 {
            self.duration
        } else {
            self.calculated_duration()
        }
    }

    /// Calculate total frames based on fps
    pub fn total_frames(&self) -> u64 {
        (self.duration * self.fps).ceil() as u64
    }

    /// Calculate total frames with custom fps
    pub fn total_frames_at_fps(&self, fps: f64) -> u64 {
        (self.duration * fps).ceil() as u64
    }

    /// Get all video tracks
    pub fn video_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks
            .iter()
            .filter(|t| matches!(t.track_type, TrackType::Video | TrackType::Media))
    }

    /// Get all audio tracks
    pub fn audio_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks
            .iter()
            .filter(|t| matches!(t.track_type, TrackType::Audio))
    }

    /// Get all media sources (file paths) used in the timeline
    pub fn get_media_sources(&self) -> Vec<String> {
        let mut sources = Vec::new();
        for track in &self.tracks {
            for element in &track.elements {
                if let Some(src) = element.source_path() {
                    if !sources.contains(&src) {
                        sources.push(src);
                    }
                }
            }
        }
        sources
    }

    /// Get elements visible at a specific time
    pub fn elements_at_time(&self, time: f64) -> Vec<&Element> {
        self.tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .filter(|e| e.is_visible_at(time))
            .collect()
    }

    /// Recalculate duration from track contents
    pub fn recalculate_duration(&mut self) {
        self.duration = self
            .tracks
            .iter()
            .flat_map(|t| t.elements.iter())
            .map(|e| e.end_time())
            .fold(0.0, f64::max);
    }

    // =========================================================================
    // Incremental operation apply (used by streams:applyOperation)
    // =========================================================================

    /// Try to apply an EditOperation incrementally.
    /// Returns `Unsupported` for operation types not handled here;
    /// the caller should fall back to full `streams:update`.
    pub fn try_apply_operation(
        &mut self,
        op: &super::operations::EditOperationEnvelope,
    ) -> crate::error::Result<super::operations::ApplyResult> {
        self.try_apply_operation_with_base_dir(op, None)
    }

    /// Try to apply with optional base_dir for resolving relative paths (P2 ops)
    pub fn try_apply_operation_with_base_dir(
        &mut self,
        op: &super::operations::EditOperationEnvelope,
        base_dir: Option<&std::path::Path>,
    ) -> crate::error::Result<super::operations::ApplyResult> {
        use super::operations::*;

        match op.op_type.as_str() {
            // ---- P0: element.update, track.toggle, element.toggle ----
            "element.update" => {
                let payload: ElementUpdatePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid element.update payload: {}", e))
                    })?;
                self.apply_element_update(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "track.toggle" => {
                let payload: TrackTogglePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid track.toggle payload: {}", e))
                    })?;
                self.apply_track_toggle(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.toggle" => {
                let payload: ElementTogglePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid element.toggle payload: {}", e))
                    })?;
                self.apply_element_toggle(&payload)?;
                Ok(ApplyResult::Applied)
            }

            // ---- P1: track.update, element.splitKeepLeft/Right, project.update ----
            "track.update" => {
                let payload: TrackUpdatePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid track.update payload: {}", e))
                    })?;
                self.apply_track_update(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.splitKeepLeft" => {
                let payload: ElementSplitKeepLeftPayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.splitKeepLeft payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_split_keep_left(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.splitKeepRight" => {
                let payload: ElementSplitKeepRightPayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.splitKeepRight payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_split_keep_right(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "project.update" => {
                let payload: ProjectUpdatePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid project.update payload: {}", e))
                    })?;
                self.apply_project_update(&payload)?;
                Ok(ApplyResult::Applied)
            }

            // ---- P2: structural operations ----
            "element.add" => {
                let payload: ElementAddPayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid element.add payload: {}", e))
                    })?;
                self.apply_element_add(&payload, base_dir)?;
                Ok(ApplyResult::Applied)
            }
            "element.remove" => {
                let payload: ElementRemovePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid element.remove payload: {}", e))
                    })?;
                self.apply_element_remove(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.move" => {
                let payload: ElementMovePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid element.move payload: {}", e))
                    })?;
                self.apply_element_move(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "element.splitAt" => {
                let payload: ElementSplitAtPayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.splitAt payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_split_at(&payload, base_dir)?;
                Ok(ApplyResult::Applied)
            }
            "element.linkAudio" => {
                let payload: ElementLinkAudioPayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                    crate::error::Error::Other(format!("Invalid element.linkAudio payload: {}", e))
                })?;
                self.apply_element_link_audio(&payload, base_dir)?;
                Ok(ApplyResult::Applied)
            }
            "element.unlinkAudio" => {
                let payload: ElementUnlinkAudioPayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!(
                            "Invalid element.unlinkAudio payload: {}",
                            e
                        ))
                    })?;
                self.apply_element_unlink_audio(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "track.add" => {
                let payload: TrackAddPayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!("Invalid track.add payload: {}", e))
                    })?;
                self.apply_track_add(&payload, base_dir)?;
                Ok(ApplyResult::Applied)
            }
            "track.remove" => {
                let payload: TrackRemovePayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid track.remove payload: {}", e))
                    })?;
                self.apply_track_remove(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "track.reorder" => {
                let payload: TrackReorderPayload = serde_json::from_value(op.payload.clone())
                    .map_err(|e| {
                        crate::error::Error::Other(format!("Invalid track.reorder payload: {}", e))
                    })?;
                self.apply_track_reorder(&payload)?;
                Ok(ApplyResult::Applied)
            }
            "batch" => {
                let payload: BatchPayload =
                    serde_json::from_value(op.payload.clone()).map_err(|e| {
                        crate::error::Error::Other(format!("Invalid batch payload: {}", e))
                    })?;
                self.apply_batch(&payload, base_dir)?;
                Ok(ApplyResult::Applied)
            }

            _ => Ok(ApplyResult::Unsupported),
        }
    }
}

impl Default for Timeline {
    fn default() -> Self {
        Self::new(Resolution::full_hd(), 30.0)
    }
}

/// A track contains ordered elements of the same type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Track ID
    pub id: String,
    /// Track name
    #[serde(default)]
    pub name: String,
    /// Track type
    #[serde(rename = "type")]
    pub track_type: TrackType,
    /// Elements in the track
    pub elements: Vec<Element>,
    /// Whether track is muted
    #[serde(default)]
    pub muted: bool,
    /// Whether track is locked
    #[serde(default)]
    pub locked: bool,
    /// Whether track is hidden
    #[serde(default)]
    pub hidden: bool,
    /// Whether this is the main track
    #[serde(default)]
    pub is_main: bool,
}

impl Track {
    pub fn new(id: impl Into<String>, track_type: TrackType) -> Self {
        Self {
            id: id.into(),
            name: String::new(),
            track_type,
            elements: Vec::new(),
            muted: false,
            locked: false,
            hidden: false,
            is_main: false,
        }
    }

    /// Get elements visible at a specific time
    pub fn elements_at_time(&self, time: f64) -> impl Iterator<Item = &Element> {
        self.elements.iter().filter(move |e| e.is_visible_at(time))
    }
}

/// An element is a clip on the timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Element {
    /// Element ID
    pub id: String,
    /// Element name
    #[serde(default)]
    pub name: String,
    /// Element-specific data
    #[serde(flatten)]
    pub element_type: ElementType,
    /// Start time on timeline (seconds)
    pub start_time: f64,
    /// Duration on timeline (seconds)
    pub duration: f64,
    /// Trim start (seconds into source)
    #[serde(default)]
    pub trim_start: f64,
    /// Trim end (seconds from source end)
    #[serde(default)]
    pub trim_end: f64,
    /// 2D transform
    #[serde(default)]
    pub transform: Transform,
    /// Opacity (0.0 - 1.0)
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// Blend mode
    #[serde(default)]
    pub blend_mode: BlendMode,
    /// Applied visual effects (type-keyed, mirrors TS EffectInstance)
    #[serde(default)]
    pub effects: Vec<ElementEffect>,
    /// Whether element is muted
    #[serde(default)]
    pub muted: bool,
    /// Whether element is hidden
    #[serde(default)]
    pub hidden: bool,
    /// Whether element is locked
    #[serde(default)]
    pub locked: bool,
    /// Speed properties (Phase 1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<SpeedProperties>,
    /// Transition from previous element (Phase 2)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_in: Option<TransitionEffect>,
    /// Transition to next element (Phase 2)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_out: Option<TransitionEffect>,
    /// Masks applied to this element (GPU rasterized)
    #[serde(default)]
    pub masks: Vec<ElementMask>,
    /// Composite transition info (set by TS composite path, used in composite rendering)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition: Option<CompositeTransitionInfo>,
}

fn default_opacity() -> f64 {
    1.0
}

impl Element {
    /// Get end time on timeline
    pub fn end_time(&self) -> f64 {
        self.start_time + self.duration
    }

    /// Check if element is visible at a specific time
    pub fn is_visible_at(&self, time: f64) -> bool {
        !self.hidden && time >= self.start_time && time < self.end_time()
    }

    /// Get source time for a given timeline time.
    /// Accounts for speed, reverse, and time remap when present.
    pub fn get_source_time(&self, timeline_time: f64) -> f64 {
        let relative_time = timeline_time - self.start_time;

        match &self.speed {
            Some(speed_props) => {
                // Time remap takes priority if enabled
                if let Some(ref remap) = speed_props.time_remap {
                    if remap.enabled && remap.keyframes.len() >= 2 {
                        return self.evaluate_time_remap(relative_time, remap);
                    }
                }

                // Apply constant speed factor
                let source_relative = relative_time * speed_props.speed;

                // Handle reverse playback
                if speed_props.reverse {
                    let source_duration = self.duration * speed_props.speed;
                    self.trim_start + (source_duration - source_relative)
                } else {
                    self.trim_start + source_relative
                }
            }
            None => self.trim_start + relative_time,
        }
    }

    /// Evaluate time remap keyframes to get source time.
    /// Keyframes map output_time (timeline-relative) to input_time (source-relative).
    fn evaluate_time_remap(&self, relative_time: f64, remap: &TimeRemapData) -> f64 {
        let kfs = &remap.keyframes;

        // Before first keyframe
        if relative_time <= kfs[0].output_time {
            return self.trim_start + kfs[0].input_time;
        }

        // After last keyframe
        let last = &kfs[kfs.len() - 1];
        if relative_time >= last.output_time {
            return self.trim_start + last.input_time;
        }

        // Find surrounding keyframes
        for i in 0..kfs.len() - 1 {
            let a = &kfs[i];
            let b = &kfs[i + 1];
            if relative_time >= a.output_time && relative_time < b.output_time {
                let segment_duration = b.output_time - a.output_time;
                let t = if segment_duration > 0.0 {
                    (relative_time - a.output_time) / segment_duration
                } else {
                    0.0
                };
                let eased_t = Easing::evaluate(a.easing, t);
                let source_time = a.input_time + (b.input_time - a.input_time) * eased_t;
                return self.trim_start + source_time;
            }
        }

        // Fallback
        self.trim_start + relative_time
    }

    /// Get source file path if applicable
    pub fn source_path(&self) -> Option<String> {
        match &self.element_type {
            ElementType::Media(m) => Some(m.src.clone()),
            ElementType::Audio(a) => Some(a.src.clone()),
            _ => None,
        }
    }

    /// Check if this is a media element
    pub fn is_media(&self) -> bool {
        matches!(self.element_type, ElementType::Media(_))
    }

    /// Check if this is an audio element
    pub fn is_audio(&self) -> bool {
        matches!(self.element_type, ElementType::Audio(_))
    }

    /// Check if this is a text element
    pub fn is_text(&self) -> bool {
        matches!(self.element_type, ElementType::Text(_))
    }

    /// Check if this is a shape element
    pub fn is_shape(&self) -> bool {
        matches!(self.element_type, ElementType::Shape(_))
    }

    /// Check if this is a subtitle element
    pub fn is_subtitle(&self) -> bool {
        matches!(self.element_type, ElementType::Subtitle(_))
    }

    /// Get effective volume for this element
    pub fn effective_volume(&self) -> f32 {
        match &self.element_type {
            ElementType::Media(m) => {
                if m.audio.as_ref().map(|a| a.muted).unwrap_or(false) {
                    0.0
                } else {
                    m.audio.as_ref().map(|a| a.volume as f32).unwrap_or(1.0)
                }
            }
            ElementType::Audio(a) => {
                if a.audio_settings.as_ref().map(|s| s.muted).unwrap_or(false) {
                    return 0.0;
                }
                if let Some(ref settings) = a.audio_settings {
                    settings
                        .volume
                        .as_ref()
                        .map(|v| v.base_value)
                        .unwrap_or(a.volume)
                } else {
                    a.volume
                }
            }
            _ => 1.0,
        }
    }

    /// Get effective pan for this element
    pub fn effective_pan(&self) -> f32 {
        match &self.element_type {
            ElementType::Audio(a) => {
                if let Some(ref settings) = a.audio_settings {
                    settings.pan.as_ref().map(|p| p.base_value).unwrap_or(a.pan)
                } else {
                    a.pan
                }
            }
            _ => 0.0,
        }
    }

    /// Check if audio is muted for this element
    pub fn is_audio_muted(&self) -> bool {
        self.muted
            || match &self.element_type {
                ElementType::Media(m) => m.audio.as_ref().map(|a| a.muted).unwrap_or(false),
                ElementType::Audio(a) => {
                    a.audio_settings.as_ref().map(|s| s.muted).unwrap_or(false)
                }
                _ => false,
            }
    }
}

/// Element-specific data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ElementType {
    /// Media element (video/image)
    #[serde(rename = "media")]
    Media(MediaElementData),
    /// Audio element
    #[serde(rename = "audio")]
    Audio(AudioElementData),
    /// Text element
    #[serde(rename = "text")]
    Text(TextElementData),
    /// Shape element
    #[serde(rename = "shape")]
    Shape(ShapeElementData),
    /// Subtitle element
    #[serde(rename = "subtitle")]
    Subtitle(SubtitleElementData),
}

/// Media element data (video/image)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaElementData {
    /// Source file path
    pub src: String,
    /// Resource ID (deterministic hash)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    /// Audio properties (for video with audio)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioProperties>,
    /// Media type (video/image)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    /// Linked audio element ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_audio_id: Option<String>,
    /// Volume (0.0 - 1.0) for video's embedded audio
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
}

/// Audio element data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioElementData {
    /// Source file path
    pub src: String,
    /// Resource ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
    /// Audio properties (legacy nested format)
    #[serde(default)]
    pub audio: Option<AudioProperties>,
    /// Audio settings (JVI nested format with baseValue)
    #[serde(default)]
    pub audio_settings: Option<AudioSettings>,
    /// Linked video element ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_video_id: Option<String>,
    /// Volume (0.0 - 1.0) - direct value
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
    /// Pan (-1.0 = left, 0.0 = center, 1.0 = right) - direct value
    #[serde(default)]
    pub pan: f32,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
}

fn default_volume_f32() -> f32 {
    1.0
}

/// Audio settings (JVI nested format with baseValue)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    /// Volume setting
    pub volume: Option<AudioValue>,
    /// Pan setting
    pub pan: Option<AudioValue>,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
}

/// Audio value with baseValue (JVI format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioValue {
    /// Base value
    pub base_value: f32,
}

/// Text element data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextElementData {
    /// Text content
    #[serde(default)]
    pub content: String,
    /// Font family
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Font size in pixels
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Text color (hex)
    #[serde(default = "default_color")]
    pub color: String,
    /// Background color
    #[serde(default = "default_background_color")]
    pub background_color: String,
    /// Text alignment
    #[serde(default = "default_text_align")]
    pub text_align: String,
    /// Font weight
    #[serde(default = "default_font_weight")]
    pub font_weight: String,
    /// Font style
    #[serde(default = "default_font_style")]
    pub font_style: String,
    /// Text decoration: "none" | "underline" | "line-through"
    #[serde(default = "default_text_decoration")]
    pub text_decoration: String,
    /// Line height multiplier
    #[serde(default = "default_line_height")]
    pub line_height: f32,
    /// Letter spacing in pixels
    #[serde(default)]
    pub letter_spacing: f32,
    /// Stroke color (hex)
    #[serde(default = "default_transparent")]
    pub stroke_color: String,
    /// Stroke width in pixels
    #[serde(default)]
    pub stroke_width: f32,
    /// Drop shadow
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<TextShadow>,
}

fn default_font_family() -> String {
    "Arial".to_string()
}
fn default_font_size() -> f32 {
    48.0
}
fn default_color() -> String {
    "#ffffff".to_string()
}
fn default_background_color() -> String {
    "transparent".to_string()
}
fn default_text_align() -> String {
    "center".to_string()
}
fn default_font_weight() -> String {
    "normal".to_string()
}
fn default_font_style() -> String {
    "normal".to_string()
}
fn default_text_decoration() -> String {
    "none".to_string()
}
fn default_line_height() -> f32 {
    1.2
}
fn default_transparent() -> String {
    "transparent".to_string()
}

/// Shape element data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeElementData {
    /// Shape type discriminant: "rectangle" | "ellipse" | "polygon" | "star" | "line" | "bezier"
    #[serde(default)]
    pub shape_type: String,
    /// Shape-specific geometry parameters (type-discriminated JSON object)
    #[serde(default)]
    pub shape_params: serde_json::Value,
    /// Fill properties
    #[serde(default)]
    pub fill: ShapeFillData,
    /// Stroke properties
    #[serde(default)]
    pub stroke: ShapeStrokeData,
    /// Shadow properties
    #[serde(default)]
    pub shadow: ShapeShadowData,
}

/// Gradient stop for shape fill
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeGradientStop {
    /// Position along the gradient (0.0–1.0)
    pub offset: f32,
    /// CSS color string
    pub color: String,
}

/// Gradient definition for shape fill
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeGradientData {
    /// "linear" | "radial"
    #[serde(rename = "type", default)]
    pub gradient_type: String,
    #[serde(default)]
    pub stops: Vec<ShapeGradientStop>,
    /// Angle in degrees (linear gradient)
    pub angle: Option<f32>,
    /// Center X as ratio 0–1 (radial gradient)
    pub center_x: Option<f32>,
    /// Center Y as ratio 0–1 (radial gradient)
    pub center_y: Option<f32>,
    /// Radius as ratio of min(width, height) (radial gradient)
    pub radius: Option<f32>,
}

/// Fill properties for a shape element
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeFillData {
    /// "none" | "solid" | "gradient"
    #[serde(rename = "type", default)]
    pub fill_type: String,
    /// Solid fill color (CSS hex or rgba string)
    pub color: Option<String>,
    /// Gradient definition
    pub gradient: Option<ShapeGradientData>,
    /// Fill opacity (0.0–1.0)
    #[serde(default = "default_shape_opacity")]
    pub opacity: f32,
}

/// Stroke properties for a shape element
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeStrokeData {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub color: String,
    /// Stroke width in pixels
    #[serde(default = "default_stroke_width")]
    pub width: f32,
    #[serde(default = "default_shape_opacity")]
    pub opacity: f32,
    /// "butt" | "round" | "square"
    #[serde(default = "default_line_cap")]
    pub line_cap: String,
    /// "miter" | "round" | "bevel"
    #[serde(default = "default_line_join")]
    pub line_join: String,
    #[serde(default = "default_miter_limit")]
    pub miter_limit: f32,
    #[serde(default)]
    pub dash_array: Vec<f32>,
    #[serde(default)]
    pub dash_offset: f32,
}

impl Default for ShapeStrokeData {
    fn default() -> Self {
        Self {
            enabled: false,
            color: "#000000".to_string(),
            width: default_stroke_width(),
            opacity: default_shape_opacity(),
            line_cap: default_line_cap(),
            line_join: default_line_join(),
            miter_limit: default_miter_limit(),
            dash_array: Vec::new(),
            dash_offset: 0.0,
        }
    }
}

/// Shadow properties for a shape element
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeShadowData {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub color: String,
    /// Blur radius in pixels
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
}

/// Subtitle element data
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleElementData {
    /// Subtitle text
    #[serde(default)]
    pub text: String,
    /// Font size
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Text color
    #[serde(default = "default_color")]
    pub color: String,
    /// Font family
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Background color
    #[serde(default = "default_background_color")]
    pub background_color: String,
    /// Text alignment
    #[serde(default = "default_text_align")]
    pub text_align: String,
    /// Stroke color (hex)
    #[serde(default = "default_transparent")]
    pub stroke_color: String,
    /// Stroke width in pixels
    #[serde(default)]
    pub stroke_width: f32,
    /// Drop shadow
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow: Option<TextShadow>,
}

fn default_shape_opacity() -> f32 {
    1.0
}

fn default_stroke_width() -> f32 {
    2.0
}

fn default_line_cap() -> String {
    "round".to_string()
}

fn default_line_join() -> String {
    "round".to_string()
}

fn default_miter_limit() -> f32 {
    10.0
}

/// Text shadow properties (Phase 2)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextShadow {
    /// Shadow color
    #[serde(default = "default_shadow_color")]
    pub color: String,
    /// Horizontal offset
    #[serde(default)]
    pub offset_x: f32,
    /// Vertical offset
    #[serde(default)]
    pub offset_y: f32,
    /// Blur radius
    #[serde(default)]
    pub blur: f32,
}

fn default_shadow_color() -> String {
    "rgba(0,0,0,0.5)".to_string()
}

/// Speed control properties (Phase 1)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedProperties {
    /// Playback speed (0.1 - 4.0, default: 1.0)
    /// When speed != 1.0, element.duration represents timeline duration.
    /// Source media range = duration * speed.
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// Whether playback is reversed
    #[serde(default)]
    pub reverse: bool,
    /// Whether to preserve audio pitch when changing speed
    #[serde(default = "default_true")]
    pub preserve_pitch: bool,
    /// Time remap data (for complex speed changes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_remap: Option<TimeRemapData>,
}

fn default_speed() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

/// Time remap data for variable speed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRemapData {
    /// Whether time remapping is enabled
    #[serde(default)]
    pub enabled: bool,
    /// Keyframes for time remapping
    #[serde(default)]
    pub keyframes: Vec<TimeRemapKeyframe>,
}

/// Time remap keyframe
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRemapKeyframe {
    /// Unique identifier
    pub id: String,
    /// Output time (position on timeline)
    pub output_time: f64,
    /// Input time (position in source media)
    pub input_time: f64,
    /// Easing to next keyframe
    #[serde(default)]
    pub easing: EasingType,
}

/// Transition effect (Phase 2)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionEffect {
    /// Transition type
    #[serde(default)]
    pub transition_type: String,
    /// Duration in seconds
    #[serde(default)]
    pub duration: f64,
    /// Easing function for progress
    #[serde(default)]
    pub easing: EasingType,
    /// Edge feather/softness (0.0 - 1.0)
    #[serde(default)]
    pub feather: f32,
}

/// Transition info for composite rendering path.
/// Pre-calculated by TS side with progress and paired layer index.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositeTransitionInfo {
    /// Transition type string (e.g., "fade", "wipe_left")
    #[serde(rename = "type")]
    pub transition_type: String,
    /// Pre-calculated progress (0.0 to 1.0)
    pub progress: f64,
    /// Index of the paired (incoming) layer in the composite layers array
    pub paired_layer_index: usize,
    /// Easing function name (already applied to progress by TS side)
    #[serde(default)]
    pub easing: String,
}

/// Bezier control point for mask paths
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BezierControlPoint {
    pub position: [f32; 2],
    pub handle_in: [f32; 2],
    pub handle_out: [f32; 2],
}

/// Mask shape geometry (mirrors TS CompositeMaskShape)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MaskShapeData {
    #[serde(rename = "rectangle")]
    Rectangle {
        center_x: f32,
        center_y: f32,
        width: f32,
        height: f32,
        rotation: f32,
        corner_radius: f32,
    },
    #[serde(rename = "ellipse")]
    Ellipse {
        center_x: f32,
        center_y: f32,
        width: f32,
        height: f32,
        rotation: f32,
    },
    #[serde(rename = "polygon")]
    Polygon { points: Vec<[f32; 2]> },
    #[serde(rename = "bezier")]
    Bezier {
        control_points: Vec<BezierControlPoint>,
        closed: bool,
    },
}

/// A mask applied to an element (mirrors TS CompositeMask)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementMask {
    pub shape: MaskShapeData,
    #[serde(default)]
    pub inverted: bool,
    #[serde(default)]
    pub feather: f32,
    #[serde(default)]
    pub expansion: f32,
    #[serde(default = "default_mask_opacity")]
    pub opacity: f32,
    #[serde(default)]
    pub blend_mode: String,
}

fn default_mask_opacity() -> f32 {
    1.0
}

/// Audio properties within an element
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProperties {
    /// Volume (0.0 - 1.0)
    #[serde(default = "default_volume")]
    pub volume: f64,
    /// Pan (-1.0 = left, 0.0 = center, 1.0 = right)
    #[serde(default)]
    pub pan: f64,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
    /// Fade in easing curve
    #[serde(default)]
    pub fade_in_curve: EasingType,
    /// Fade out easing curve
    #[serde(default)]
    pub fade_out_curve: EasingType,
    /// Gain adjustment in dB (-20 to +20)
    #[serde(default)]
    pub gain: f64,
}

fn default_volume() -> f64 {
    1.0
}

impl Default for AudioProperties {
    fn default() -> Self {
        Self {
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 0.0,
            fade_out: 0.0,
            fade_in_curve: EasingType::Linear,
            fade_out_curve: EasingType::Linear,
            gain: 0.0,
        }
    }
}

/// Project default settings
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<TextDefaults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<TransformDefaults>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio: Option<AudioDefaults>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDefaults {
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_color")]
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformDefaults {
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default = "default_scale")]
    pub scale_x: f32,
    #[serde(default = "default_scale")]
    pub scale_y: f32,
    #[serde(default)]
    pub rotation: f32,
}

fn default_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDefaults {
    #[serde(default = "default_volume_f32")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
}
