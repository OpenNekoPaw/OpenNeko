//! Read-only `.nka` loader for audio project export.
//!
//! The CLI maps supported `.nka` metadata into Engine `MixdownConfig`.
//! It does not edit, migrate, or save audio project documents.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use neko_engine_types::project_context::{ProjectContext, ResolvedPath};
use neko_engine_types::AudioEffectConfig;
use neko_engine_types::SUPPORTED_AUDIO_EFFECT_TYPES;
use neko_host_api::{MixdownConfig, MixdownElement, MixdownTrack};
use serde::Deserialize;
use serde_json::Value;

pub const SUPPORTED_NKA_VERSION: &str = "2.1";

#[derive(Debug, Clone)]
pub struct NkaLoadResult {
    pub config: MixdownConfig,
}

pub struct NkaLoader;

impl NkaLoader {
    pub fn new() -> Self {
        Self
    }

    pub fn load<P: AsRef<Path>>(
        &self,
        path: P,
    ) -> Result<NkaLoadResult, Box<dyn std::error::Error + Send + Sync>> {
        let path = path.as_ref();
        let content = fs::read_to_string(path)?;
        let project: NkaProject = serde_json::from_str(&content)?;
        let project_dir = path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        self.load_project(project, ProjectContext::new(project_dir))
    }

    pub(crate) fn load_project(
        &self,
        project: NkaProject,
        context: ProjectContext,
    ) -> Result<NkaLoadResult, Box<dyn std::error::Error + Send + Sync>> {
        if project.version != SUPPORTED_NKA_VERSION {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "Unsupported .nka version {}. Please upgrade this project in VSCode before CLI export.",
                    project.version
                ),
            )));
        }

        let tracks = project
            .tracks
            .iter()
            .map(|track| to_mixdown_track(track, &project.track_mix, &context))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(NkaLoadResult {
            config: MixdownConfig {
                tracks,
                master_effects: project
                    .master_effects_chain
                    .into_iter()
                    .filter_map(to_master_effect_config)
                    .collect(),
                master_volume: project.master_volume.unwrap_or(1.0),
                sample_rate: project.sample_rate,
                channels: project.channels,
            },
        })
    }
}

fn to_mixdown_track(
    track: &NkaTrack,
    track_mix: &HashMap<String, NkaTrackMixState>,
    context: &ProjectContext,
) -> Result<MixdownTrack, Box<dyn std::error::Error + Send + Sync>> {
    let mix = track_mix.get(&track.id);
    let effect_chain = match mix {
        Some(state) => state
            .effect_chain
            .iter()
            .filter_map(normalize_audio_effect_config)
            .collect(),
        None => Vec::new(),
    };
    Ok(MixdownTrack {
        id: track.id.clone(),
        muted: track.muted,
        solo: mix.map(|state| state.solo).unwrap_or(false),
        volume: mix.map(|state| state.volume).unwrap_or(1.0),
        pan: mix.map(|state| state.pan).unwrap_or(0.0),
        effect_chain,
        automation: Vec::new(),
        elements: track
            .elements
            .iter()
            .filter(|element| element.element_type == "audio")
            .map(|element| to_mixdown_element(element, context))
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn to_mixdown_element(
    element: &NkaElement,
    context: &ProjectContext,
) -> Result<MixdownElement, Box<dyn std::error::Error + Send + Sync>> {
    let src = element.src.as_ref().ok_or_else(|| {
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Audio element {} is missing src", element.id),
        )) as Box<dyn std::error::Error + Send + Sync>
    })?;

    Ok(MixdownElement {
        id: element.id.clone(),
        src: resolve_source_path(src, context)?,
        start_time: element.start_time,
        duration: element.duration,
        trim_start: element.trim_start,
        volume: element
            .volume
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.volume))
            .unwrap_or(1.0),
        pan: element
            .pan
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.pan))
            .unwrap_or(0.0),
        muted: element
            .muted
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.muted))
            .unwrap_or(false),
        fade_in: element
            .fade_in
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.fade_in))
            .unwrap_or(0.0),
        fade_out: element
            .fade_out
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.fade_out))
            .unwrap_or(0.0),
        gain: element
            .gain
            .or_else(|| element.audio.as_ref().and_then(|audio| audio.gain))
            .unwrap_or(0.0),
    })
}

fn resolve_source_path(
    src: &str,
    context: &ProjectContext,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    match context.resolve(src) {
        Ok(ResolvedPath::Local(path)) => Ok(path.to_string_lossy().to_string()),
        Ok(ResolvedPath::Remote(url)) => Ok(url),
        Err(error) => Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            error,
        ))),
    }
}

