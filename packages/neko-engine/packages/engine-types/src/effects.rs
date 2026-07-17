//! Effect types — blend modes, effect parameters, transitions

use serde::{Deserialize, Serialize};

/// Blend mode for compositing layers — 27 modes aligned with timeline.proto and GPU shaders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlendMode {
    // Basic
    #[default]
    Normal,
    Dissolve,
    // Darken Group
    Darken,
    Multiply,
    ColorBurn,
    LinearBurn,
    DarkerColor,
    // Lighten Group
    Lighten,
    Screen,
    ColorDodge,
    LinearDodge, // Add
    LighterColor,
    // Contrast Group
    Overlay,
    SoftLight,
    HardLight,
    VividLight,
    LinearLight,
    PinLight,
    HardMix,
    // Difference Group
    Difference,
    Exclusion,
    Subtract,
    Divide,
    // HSL Group
    Hue,
    Saturation,
    Color,
    Luminosity,
}

impl BlendMode {
    /// All blend modes in stable shader-code order.
    pub const ALL: [Self; 27] = [
        Self::Normal,
        Self::Dissolve,
        Self::Darken,
        Self::Multiply,
        Self::ColorBurn,
        Self::LinearBurn,
        Self::DarkerColor,
        Self::Lighten,
        Self::Screen,
        Self::ColorDodge,
        Self::LinearDodge,
        Self::LighterColor,
        Self::Overlay,
        Self::SoftLight,
        Self::HardLight,
        Self::VividLight,
        Self::LinearLight,
        Self::PinLight,
        Self::HardMix,
        Self::Difference,
        Self::Exclusion,
        Self::Subtract,
        Self::Divide,
        Self::Hue,
        Self::Saturation,
        Self::Color,
        Self::Luminosity,
    ];

    pub fn from_name(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            // Basic
            "normal" => Self::Normal,
            "dissolve" => Self::Dissolve,
            // Darken Group
            "darken" => Self::Darken,
            "multiply" => Self::Multiply,
            "color-burn" | "color_burn" | "colorburn" => Self::ColorBurn,
            "linear-burn" | "linear_burn" | "linearburn" => Self::LinearBurn,
            "darker-color" | "darker_color" | "darkercolor" => Self::DarkerColor,
            // Lighten Group
            "lighten" => Self::Lighten,
            "screen" => Self::Screen,
            "color-dodge" | "color_dodge" | "colordodge" => Self::ColorDodge,
            "linear-dodge" | "linear_dodge" | "lineardodge" | "add" => Self::LinearDodge,
            "lighter-color" | "lighter_color" | "lightercolor" => Self::LighterColor,
            // Contrast Group
            "overlay" => Self::Overlay,
            "soft-light" | "soft_light" | "softlight" => Self::SoftLight,
            "hard-light" | "hard_light" | "hardlight" => Self::HardLight,
            "vivid-light" | "vivid_light" | "vividlight" => Self::VividLight,
            "linear-light" | "linear_light" | "linearlight" => Self::LinearLight,
            "pin-light" | "pin_light" | "pinlight" => Self::PinLight,
            "hard-mix" | "hard_mix" | "hardmix" => Self::HardMix,
            // Difference Group
            "difference" => Self::Difference,
            "exclusion" => Self::Exclusion,
            "subtract" => Self::Subtract,
            "divide" => Self::Divide,
            // HSL Group
            "hue" => Self::Hue,
            "saturation" => Self::Saturation,
            "color" => Self::Color,
            "luminosity" => Self::Luminosity,
            _ => Self::Normal,
        }
    }

    /// Parse a blend mode name, defaulting to normal for unknown values.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        Self::from_name(s)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            // Basic
            Self::Normal => "normal",
            Self::Dissolve => "dissolve",
            // Darken Group
            Self::Darken => "darken",
            Self::Multiply => "multiply",
            Self::ColorBurn => "color-burn",
            Self::LinearBurn => "linear-burn",
            Self::DarkerColor => "darker-color",
            // Lighten Group
            Self::Lighten => "lighten",
            Self::Screen => "screen",
            Self::ColorDodge => "color-dodge",
            Self::LinearDodge => "linear-dodge",
            Self::LighterColor => "lighter-color",
            // Contrast Group
            Self::Overlay => "overlay",
            Self::SoftLight => "soft-light",
            Self::HardLight => "hard-light",
            Self::VividLight => "vivid-light",
            Self::LinearLight => "linear-light",
            Self::PinLight => "pin-light",
            Self::HardMix => "hard-mix",
            // Difference Group
            Self::Difference => "difference",
            Self::Exclusion => "exclusion",
            Self::Subtract => "subtract",
            Self::Divide => "divide",
            // HSL Group
            Self::Hue => "hue",
            Self::Saturation => "saturation",
            Self::Color => "color",
            Self::Luminosity => "luminosity",
        }
    }

    /// Stable numeric code consumed by GPU blend shaders.
    pub fn shader_code(&self) -> u32 {
        match self {
            Self::Normal => 0,
            Self::Dissolve => 1,
            Self::Darken => 2,
            Self::Multiply => 3,
            Self::ColorBurn => 4,
            Self::LinearBurn => 5,
            Self::DarkerColor => 6,
            Self::Lighten => 7,
            Self::Screen => 8,
            Self::ColorDodge => 9,
            Self::LinearDodge => 10,
            Self::LighterColor => 11,
            Self::Overlay => 12,
            Self::SoftLight => 13,
            Self::HardLight => 14,
            Self::VividLight => 15,
            Self::LinearLight => 16,
            Self::PinLight => 17,
            Self::HardMix => 18,
            Self::Difference => 19,
            Self::Exclusion => 20,
            Self::Subtract => 21,
            Self::Divide => 22,
            Self::Hue => 23,
            Self::Saturation => 24,
            Self::Color => 25,
            Self::Luminosity => 26,
        }
    }
}

