//! JVI project loader and ProjectData to Timeline converter
//!
//! `runtime-media` owns raw JVI/NKV file parsing. Kernel owns conversion into
//! Timeline and ExportSettings because those are service-domain models.

use std::path::{Path, PathBuf};

use crate::domain::{
    AudioElementData, AudioProperties, Element, ElementType, MediaElementData, ShapeElementData,
    SubtitleElementData, TextElementData, Timeline, Track, Transform,
};
use crate::error::Result;
use crate::export::{
    ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportSettings, ExportVideoCodec,
};
use neko_engine_types::{BlendMode, Resolution, TrackType};
use neko_runtime_media::{JviElement, JviProjectLoader, JviTrack, ProjectData};

/// Host-compatible JVI file loader.
pub struct JviLoader;

impl JviLoader {
    /// Create a new JVI loader.
    pub fn new() -> Self {
        Self
    }

    /// Load a .nkv file and convert it to Timeline + ExportSettings.
    pub fn load(&self, path: &Path) -> Result<(Timeline, ExportSettings)> {
        let project = JviProjectLoader::new().load(path)?;
        let base_dir = path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        ProjectConverter::new(base_dir).convert(project)
    }

    /// Load a JVI JSON string and convert it to Timeline + ExportSettings.
    pub fn load_from_json(
        &self,
        json: &str,
        base_dir: PathBuf,
    ) -> Result<(Timeline, ExportSettings)> {
        let project = JviProjectLoader::new().load_from_json(json)?;
        ProjectConverter::new(base_dir).convert(project)
    }
}

impl Default for JviLoader {
    fn default() -> Self {
        Self::new()
    }
}

/// Converter from ProjectData to Timeline
pub struct ProjectConverter {
    /// Base directory for resolving relative paths
    base_dir: PathBuf,
}

impl ProjectConverter {
    /// Create a new converter with the given base directory
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    /// Convert ProjectData to Timeline and ExportSettings
    pub fn convert(&self, project: ProjectData) -> Result<(Timeline, ExportSettings)> {
        // Calculate timeline duration from tracks
        let duration = self.calculate_duration(&project.tracks);

        // Convert tracks
        let tracks = project
            .tracks
            .into_iter()
            .map(|track| self.convert_track(track))
            .collect::<Result<Vec<_>>>()?;

        let resolution = Resolution {
            width: project.resolution.width,
            height: project.resolution.height,
        };

        let mut timeline = Timeline::new(resolution, project.fps);
        timeline.duration = duration;
        timeline.tracks = tracks;

        // Create export settings from project
        let settings = ExportSettings {
            width: project.resolution.width,
            height: project.resolution.height,
            fps: project.fps,
            video_codec: ExportVideoCodec::H264,
            video_bitrate: Some(5_000_000), // 5 Mbps default
            audio_codec: ExportAudioCodec::Aac,
            audio_bitrate: Some(128_000), // 128 kbps default
            audio_sample_rate: 48_000,
            hw_encoder: ExportHwEncoder::Auto,
            time_range: None,
            preset: ExportPreset::Medium,
            use_zero_copy_gpu: false,
        };

        Ok((timeline, settings))
    }

    /// Calculate total duration from tracks
    fn calculate_duration(&self, tracks: &[JviTrack]) -> f64 {
        let mut max_end_time = 0.0;

        for track in tracks {
            for element in &track.elements {
                let end_time = match element {
                    JviElement::Media(m) => m.start_time + m.duration,
                    JviElement::Audio(a) => a.start_time + a.duration,
                    JviElement::Text(t) => t.start_time + t.duration,
                    JviElement::Shape(s) => s.start_time + s.duration,
                    JviElement::Subtitle(s) => s.start_time + s.duration,
                };

                if end_time > max_end_time {
                    max_end_time = end_time;
                }
            }
        }

        max_end_time
    }

