//! Queryable effect capability registry.

use neko_engine_types::{
    EffectCapability, EffectKind, EffectSource, ParamDef, ParamOption, SUPPORTED_AUDIO_EFFECT_TYPES,
};
use std::collections::HashMap;
use std::sync::RwLock;

/// Registry for built-in and user-provided effect capability metadata.
pub struct EffectRegistry {
    capabilities: RwLock<HashMap<String, EffectCapability>>,
}

impl EffectRegistry {
    /// Create a registry populated with engine built-ins.
    pub fn with_builtins() -> Self {
        let registry = Self {
            capabilities: RwLock::new(HashMap::new()),
        };
        registry.register_builtins();
        registry
    }

    /// Register or replace one capability.
    pub fn register(&self, capability: EffectCapability) {
        let mut capabilities = self.capabilities.write().unwrap_or_else(|e| e.into_inner());
        capabilities.insert(capability.id.clone(), capability);
    }

    /// Register a set of capabilities.
    pub fn register_many(&self, capabilities: impl IntoIterator<Item = EffectCapability>) {
        let mut existing = self.capabilities.write().unwrap_or_else(|e| e.into_inner());
        for capability in capabilities {
            existing.insert(capability.id.clone(), capability);
        }
    }

    /// Remove all capabilities provided by one source id.
    pub fn unregister_source(&self, source_id: &str) {
        let mut capabilities = self.capabilities.write().unwrap_or_else(|e| e.into_inner());
        capabilities.retain(|_, capability| capability.source_id.as_deref() != Some(source_id));
    }

    /// Return all capabilities sorted by kind/source/id for deterministic clients.
    pub fn list_capabilities(&self) -> Vec<EffectCapability> {
        let capabilities = self.capabilities.read().unwrap_or_else(|e| e.into_inner());
        let mut values: Vec<_> = capabilities.values().cloned().collect();
        values.sort_by(|a, b| {
            format!("{:?}:{:?}:{}", a.kind, a.source, a.id)
                .cmp(&format!("{:?}:{:?}:{}", b.kind, b.source, b.id))
        });
        values
    }

    /// Resolve one registered capability by id.
    pub fn get_capability(&self, id: &str) -> Option<EffectCapability> {
        let capabilities = self.capabilities.read().unwrap_or_else(|e| e.into_inner());
        capabilities.get(id).cloned()
    }

    /// Resolve a registered two-input transition capability with normalized progress.
    pub fn resolve_transition(&self, id: &str, progress: f32) -> Option<ResolvedTransitionEffect> {
        let capability = self.get_capability(id)?;
        if capability.kind != EffectKind::Transition {
            return None;
        }
        Some(ResolvedTransitionEffect {
            capability,
            progress: normalize_transition_progress(progress),
        })
    }

    fn register_builtins(&self) {
        self.register_many(builtin_shader_capabilities());
        self.register_many(builtin_transition_capabilities());
        self.register_many(builtin_audio_capabilities());
    }
}

impl Default for EffectRegistry {
    fn default() -> Self {
        Self::with_builtins()
    }
}