fn to_master_effect_config(effect: NkaMasterEffect) -> Option<AudioEffectConfig> {
    let effect_type = normalize_renderable_effect_type(&effect.effect_type)?;
    Some(AudioEffectConfig {
        id: effect.id,
        effect_type,
        enabled: effect.enabled,
        params: effect.params,
    })
}

fn normalize_audio_effect_config(effect: &AudioEffectConfig) -> Option<AudioEffectConfig> {
    let effect_type = normalize_renderable_effect_type(&effect.effect_type)?;
    Some(AudioEffectConfig {
        effect_type,
        ..effect.clone()
    })
}

fn normalize_renderable_effect_type(value: &str) -> Option<String> {
    let canonical = match value {
        "highpass" => "high-pass",
        "lowpass" => "low-pass",
        "bandpass" => "band-pass",
        "eq" => "parametric-eq",
        "gate" => "noise-gate",
        other => other,
    };

    SUPPORTED_AUDIO_EFFECT_TYPES
        .contains(&canonical)
        .then(|| canonical.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NkaProject {
    version: String,
    sample_rate: u32,
    channels: u16,
    tracks: Vec<NkaTrack>,
    #[serde(default)]
    master_effects_chain: Vec<NkaMasterEffect>,
    #[serde(default)]
    track_mix: HashMap<String, NkaTrackMixState>,
    master_volume: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NkaTrack {
    id: String,
    #[serde(default)]
    muted: bool,
    #[serde(default)]
    elements: Vec<NkaElement>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NkaElement {
    id: String,
    #[serde(rename = "type")]
    element_type: String,
    src: Option<String>,
    start_time: f64,
    duration: f64,
    #[serde(default)]
    trim_start: f64,
    #[serde(default)]
    volume: Option<f32>,
    #[serde(default)]
    pan: Option<f32>,
    #[serde(default)]
    muted: Option<bool>,
    #[serde(default)]
    fade_in: Option<f64>,
    #[serde(default)]
    fade_out: Option<f64>,
    #[serde(default)]
    gain: Option<f64>,
    #[serde(default)]
    audio: Option<NkaElementAudio>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NkaElementAudio {
    #[serde(default)]
    volume: Option<f32>,
    #[serde(default)]
    pan: Option<f32>,
    #[serde(default)]
    muted: Option<bool>,
    #[serde(default)]
    fade_in: Option<f64>,
    #[serde(default)]
    fade_out: Option<f64>,
    #[serde(default)]
    gain: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NkaTrackMixState {
    #[serde(default = "default_volume")]
    volume: f32,
    #[serde(default)]
    pan: f32,
    #[serde(default)]
    solo: bool,
    #[serde(default)]
    effect_chain: Vec<AudioEffectConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NkaMasterEffect {
    id: String,
    #[serde(rename = "type")]
    effect_type: String,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    params: Value,
}

fn default_volume() -> f32 {
    1.0
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn load_fixture() -> NkaProject {
        serde_json::from_value(json!({
            "version": "2.1",
            "name": "CLI Fixture",
            "sampleRate": 48000,
            "channels": 2,
            "tracks": [
                {
                    "id": "voice",
                    "name": "Voice",
                    "type": "audio",
                    "muted": false,
                    "locked": false,
                    "hidden": false,
                    "isMain": true,
                    "elements": [
                        {
                            "id": "clip-a",
                            "type": "audio",
                            "name": "clip-a",
                            "src": "audio/voice.wav",
                            "startTime": 1.5,
                            "duration": 4.0,
                            "trimStart": 0.25,
                            "opacity": 1,
                            "muted": false,
                            "hidden": false,
                            "locked": false,
                            "audio": {
                                "volume": 0.8,
                                "pan": -0.2,
                                "fadeIn": 0.1,
                                "fadeOut": 0.3,
                                "gain": 1.5
                            }
                        }
                    ]
                },
                {
                    "id": "music",
                    "name": "Music",
                    "type": "audio",
                    "muted": true,
                    "locked": false,
                    "hidden": false,
                    "isMain": false,
                    "elements": [
                        {
                            "id": "clip-b",
                            "type": "audio",
                            "name": "clip-b",
                            "src": "${MEDIA}/bed.wav",
                            "startTime": 0,
                            "duration": 8.0,
                            "trimStart": 0,
                            "opacity": 1,
                            "muted": false,
                            "hidden": false,
                            "locked": false,
                            "volume": 0.5,
                            "pan": 0.1
                        }
                    ]
                }
            ],
            "trackMix": {
                "voice": {
                    "volume": 0.75,
                    "pan": 0.25,
                    "solo": true,
                    "effectChain": [
                        {
                            "id": "voice-gate",
                            "effectType": "noise-gate",
                            "enabled": true,
                            "params": { "threshold": -42 }
                        }
                    ]
                }
            },
            "masterEffectsChain": [
                {
                    "id": "master-eq",
                    "type": "parametric-eq",
                    "name": "Master EQ",
                    "enabled": true,
                    "params": { "bands": [] }
                }
            ],
            "markers": [],
            "masterVolume": 0.9
        }))
        .unwrap()
    }

    #[test]
    fn maps_current_nka_to_mixdown_config() {
        let mut context = ProjectContext::new(PathBuf::from("/project"));
        context
            .variables
            .insert("MEDIA".to_string(), "/media/library".to_string());

        let result = NkaLoader::new()
            .load_project(load_fixture(), context)
            .unwrap();

        assert_eq!(result.config.sample_rate, 48000);
        assert_eq!(result.config.channels, 2);
        assert_eq!(result.config.master_volume, 0.9);
        assert_eq!(result.config.master_effects[0].effect_type, "parametric-eq");
        assert_eq!(result.config.tracks.len(), 2);

        let voice = &result.config.tracks[0];
        assert_eq!(voice.id, "voice");
        assert_eq!(voice.volume, 0.75);
        assert_eq!(voice.pan, 0.25);
        assert!(voice.solo);
        assert_eq!(voice.effect_chain[0].effect_type, "noise-gate");
        assert_eq!(voice.elements[0].src, "/project/audio/voice.wav");
        assert_eq!(voice.elements[0].start_time, 1.5);
        assert_eq!(voice.elements[0].trim_start, 0.25);
        assert_eq!(voice.elements[0].volume, 0.8);
        assert_eq!(voice.elements[0].pan, -0.2);
        assert_eq!(voice.elements[0].fade_in, 0.1);
        assert_eq!(voice.elements[0].fade_out, 0.3);
        assert_eq!(voice.elements[0].gain, 1.5);

        let music = &result.config.tracks[1];
        assert!(music.muted);
        assert_eq!(music.volume, 1.0);
        assert_eq!(music.elements[0].src, "/media/library/bed.wav");
        assert_eq!(music.elements[0].volume, 0.5);
        assert_eq!(music.elements[0].pan, 0.1);
    }

    #[test]
    fn rejects_unsupported_nka_version() {
        let mut project = load_fixture();
        project.version = "2.2".to_string();

        let error = NkaLoader::new()
            .load_project(project, ProjectContext::new(PathBuf::from("/project")))
            .unwrap_err();

        assert!(error.to_string().contains("upgrade this project in VSCode"));
    }

    #[test]
    fn rejects_unknown_path_variables() {
        let error = NkaLoader::new()
            .load_project(
                load_fixture(),
                ProjectContext::new(PathBuf::from("/project")),
            )
            .unwrap_err();

        assert!(error.to_string().contains("Unknown variable: MEDIA"));
    }

    #[test]
    fn normalizes_legacy_effect_aliases() {
        assert_eq!(
            normalize_renderable_effect_type("highpass").as_deref(),
            Some("high-pass")
        );
        assert_eq!(
            normalize_renderable_effect_type("lowpass").as_deref(),
            Some("low-pass")
        );
        assert_eq!(
            normalize_renderable_effect_type("bandpass").as_deref(),
            Some("band-pass")
        );
        assert_eq!(
            normalize_renderable_effect_type("eq").as_deref(),
            Some("parametric-eq")
        );
        assert_eq!(
            normalize_renderable_effect_type("gate").as_deref(),
            Some("noise-gate")
        );

        let mut project = load_fixture();
        project.master_effects_chain[0].effect_type = "eq".to_string();
        project.track_mix.get_mut("voice").unwrap().effect_chain[0].effect_type =
            "gate".to_string();

        let mut context = ProjectContext::new(PathBuf::from("/project"));
        context
            .variables
            .insert("MEDIA".to_string(), "/media/library".to_string());

        let result = NkaLoader::new().load_project(project, context).unwrap();

        assert_eq!(result.config.master_effects[0].effect_type, "parametric-eq");
        assert_eq!(
            result.config.tracks[0].effect_chain[0].effect_type,
            "noise-gate"
        );
    }
}