/// Effect type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EffectType {
    Blur,
    Sharpen,
    ColorCorrection,
    Brightness,
    Contrast,
    Saturation,
    Hue,
    Exposure,
    Gamma,
    Vignette,
    ChromaticAberration,
    FilmGrain,
    Custom,
}

/// Effect parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectParams {
    /// Effect type
    pub effect_type: EffectType,
    /// Effect intensity (0.0 - 1.0)
    #[serde(default = "default_intensity")]
    pub intensity: f64,
    /// Effect-specific parameters
    #[serde(default)]
    pub params: serde_json::Value,
    /// Whether effect is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_intensity() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

/// Canonical engine-supported audio effect type names.
pub const SUPPORTED_AUDIO_EFFECT_TYPES: &[&str] = &[
    "gain",
    "high-pass",
    "low-pass",
    "band-pass",
    "notch",
    "peaking",
    "low-shelf",
    "high-shelf",
    "parametric-eq",
    "compressor",
    "noise-gate",
    "limiter",
    "reverb",
    "delay",
    "chorus",
    "distortion",
];

/// High-level effect capability kind exposed by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EffectKind {
    Shader,
    Transition,
    Audio,
    Lut,
}

/// Origin of a registered effect capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EffectSource {
    BuiltIn,
    User,
}

/// Select-style option metadata for effect parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamOption {
    pub value: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
}

/// Primitive parameter definition for discovered effect capabilities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamDef {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub default: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<ParamOption>,
    #[serde(default)]
    pub animatable: bool,
}

/// Queryable metadata for built-in or user-provided effect capabilities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectCapability {
    pub id: String,
    pub kind: EffectKind,
    pub source: EffectSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub gpu_accelerated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    #[serde(default)]
    pub params: Vec<ParamDef>,
}

/// Canonical audio effect render instruction shared across engine layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEffectConfig {
    /// Unique effect instance ID.
    pub id: String,
    /// Canonical engine-supported effect type, e.g. "noise-gate".
    pub effect_type: String,
    /// Whether the effect should process audio.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Effect-specific parameter object.
    #[serde(default)]
    pub params: serde_json::Value,
}