    /// Convert a JVI track to domain Track
    fn convert_track(&self, track: JviTrack) -> Result<Track> {
        let track_type = match track.track_type.as_str() {
            "media" => TrackType::Video,
            "audio" => TrackType::Audio,
            "text" => TrackType::Text,
            "shape" | "subtitle" => TrackType::Effect,
            _ => TrackType::Video,
        };

        let elements = track
            .elements
            .into_iter()
            .filter_map(|element| self.convert_element(element).ok())
            .collect();

        let mut t = Track::new(track.id, track_type);
        t.name = track.name;
        t.elements = elements;
        t.muted = track.muted;
        t.locked = track.locked;
        t.hidden = track.hidden;
        t.is_main = track.is_main;

        Ok(t)
    }

    /// Convert a JVI element to domain Element
    fn convert_element(&self, jvi_element: JviElement) -> Result<Element> {
        match jvi_element {
            JviElement::Media(media) => {
                let src = self.resolve_path(&media.src);

                let transform = media
                    .transform
                    .map(|t| Transform {
                        x: t.x,
                        y: t.y,
                        scale_x: t.scale_x,
                        scale_y: t.scale_y,
                        rotation: t.rotation,
                        anchor_x: t.anchor_x,
                        anchor_y: t.anchor_y,
                    })
                    .unwrap_or_default();

                let volume = if let Some(ref audio) = media.audio {
                    audio.volume
                } else {
                    1.0
                };

                let blend_mode = media
                    .blend_mode
                    .as_deref()
                    .map(BlendMode::from_name)
                    .unwrap_or(BlendMode::Normal);

                let audio_props = media.audio.map(|a| AudioProperties {
                    volume: a.volume as f64,
                    pan: a.pan as f64,
                    muted: media.muted,
                    fade_in: a.fade_in,
                    fade_out: a.fade_out,
                    ..Default::default()
                });

                Ok(Element {
                    id: media.id,
                    name: media.name,
                    element_type: ElementType::Media(MediaElementData {
                        src,
                        resource_id: None,
                        audio: audio_props,
                        media_type: media.media_type,
                        linked_audio_id: media.linked_audio_id,
                        volume,
                    }),
                    start_time: media.start_time,
                    duration: media.duration,
                    trim_start: media.trim_start,
                    trim_end: media.trim_end,
                    transform,
                    opacity: media.opacity as f64,
                    blend_mode,
                    effects: media.effects,
                    masks: Vec::new(),
                    muted: media.muted,
                    hidden: media.hidden,
                    locked: media.locked,
                    speed: None,
                    transition_in: None,
                    transition_out: None,
                    transition: None,
                })
            }
            JviElement::Audio(audio) => {
                let src = self.resolve_path(&audio.src);

                let (volume, pan, fade_in, fade_out) = if let Some(ref props) = audio.audio {
                    (props.volume, props.pan, props.fade_in, props.fade_out)
                } else {
                    (1.0, 0.0, 0.0, 0.0)
                };

                Ok(Element {
                    id: audio.id,
                    name: audio.name,
                    element_type: ElementType::Audio(AudioElementData {
                        src,
                        resource_id: None,
                        audio: None,
                        audio_settings: None,
                        linked_video_id: audio.linked_video_id,
                        volume,
                        pan,
                        fade_in,
                        fade_out,
                    }),
                    start_time: audio.start_time,
                    duration: audio.duration,
                    trim_start: audio.trim_start,
                    trim_end: audio.trim_end,
                    transform: Transform::default(),
                    opacity: 1.0,
                    blend_mode: BlendMode::Normal,
                    effects: Vec::new(),
                    masks: Vec::new(),
                    muted: audio.muted,
                    hidden: false,
                    locked: false,
                    speed: None,
                    transition_in: None,
                    transition_out: None,
                    transition: None,
                })
            }
            JviElement::Text(text) => {
                let transform = Transform {
                    x: text.x,
                    y: text.y,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation: text.rotation,
                    anchor_x: 0.5,
                    anchor_y: 0.5,
                };

                Ok(Element {
                    id: text.id,
                    name: text.name,
                    element_type: ElementType::Text(TextElementData {
                        content: text.content,
                        font_family: text.font_family,
                        font_size: text.font_size,
                        color: text.color,
                        background_color: "transparent".to_string(),
                        text_align: "center".to_string(),
                        font_weight: "normal".to_string(),
                        font_style: "normal".to_string(),
                        text_decoration: "none".to_string(),
                        line_height: 1.2,
                        letter_spacing: 0.0,
                        stroke_color: "transparent".to_string(),
                        stroke_width: 0.0,
                        shadow: None,
                    }),
                    start_time: text.start_time,
                    duration: text.duration,
                    trim_start: 0.0,
                    trim_end: 0.0,
                    transform,
                    opacity: text.opacity as f64,
                    blend_mode: BlendMode::Normal,
                    effects: text.effects,
                    masks: Vec::new(),
                    muted: false,
                    hidden: false,
                    locked: false,
                    speed: None,
                    transition_in: None,
                    transition_out: None,
                    transition: None,
                })
            }
            JviElement::Shape(shape) => Ok(Element {
                id: shape.id,
                name: shape.name,
                element_type: ElementType::Shape(ShapeElementData::default()),
                start_time: shape.start_time,
                duration: shape.duration,
                trim_start: shape.trim_start,
                trim_end: shape.trim_end,
                transform: Transform::default(),
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                effects: shape.effects,
                masks: Vec::new(),
                muted: false,
                hidden: false,
                locked: false,
                speed: None,
                transition_in: None,
                transition_out: None,
                transition: None,
            }),
            JviElement::Subtitle(sub) => Ok(Element {
                id: sub.id,
                name: sub.name,
                element_type: ElementType::Subtitle(SubtitleElementData::default()),
                start_time: sub.start_time,
                duration: sub.duration,
                trim_start: sub.trim_start,
                trim_end: sub.trim_end,
                transform: Transform::default(),
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                effects: Vec::new(),
                masks: Vec::new(),
                muted: false,
                hidden: false,
                locked: false,
                speed: None,
                transition_in: None,
                transition_out: None,
                transition: None,
            }),
        }
    }