fn builtin_shader_capabilities() -> Vec<EffectCapability> {
    vec![
        shader_capability(
            "gaussian-blur",
            "Gaussian Blur",
            "effects.gaussianBlur",
            "blur",
            vec![number_param(
                "radius",
                10.0,
                0.0,
                100.0,
                Some(0.1),
                Some("px"),
            )],
        ),
        shader_capability(
            "motion-blur",
            "Motion Blur",
            "effects.motionBlur",
            "blur",
            vec![
                number_param("angle", 0.0, 0.0, 360.0, Some(1.0), Some("deg")),
                number_param("distance", 20.0, 0.0, 100.0, Some(1.0), Some("px")),
            ],
        ),
        shader_capability(
            "radial-blur",
            "Radial Blur",
            "effects.radialBlur",
            "blur",
            vec![
                number_param("centerX", 50.0, 0.0, 100.0, Some(1.0), Some("%")),
                number_param("centerY", 50.0, 0.0, 100.0, Some(1.0), Some("%")),
                number_param("amount", 20.0, 0.0, 100.0, Some(1.0), None),
                select_param(
                    "type",
                    "zoom",
                    vec![
                        ("spin", "effects.params.blurTypeSpin"),
                        ("zoom", "effects.params.blurTypeZoom"),
                    ],
                ),
            ],
        ),
        shader_capability(
            "sharpen",
            "Sharpen",
            "effects.sharpen",
            "sharpen",
            vec![
                number_param("amount", 50.0, 0.0, 100.0, Some(1.0), None),
                number_param("radius", 1.0, 0.1, 10.0, Some(0.1), Some("px")),
                number_param("threshold", 0.0, 0.0, 255.0, Some(1.0), None),
            ],
        ),
        shader_capability(
            "noise",
            "Noise",
            "effects.noise",
            "stylize",
            vec![
                number_param("amount", 10.0, 0.0, 100.0, Some(1.0), None),
                select_param(
                    "type",
                    "gaussian",
                    vec![
                        ("uniform", "effects.params.noiseUniform"),
                        ("gaussian", "effects.params.noiseGaussian"),
                        ("film", "effects.params.noiseFilm"),
                    ],
                ),
                bool_param("colorNoise", false),
            ],
        ),
        shader_capability(
            "glow",
            "Glow",
            "effects.glow",
            "stylize",
            vec![
                number_param("radius", 20.0, 0.0, 100.0, Some(1.0), Some("px")),
                number_param("intensity", 50.0, 0.0, 100.0, Some(1.0), None),
                number_param("threshold", 128.0, 0.0, 255.0, Some(1.0), None),
                color_param("color", "#ffffff"),
            ],
        ),
        shader_capability(
            "vignette",
            "Vignette",
            "effects.vignette",
            "stylize",
            vec![
                number_param("amount", 50.0, 0.0, 100.0, Some(1.0), None),
                number_param("softness", 50.0, 0.0, 100.0, Some(1.0), None),
                number_param("roundness", 50.0, 0.0, 100.0, Some(1.0), None),
            ],
        ),
        shader_capability(
            "chromatic-aberration",
            "Chromatic Aberration",
            "effects.chromaticAberration",
            "stylize",
            vec![
                number_param("redOffsetX", 2.0, -20.0, 20.0, Some(0.5), Some("px")),
                number_param("redOffsetY", 0.0, -20.0, 20.0, Some(0.5), Some("px")),
                number_param("blueOffsetX", -2.0, -20.0, 20.0, Some(0.5), Some("px")),
                number_param("blueOffsetY", 0.0, -20.0, 20.0, Some(0.5), Some("px")),
            ],
        ),
        shader_capability(
            "chroma-key",
            "Chroma Key",
            "effects.chromaKey",
            "keying",
            vec![
                color_param("keyColor", "#00ff00"),
                number_param("similarity", 40.0, 0.0, 100.0, Some(1.0), None),
                number_param("smoothness", 10.0, 0.0, 100.0, Some(1.0), None),
                number_param("spillSuppression", 50.0, 0.0, 100.0, Some(1.0), None),
            ],
        ),
        shader_capability(
            "luma-key",
            "Luma Key",
            "effects.lumaKey",
            "keying",
            vec![
                number_param("threshold", 50.0, 0.0, 100.0, Some(1.0), None),
                number_param("softness", 10.0, 0.0, 100.0, Some(1.0), None),
                bool_param("invert", false),
            ],
        ),
        shader_capability(
            "pixelate",
            "Pixelate",
            "effects.pixelate",
            "stylize",
            vec![number_param(
                "pixel_size",
                8.0,
                1.0,
                100.0,
                Some(1.0),
                Some("px"),
            )],
        ),
        shader_capability(
            "edge-detect",
            "Edge Detect",
            "effects.edgeDetect",
            "stylize",
            vec![
                number_param("threshold", 0.1, 0.0, 1.0, Some(0.01), None),
                number_param("strength", 1.0, 0.0, 3.0, Some(0.1), None),
            ],
        ),
        shader_capability(
            "posterize",
            "Posterize",
            "effects.posterize",
            "stylize",
            vec![number_param("levels", 4.0, 2.0, 32.0, Some(1.0), None)],
        ),
        shader_capability(
            "rgb-split",
            "RGB Split",
            "effects.rgbSplit",
            "stylize",
            vec![
                number_param("offset", 5.0, 0.0, 50.0, Some(1.0), Some("px")),
                number_param("angle", 0.0, 0.0, std::f64::consts::TAU, Some(0.01), None),
            ],
        ),
        shader_capability(
            "wave-distort",
            "Wave Distort",
            "effects.waveDistort",
            "distort",
            vec![
                number_param("amplitude", 10.0, 0.0, 100.0, Some(1.0), None),
                number_param("frequency", 5.0, 0.1, 50.0, Some(0.1), None),
                number_param("speed", 1.0, 0.0, 10.0, Some(0.1), None),
                number_param("time", 0.0, 0.0, 10000.0, Some(0.1), None),
            ],
        ),
    ]
}

fn builtin_transition_capabilities() -> Vec<EffectCapability> {
    vec![
        transition_capability("transition-fade", "Fade Transition", "fade"),
        transition_capability("transition-dissolve", "Dissolve Transition", "dissolve"),
        transition_capability("transition-wipe-left", "Wipe Left Transition", "wipe"),
        transition_capability("transition-wipe-right", "Wipe Right Transition", "wipe"),
    ]
}

fn builtin_audio_capabilities() -> Vec<EffectCapability> {
    SUPPORTED_AUDIO_EFFECT_TYPES
        .iter()
        .map(|effect_type| EffectCapability {
            id: (*effect_type).to_string(),
            kind: EffectKind::Audio,
            source: EffectSource::BuiltIn,
            source_id: None,
            name: humanize_id(effect_type),
            name_key: Some(format!("audio.effects.{effect_type}")),
            description: None,
            category: Some("audio".to_string()),
            gpu_accelerated: false,
            entry: None,
            params: Vec::new(),
        })
        .collect()
}