impl Default for EffectParams {
    fn default() -> Self {
        Self {
            effect_type: EffectType::Custom,
            intensity: 1.0,
            params: serde_json::Value::Null,
            enabled: true,
        }
    }
}

/// Type-keyed effect instance on a timeline element.
/// Mirrors TypeScript `EffectInstance` from `@neko/shared`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEffect {
    /// Unique instance ID (e.g., "effect-1234-abc")
    pub id: String,
    /// Effect type string (e.g., "gaussian-blur", "pixelate", "custom")
    #[serde(rename = "type")]
    pub effect_type: String,
    /// Whether the effect is currently active
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Static parameter values keyed by parameter name
    #[serde(default)]
    pub parameters: serde_json::Map<String, serde_json::Value>,
    /// Effect stack order (lower = applied first)
    #[serde(default)]
    pub order: u32,
}

/// Transition type for clips
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionType {
    #[default]
    None,
    Fade,
    Dissolve,
    Wipe,
    Slide,
    Zoom,
    Push,
    Cover,
    Reveal,
    #[serde(untagged)]
    Custom(String),
}

/// Transition parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionParams {
    /// Transition type
    #[serde(rename = "type")]
    pub transition_type: TransitionType,
    /// Duration in seconds
    pub duration: f64,
    /// Easing function
    #[serde(default)]
    pub easing: EasingType,
    /// Direction (for directional transitions)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<TransitionDirection>,
}

/// Transition direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransitionDirection {
    Left,
    Right,
    Up,
    Down,
}

/// Easing type for animations and transitions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EasingType {
    #[default]
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blend_mode_parses_existing_aliases() {
        assert_eq!(BlendMode::from_str("normal"), BlendMode::Normal);
        assert_eq!(BlendMode::from_str("color_burn"), BlendMode::ColorBurn);
        assert_eq!(BlendMode::from_str("linear-dodge"), BlendMode::LinearDodge);
        assert_eq!(BlendMode::from_str("add"), BlendMode::LinearDodge);
        assert_eq!(BlendMode::from_str("soft_light"), BlendMode::SoftLight);
        assert_eq!(BlendMode::from_str("unknown"), BlendMode::Normal);
    }

    #[test]
    fn blend_mode_shader_codes_are_stable_and_exhaustive() {
        let expected = [
            (BlendMode::Normal, 0),
            (BlendMode::Dissolve, 1),
            (BlendMode::Darken, 2),
            (BlendMode::Multiply, 3),
            (BlendMode::ColorBurn, 4),
            (BlendMode::LinearBurn, 5),
            (BlendMode::DarkerColor, 6),
            (BlendMode::Lighten, 7),
            (BlendMode::Screen, 8),
            (BlendMode::ColorDodge, 9),
            (BlendMode::LinearDodge, 10),
            (BlendMode::LighterColor, 11),
            (BlendMode::Overlay, 12),
            (BlendMode::SoftLight, 13),
            (BlendMode::HardLight, 14),
            (BlendMode::VividLight, 15),
            (BlendMode::LinearLight, 16),
            (BlendMode::PinLight, 17),
            (BlendMode::HardMix, 18),
            (BlendMode::Difference, 19),
            (BlendMode::Exclusion, 20),
            (BlendMode::Subtract, 21),
            (BlendMode::Divide, 22),
            (BlendMode::Hue, 23),
            (BlendMode::Saturation, 24),
            (BlendMode::Color, 25),
            (BlendMode::Luminosity, 26),
        ];

        assert_eq!(BlendMode::ALL.len(), expected.len());
        for (index, (mode, code)) in expected.iter().copied().enumerate() {
            assert_eq!(BlendMode::ALL[index], mode);
            assert_eq!(mode.shader_code(), code);
        }
    }
}