    /// Resolve a relative path to an absolute path
    fn resolve_path(&self, relative_path: &str) -> String {
        if std::path::Path::new(relative_path).is_absolute() {
            relative_path.to_string()
        } else {
            self.base_dir
                .join(relative_path)
                .to_string_lossy()
                .to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_runtime_media::{JviMediaElement, Resolution as JviResolution};

    #[test]
    fn test_convert_project() {
        let project = ProjectData {
            version: "1.0".to_string(),
            name: "test".to_string(),
            resolution: JviResolution {
                width: 1920,
                height: 1080,
            },
            fps: 30.0,
            tracks: vec![JviTrack {
                id: "track-1".to_string(),
                name: "Main Track".to_string(),
                track_type: "media".to_string(),
                elements: vec![JviElement::Media(JviMediaElement {
                    id: "elem-1".to_string(),
                    name: "test.mp4".to_string(),
                    src: "test.mp4".to_string(),
                    duration: 10.0,
                    start_time: 0.0,
                    trim_start: 0.0,
                    trim_end: 0.0,
                    muted: false,
                    hidden: false,
                    locked: false,
                    transform: None,
                    opacity: 1.0,
                    blend_mode: None,
                    audio: None,
                    linked_audio_id: None,
                    media_type: Some("video".to_string()),
                    effects: Vec::new(),
                })],
                muted: false,
                is_main: true,
                locked: false,
                solo: false,
                hidden: false,
            }],
            defaults: None,
        };

        let converter = ProjectConverter::new(PathBuf::from("/project"));
        let result = converter.convert(project);

        assert!(result.is_ok());
        let (timeline, settings) = result.unwrap();

        assert_eq!(timeline.duration, 10.0);
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].elements.len(), 1);
        assert_eq!(settings.width, 1920);
        assert_eq!(settings.height, 1080);
        assert_eq!(settings.fps, 30.0);
    }

    #[test]
    fn test_resolve_path() {
        let converter = ProjectConverter::new(PathBuf::from("/project/assets"));

        // Relative path
        let resolved = converter.resolve_path("video.mp4");
        assert_eq!(resolved, "/project/assets/video.mp4");

        // Absolute path
        let resolved = converter.resolve_path("/absolute/path/video.mp4");
        assert_eq!(resolved, "/absolute/path/video.mp4");
    }
}