fn shader_capability(
    id: &str,
    name: &str,
    name_key: &str,
    category: &str,
    params: Vec<ParamDef>,
) -> EffectCapability {
    EffectCapability {
        id: id.to_string(),
        kind: EffectKind::Shader,
        source: EffectSource::BuiltIn,
        source_id: None,
        name: name.to_string(),
        name_key: Some(name_key.to_string()),
        description: None,
        category: Some(category.to_string()),
        gpu_accelerated: true,
        entry: None,
        params,
    }
}

/// Resolved transition metadata returned by the registry scheduler boundary.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedTransitionEffect {
    pub capability: EffectCapability,
    pub progress: f32,
}

fn transition_capability(id: &str, name: &str, category: &str) -> EffectCapability {
    EffectCapability {
        id: id.to_string(),
        kind: EffectKind::Transition,
        source: EffectSource::BuiltIn,
        source_id: None,
        name: name.to_string(),
        name_key: Some(format!(
            "effects.transitions.{}",
            id.trim_start_matches("transition-")
        )),
        description: None,
        category: Some(category.to_string()),
        gpu_accelerated: true,
        entry: None,
        params: vec![number_param("progress", 0.0, 0.0, 1.0, Some(0.001), None)],
    }
}

fn normalize_transition_progress(progress: f32) -> f32 {
    if progress.is_finite() {
        progress.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn number_param(
    name: &str,
    default: f64,
    min: f64,
    max: f64,
    step: Option<f64>,
    unit: Option<&str>,
) -> ParamDef {
    ParamDef {
        name: name.to_string(),
        param_type: "number".to_string(),
        default: serde_json::json!(default),
        min: Some(min),
        max: Some(max),
        step,
        unit: unit.map(str::to_string),
        label_key: Some(format!("effects.params.{name}")),
        options: Vec::new(),
        animatable: true,
    }
}

fn bool_param(name: &str, default: bool) -> ParamDef {
    ParamDef {
        name: name.to_string(),
        param_type: "boolean".to_string(),
        default: serde_json::json!(default),
        min: None,
        max: None,
        step: None,
        unit: None,
        label_key: Some(format!("effects.params.{name}")),
        options: Vec::new(),
        animatable: false,
    }
}

fn color_param(name: &str, default: &str) -> ParamDef {
    ParamDef {
        name: name.to_string(),
        param_type: "color".to_string(),
        default: serde_json::json!(default),
        min: None,
        max: None,
        step: None,
        unit: None,
        label_key: Some(format!("effects.params.{name}")),
        options: Vec::new(),
        animatable: false,
    }
}

fn select_param(name: &str, default: &str, options: Vec<(&str, &str)>) -> ParamDef {
    ParamDef {
        name: name.to_string(),
        param_type: "select".to_string(),
        default: serde_json::json!(default),
        min: None,
        max: None,
        step: None,
        unit: None,
        label_key: Some(format!("effects.params.{name}")),
        options: options
            .into_iter()
            .map(|(value, label_key)| ParamOption {
                value: serde_json::json!(value),
                label: None,
                label_key: Some(label_key.to_string()),
            })
            .collect(),
        animatable: false,
    }
}

fn humanize_id(id: &str) -> String {
    id.split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_builtin_shader_and_audio_capabilities() {
        let registry = EffectRegistry::with_builtins();
        let capabilities = registry.list_capabilities();

        assert!(capabilities
            .iter()
            .any(|cap| cap.id == "gaussian-blur" && cap.kind == EffectKind::Shader));
        assert!(capabilities
            .iter()
            .any(|cap| cap.id == "transition-fade" && cap.kind == EffectKind::Transition));
        assert!(capabilities
            .iter()
            .any(|cap| cap.id == "gain" && cap.kind == EffectKind::Audio));
    }

    #[test]
    fn registry_removes_user_capabilities_by_source() {
        let registry = EffectRegistry::with_builtins();
        registry.register(EffectCapability {
            id: "user.effect".to_string(),
            kind: EffectKind::Shader,
            source: EffectSource::User,
            source_id: Some("user.one".to_string()),
            name: "User Effect".to_string(),
            name_key: None,
            description: None,
            category: None,
            gpu_accelerated: true,
            entry: Some("shader.wgsl".to_string()),
            params: Vec::new(),
        });

        assert!(registry
            .list_capabilities()
            .iter()
            .any(|cap| cap.id == "user.effect"));

        registry.unregister_source("user.one");

        assert!(!registry
            .list_capabilities()
            .iter()
            .any(|cap| cap.id == "user.effect"));
    }

    #[test]
    fn transition_lookup_normalizes_progress() {
        let registry = EffectRegistry::with_builtins();

        let transition = registry
            .resolve_transition("transition-fade", 1.7)
            .expect("transition");

        assert_eq!(transition.capability.kind, EffectKind::Transition);
        assert_eq!(transition.progress, 1.0);
        assert!(registry.resolve_transition("gaussian-blur", 0.5).is_none());
        assert_eq!(
            registry
                .resolve_transition("transition-dissolve", f32::NAN)
                .expect("transition")
                .progress,
            0.0
        );
    }
}
