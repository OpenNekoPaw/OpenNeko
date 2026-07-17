//! JVI file format types - mirrors TypeScript ProjectData
//!
//! These types represent the .nkv project file format used by OpenNeko.

use serde::{Deserialize, Serialize};

/// Project data structure (.nkv file format)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    /// File format version
    pub version: String,
    /// Project name
    pub name: String,
    /// Output resolution
    pub resolution: Resolution,
    /// Frame rate
    pub fps: f64,
    /// Timeline tracks
    pub tracks: Vec<JviTrack>,
    /// Default settings
    #[serde(default)]
    pub defaults: Option<ProjectDefaults>,
}

/// Resolution settings
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

/// Project default settings
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDefaults {
    #[serde(default)]
    pub text: Option<TextDefaults>,
    #[serde(default)]
    pub transform: Option<TransformDefaults>,
    #[serde(default)]
    pub audio: Option<AudioDefaults>,
}

/// Default text settings
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDefaults {
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_background_color")]
    pub background_color: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    #[serde(default = "default_font_weight")]
    pub font_weight: String,
    #[serde(default = "default_font_style")]
    pub font_style: String,
    #[serde(default = "default_text_decoration")]
    pub text_decoration: String,
}

/// Default transform settings
#[derive(Debug, Clone, Deserialize, Serialize)]
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
    #[serde(default = "default_opacity")]
    pub opacity: f32,
}

/// Default audio settings
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDefaults {
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub gain: f32,
}

/// JVI Track (mirrors TypeScript TimelineTrack)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviTrack {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub track_type: String,
    pub elements: Vec<JviElement>,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub is_main: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default)]
    pub hidden: bool,
}

/// JVI Element (union type, uses tag-based deserialization)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum JviElement {
    /// Media element (video/image)
    #[serde(rename = "media")]
    Media(JviMediaElement),
    /// Audio element
    #[serde(rename = "audio")]
    Audio(JviAudioElement),
    /// Text element
    #[serde(rename = "text")]
    Text(JviTextElement),
    /// Shape element
    #[serde(rename = "shape")]
    Shape(JviShapeElement),
    /// Subtitle element
    #[serde(rename = "subtitle")]
    Subtitle(JviSubtitleElement),
}

/// Media element data (video/image)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviMediaElement {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Relative path to media file
    pub src: String,
    pub duration: f64,
    pub start_time: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default)]
    pub trim_end: f64,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub transform: Option<JviTransform>,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    #[serde(default)]
    pub blend_mode: Option<String>,
    #[serde(default)]
    pub audio: Option<JviAudioProperties>,
    #[serde(default)]
    pub linked_audio_id: Option<String>,
    #[serde(default)]
    pub media_type: Option<String>,
    /// Visual effects applied to this element
    #[serde(default)]
    pub effects: Vec<neko_engine_types::ElementEffect>,
}

/// Audio element data
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviAudioElement {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub src: String,
    pub duration: f64,
    pub start_time: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default)]
    pub trim_end: f64,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub audio: Option<JviAudioProperties>,
    #[serde(default)]
    pub linked_video_id: Option<String>,
}

/// Text element data
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviTextElement {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub content: String,
    pub duration: f64,
    pub start_time: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default)]
    pub trim_end: f64,
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_background_color")]
    pub background_color: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    #[serde(default = "default_font_weight")]
    pub font_weight: String,
    #[serde(default = "default_font_style")]
    pub font_style: String,
    #[serde(default = "default_text_decoration")]
    pub text_decoration: String,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// Visual effects applied to this element
    #[serde(default)]
    pub effects: Vec<neko_engine_types::ElementEffect>,
}

/// Shape element data
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviShapeElement {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub duration: f64,
    pub start_time: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default)]
    pub trim_end: f64,
    /// Visual effects applied to this element
    #[serde(default)]
    pub effects: Vec<neko_engine_types::ElementEffect>,
}

/// Subtitle element data
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviSubtitleElement {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub duration: f64,
    pub start_time: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default)]
    pub trim_end: f64,
}

/// Transform properties
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviTransform {
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
    #[serde(default)]
    pub anchor_x: f32,
    #[serde(default)]
    pub anchor_y: f32,
}

/// Audio properties
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JviAudioProperties {
    #[serde(
        default = "default_volume",
        deserialize_with = "deserialize_animatable_value"
    )]
    pub volume: f32,
    #[serde(default, deserialize_with = "deserialize_animatable_value")]
    pub pan: f32,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub muted: bool,
}

/// Custom deserializer for animatable values
fn deserialize_animatable_value<'de, D>(deserializer: D) -> Result<f32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;

    let value = serde_json::Value::deserialize(deserializer)?;

    match value {
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(|v| v as f32)
            .ok_or_else(|| D::Error::custom("Invalid number")),
        serde_json::Value::Object(obj) => {
            // Try to get baseValue (camelCase)
            if let Some(base) = obj.get("baseValue") {
                if let Some(n) = base.as_f64() {
                    return Ok(n as f32);
                }
            }
            // Try to get base_value (snake_case)
            if let Some(base) = obj.get("base_value") {
                if let Some(n) = base.as_f64() {
                    return Ok(n as f32);
                }
            }
            Err(D::Error::custom(
                "Object must have baseValue or base_value field",
            ))
        }
        serde_json::Value::Null => Ok(1.0), // Default value
        _ => Err(D::Error::custom("Expected number or object with baseValue")),
    }
}

// Default value functions
fn default_opacity() -> f32 {
    1.0
}
fn default_scale() -> f32 {
    1.0
}
fn default_volume() -> f32 {
    1.0
}
fn default_font_size() -> f32 {
    48.0
}
fn default_font_family() -> String {
    "Arial".to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_project_data() {
        let json = r#"{
            "version": "1.0",
            "name": "test",
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "tracks": []
        }"#;

        let project: ProjectData = serde_json::from_str(json).unwrap();
        assert_eq!(project.version, "1.0");
        assert_eq!(project.name, "test");
        assert_eq!(project.resolution.width, 1920);
        assert_eq!(project.resolution.height, 1080);
        assert_eq!(project.fps, 30.0);
    }

    #[test]
    fn test_parse_media_element() {
        let json = r#"{
            "type": "media",
            "id": "test-id",
            "name": "test.mp4",
            "src": "test.mp4",
            "duration": 10.0,
            "startTime": 0.0
        }"#;

        let element: JviElement = serde_json::from_str(json).unwrap();
        match element {
            JviElement::Media(media) => {
                assert_eq!(media.id, "test-id");
                assert_eq!(media.src, "test.mp4");
                assert_eq!(media.duration, 10.0);
            }
            _ => panic!("Expected Media element"),
        }
    }
}
