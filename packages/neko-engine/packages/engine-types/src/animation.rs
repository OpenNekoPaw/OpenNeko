//! Shared animation blend DTOs.
//!
//! These contracts describe blend/crossfade state shared by animation runtimes.
//! Runtime crates own their ECS components and domain-specific animation math.

use serde::{Deserialize, Serialize};

/// Runtime-facing duration unit used by compatibility accessors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnimationDurationUnit {
    Seconds,
    Milliseconds,
}

/// Explicit animation duration stored in milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnimationDuration {
    millis: f32,
}

impl AnimationDuration {
    /// Creates a duration from seconds.
    pub fn from_seconds(seconds: f32) -> Self {
        Self {
            millis: seconds * 1000.0,
        }
    }

    /// Creates a duration from milliseconds.
    pub fn from_millis(millis: f32) -> Self {
        Self { millis }
    }

    /// Returns this duration in seconds.
    pub fn as_seconds(self) -> f32 {
        self.millis / 1000.0
    }

    /// Returns this duration in milliseconds.
    pub fn as_millis(self) -> f32 {
        self.millis
    }

    /// Creates a duration from a unit-tagged runtime value.
    pub fn from_unit(value: f32, unit: AnimationDurationUnit) -> Self {
        match unit {
            AnimationDurationUnit::Seconds => Self::from_seconds(value),
            AnimationDurationUnit::Milliseconds => Self::from_millis(value),
        }
    }

    /// Returns this duration using the requested runtime unit.
    pub fn as_unit(self, unit: AnimationDurationUnit) -> f32 {
        match unit {
            AnimationDurationUnit::Seconds => self.as_seconds(),
            AnimationDurationUnit::Milliseconds => self.as_millis(),
        }
    }
}

impl Default for AnimationDuration {
    fn default() -> Self {
        Self::from_millis(0.0)
    }
}

/// A weighted animation blend layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendLayer {
    pub clip_index: usize,
    pub elapsed: AnimationDuration,
    pub weight: f32,
    pub looping: bool,
}

impl AnimationBlendLayer {
    pub fn new(clip_index: usize, elapsed: AnimationDuration, weight: f32, looping: bool) -> Self {
        Self {
            clip_index,
            elapsed,
            weight,
            looping,
        }
    }

    pub fn new_with_unit(
        clip_index: usize,
        elapsed: f32,
        unit: AnimationDurationUnit,
        weight: f32,
        looping: bool,
    ) -> Self {
        Self::new(
            clip_index,
            AnimationDuration::from_unit(elapsed, unit),
            weight,
            looping,
        )
    }

    pub fn elapsed_in_unit(&self, unit: AnimationDurationUnit) -> f32 {
        self.elapsed.as_unit(unit)
    }

    pub fn set_elapsed_in_unit(&mut self, elapsed: f32, unit: AnimationDurationUnit) {
        self.elapsed = AnimationDuration::from_unit(elapsed, unit);
    }
}

/// Frontend-facing blend layer info with explicit duration semantics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendLayerInfo {
    pub clip_name: String,
    pub elapsed: AnimationDuration,
    pub weight: f32,
    pub looping: bool,
}

impl AnimationBlendLayerInfo {
    pub fn new(
        clip_name: impl Into<String>,
        elapsed: AnimationDuration,
        weight: f32,
        looping: bool,
    ) -> Self {
        Self {
            clip_name: clip_name.into(),
            elapsed,
            weight,
            looping,
        }
    }

    pub fn new_with_unit(
        clip_name: impl Into<String>,
        elapsed: f32,
        unit: AnimationDurationUnit,
        weight: f32,
        looping: bool,
    ) -> Self {
        Self::new(
            clip_name,
            AnimationDuration::from_unit(elapsed, unit),
            weight,
            looping,
        )
    }

    pub fn elapsed_in_unit(&self, unit: AnimationDurationUnit) -> f32 {
        self.elapsed.as_unit(unit)
    }
}

/// Multi-layer animation blend state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendState<TLayer = AnimationBlendLayer> {
    pub layers: Vec<TLayer>,
}

impl<TLayer> AnimationBlendState<TLayer> {
    pub fn new(layers: Vec<TLayer>) -> Self {
        Self { layers }
    }
}

impl<TLayer> Default for AnimationBlendState<TLayer> {
    fn default() -> Self {
        Self { layers: Vec::new() }
    }
}

/// Active crossfade transition between animation layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationCrossfadeRequest {
    pub target_clip_index: usize,
    pub fade_duration: AnimationDuration,
    pub fade_elapsed: AnimationDuration,
    pub loop_anim: bool,
}

impl AnimationCrossfadeRequest {
    pub fn new(
        target_clip_index: usize,
        fade_duration: AnimationDuration,
        fade_elapsed: AnimationDuration,
        loop_anim: bool,
    ) -> Self {
        Self {
            target_clip_index,
            fade_duration,
            fade_elapsed,
            loop_anim,
        }
    }

    pub fn new_with_unit(
        target_clip_index: usize,
        fade_duration: f32,
        fade_elapsed: f32,
        unit: AnimationDurationUnit,
        loop_anim: bool,
    ) -> Self {
        Self::new(
            target_clip_index,
            AnimationDuration::from_unit(fade_duration, unit),
            AnimationDuration::from_unit(fade_elapsed, unit),
            loop_anim,
        )
    }

    pub fn fade_duration_in_unit(&self, unit: AnimationDurationUnit) -> f32 {
        self.fade_duration.as_unit(unit)
    }

    pub fn fade_elapsed_in_unit(&self, unit: AnimationDurationUnit) -> f32 {
        self.fade_elapsed.as_unit(unit)
    }

    pub fn advance_in_unit(&mut self, delta: f32, unit: AnimationDurationUnit) {
        let elapsed = self.fade_elapsed_in_unit(unit) + delta;
        self.fade_elapsed = AnimationDuration::from_unit(elapsed, unit);
    }
}

/// Serializer helper for runtime-specific blend layer info units/field names.
pub fn serialize_blend_layer_info_with_unit<S>(
    info: &AnimationBlendLayerInfo,
    elapsed_field: &'static str,
    unit: AnimationDurationUnit,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use serde::ser::SerializeStruct;

    let mut state = serializer.serialize_struct("AnimationBlendLayerInfo", 4)?;
    state.serialize_field("clip_name", &info.clip_name)?;
    state.serialize_field(elapsed_field, &info.elapsed_in_unit(unit))?;
    state.serialize_field("weight", &info.weight)?;
    state.serialize_field("looping", &info.looping)?;
    state.end()
}

/// Deserializer helper for runtime-specific blend layer info units/field names.
pub fn deserialize_blend_layer_info_with_unit<'de, D>(
    elapsed_field: &'static str,
    unit: AnimationDurationUnit,
    deserializer: D,
) -> Result<AnimationBlendLayerInfo, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{Error as DeError, MapAccess, Visitor};
    use std::fmt;

    struct BlendLayerInfoVisitor {
        elapsed_field: &'static str,
        unit: AnimationDurationUnit,
    }

    impl<'de> Visitor<'de> for BlendLayerInfoVisitor {
        type Value = AnimationBlendLayerInfo;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(
                formatter,
                "blend layer info with clip_name, {}, weight, and looping",
                self.elapsed_field
            )
        }

        fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
        where
            M: MapAccess<'de>,
        {
            let mut clip_name: Option<String> = None;
            let mut elapsed: Option<f32> = None;
            let mut weight: Option<f32> = None;
            let mut looping: Option<bool> = None;

            while let Some(key) = map.next_key::<String>()? {
                match key.as_str() {
                    "clip_name" => clip_name = Some(map.next_value()?),
                    key if key == self.elapsed_field => elapsed = Some(map.next_value()?),
                    "weight" => weight = Some(map.next_value()?),
                    "looping" => looping = Some(map.next_value()?),
                    _ => {
                        let _ = map.next_value::<serde::de::IgnoredAny>()?;
                    }
                }
            }

            let clip_name = clip_name.ok_or_else(|| M::Error::missing_field("clip_name"))?;
            let elapsed = elapsed.ok_or_else(|| M::Error::missing_field(self.elapsed_field))?;
            let weight = weight.ok_or_else(|| M::Error::missing_field("weight"))?;
            let looping = looping.ok_or_else(|| M::Error::missing_field("looping"))?;

            Ok(AnimationBlendLayerInfo::new_with_unit(
                clip_name, elapsed, self.unit, weight, looping,
            ))
        }
    }

    deserializer.deserialize_map(BlendLayerInfoVisitor {
        elapsed_field,
        unit,
    })
}

/// Declares runtime-facing animation wrappers around shared animation DTOs.
///
/// The generated wrappers keep domain-specific public names and unit accessors
/// in runtime crates while centralizing the repetitive DTO delegation and serde
/// field adaptation in `engine-types`.
///
/// TODO(P2): If future animation features need wrapper shapes beyond
/// layer/info/state/crossfade, extend this shared adapter with focused tests
/// instead of reintroducing parallel runtime boilerplate.
#[macro_export]
macro_rules! declare_animation_blend_wrappers {
    (
        layer {
            $(#[$layer_meta:meta])*
            $layer_vis:vis struct $layer_name:ident;
            unit: $layer_unit:expr;
            new: $layer_new:ident($elapsed_arg:ident);
            elapsed: $layer_elapsed:ident;
            set_elapsed: $layer_set_elapsed:ident;
        }
        info {
            $(#[$info_meta:meta])*
            $info_vis:vis struct $info_name:ident;
            field: $elapsed_field:expr;
            unit: $info_unit:expr;
            new: $info_new:ident($info_elapsed_arg:ident);
            elapsed: $info_elapsed:ident;
        }
        state {
            $(#[$state_meta:meta])*
            $state_vis:vis struct $state_name:ident;
            target: $state_target:path;
            new: $state_new:ident;
        }
        crossfade {
            $(#[$crossfade_meta:meta])*
            $crossfade_vis:vis struct $crossfade_name:ident;
            unit: $crossfade_unit:expr;
            new: $crossfade_new:ident($fade_duration_arg:ident, $fade_elapsed_arg:ident);
            duration: $fade_duration_method:ident;
            elapsed: $fade_elapsed_method:ident;
            advance: $advance_method:ident($advance_arg:ident);
        }
    ) => {
        $(#[$layer_meta])*
        #[derive(Debug, Clone)]
        $layer_vis struct $layer_name($crate::animation::AnimationBlendLayer);

        impl $layer_name {
            pub fn $layer_new(
                clip_index: usize,
                $elapsed_arg: f32,
                weight: f32,
                looping: bool,
            ) -> Self {
                Self($crate::animation::AnimationBlendLayer::new_with_unit(
                    clip_index,
                    $elapsed_arg,
                    $layer_unit,
                    weight,
                    looping,
                ))
            }

            pub fn $layer_elapsed(&self) -> f32 {
                self.0.elapsed_in_unit($layer_unit)
            }

            pub fn $layer_set_elapsed(&mut self, $elapsed_arg: f32) {
                self.0.set_elapsed_in_unit($elapsed_arg, $layer_unit);
            }
        }

        impl ::std::ops::Deref for $layer_name {
            type Target = $crate::animation::AnimationBlendLayer;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl ::std::ops::DerefMut for $layer_name {
            fn deref_mut(&mut self) -> &mut Self::Target {
                &mut self.0
            }
        }

        $(#[$info_meta])*
        #[derive(Debug, Clone)]
        $info_vis struct $info_name($crate::animation::AnimationBlendLayerInfo);

        impl $info_name {
            pub fn $info_new(
                clip_name: impl Into<String>,
                $info_elapsed_arg: f32,
                weight: f32,
                looping: bool,
            ) -> Self {
                Self($crate::animation::AnimationBlendLayerInfo::new_with_unit(
                    clip_name,
                    $info_elapsed_arg,
                    $info_unit,
                    weight,
                    looping,
                ))
            }

            pub fn clip_name(&self) -> &str {
                &self.0.clip_name
            }

            pub fn $info_elapsed(&self) -> f32 {
                self.0.elapsed_in_unit($info_unit)
            }

            pub fn weight(&self) -> f32 {
                self.0.weight
            }

            pub fn looping(&self) -> bool {
                self.0.looping
            }
        }

        impl serde::Serialize for $info_name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: serde::Serializer,
            {
                $crate::animation::serialize_blend_layer_info_with_unit(
                    &self.0,
                    $elapsed_field,
                    $info_unit,
                    serializer,
                )
            }
        }

        impl<'de> serde::Deserialize<'de> for $info_name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                $crate::animation::deserialize_blend_layer_info_with_unit(
                    $elapsed_field,
                    $info_unit,
                    deserializer,
                )
                .map(Self)
            }
        }

        $(#[$state_meta])*
        $state_vis struct $state_name(
            $crate::animation::AnimationBlendState<$layer_name>,
        );

        impl $state_name {
            pub fn $state_new(layers: Vec<$layer_name>) -> Self {
                Self($crate::animation::AnimationBlendState::new(layers))
            }
        }

        impl ::std::ops::Deref for $state_name {
            type Target = $crate::animation::AnimationBlendState<$layer_name>;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl ::std::ops::DerefMut for $state_name {
            fn deref_mut(&mut self) -> &mut Self::Target {
                &mut self.0
            }
        }

        $(#[$crossfade_meta])*
        $crossfade_vis struct $crossfade_name(
            $crate::animation::AnimationCrossfadeRequest,
        );

        impl $crossfade_name {
            pub fn $crossfade_new(
                target_clip_index: usize,
                $fade_duration_arg: f32,
                $fade_elapsed_arg: f32,
                loop_anim: bool,
            ) -> Self {
                Self($crate::animation::AnimationCrossfadeRequest::new_with_unit(
                    target_clip_index,
                    $fade_duration_arg,
                    $fade_elapsed_arg,
                    $crossfade_unit,
                    loop_anim,
                ))
            }

            pub fn $fade_duration_method(&self) -> f32 {
                self.0.fade_duration_in_unit($crossfade_unit)
            }

            pub fn $fade_elapsed_method(&self) -> f32 {
                self.0.fade_elapsed_in_unit($crossfade_unit)
            }

            pub fn $advance_method(&mut self, $advance_arg: f32) {
                self.0.advance_in_unit($advance_arg, $crossfade_unit);
            }
        }

        impl ::std::ops::Deref for $crossfade_name {
            type Target = $crate::animation::AnimationCrossfadeRequest;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl ::std::ops::DerefMut for $crossfade_name {
            fn deref_mut(&mut self) -> &mut Self::Target {
                &mut self.0
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(left: f32, right: f32) {
        assert!(
            (left - right).abs() < 0.0001,
            "expected {left} to be close to {right}"
        );
    }

    #[test]
    fn duration_converts_seconds_and_milliseconds() {
        let from_seconds = AnimationDuration::from_seconds(1.25);
        let from_millis = AnimationDuration::from_millis(1250.0);

        assert_close(from_seconds.as_millis(), 1250.0);
        assert_close(from_millis.as_seconds(), 1.25);
        assert_eq!(from_seconds, from_millis);
    }

    #[test]
    fn shared_blend_state_serializes_explicit_duration() {
        let state = AnimationBlendState::new(vec![AnimationBlendLayer::new(
            7,
            AnimationDuration::from_millis(500.0),
            0.75,
            true,
        )]);

        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"clip_index\":7"));
        assert!(json.contains("\"elapsed\":{\"millis\":500.0}"));
        assert!(json.contains("\"weight\":0.75"));

        let restored: AnimationBlendState = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, state);
    }

    #[test]
    fn shared_crossfade_serializes_duration_fields() {
        let request = AnimationCrossfadeRequest::new(
            2,
            AnimationDuration::from_seconds(0.5),
            AnimationDuration::from_millis(125.0),
            false,
        );

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"target_clip_index\":2"));
        assert!(json.contains("\"fade_duration\":{\"millis\":500.0}"));
        assert!(json.contains("\"fade_elapsed\":{\"millis\":125.0}"));
    }

    #[test]
    fn blend_layer_supports_unit_tagged_accessors() {
        let mut layer =
            AnimationBlendLayer::new_with_unit(1, 0.5, AnimationDurationUnit::Seconds, 0.25, true);

        assert_close(
            layer.elapsed_in_unit(AnimationDurationUnit::Milliseconds),
            500.0,
        );

        layer.set_elapsed_in_unit(750.0, AnimationDurationUnit::Milliseconds);
        assert_close(layer.elapsed_in_unit(AnimationDurationUnit::Seconds), 0.75);
    }

    #[test]
    fn crossfade_supports_unit_tagged_accessors() {
        let mut request = AnimationCrossfadeRequest::new_with_unit(
            4,
            250.0,
            100.0,
            AnimationDurationUnit::Milliseconds,
            true,
        );

        request.advance_in_unit(0.05, AnimationDurationUnit::Seconds);

        assert_eq!(request.target_clip_index, 4);
        assert_close(
            request.fade_duration_in_unit(AnimationDurationUnit::Seconds),
            0.25,
        );
        assert_close(
            request.fade_elapsed_in_unit(AnimationDurationUnit::Milliseconds),
            150.0,
        );
        assert!(request.loop_anim);
    }

    #[derive(Debug, PartialEq)]
    struct SecondsBlendLayerInfo(AnimationBlendLayerInfo);

    impl Serialize for SecondsBlendLayerInfo {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            serialize_blend_layer_info_with_unit(
                &self.0,
                "elapsed",
                AnimationDurationUnit::Seconds,
                serializer,
            )
        }
    }

    impl<'de> Deserialize<'de> for SecondsBlendLayerInfo {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            deserialize_blend_layer_info_with_unit(
                "elapsed",
                AnimationDurationUnit::Seconds,
                deserializer,
            )
            .map(Self)
        }
    }

    #[derive(Debug, PartialEq)]
    struct MillisBlendLayerInfo(AnimationBlendLayerInfo);

    impl Serialize for MillisBlendLayerInfo {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            serialize_blend_layer_info_with_unit(
                &self.0,
                "elapsed_ms",
                AnimationDurationUnit::Milliseconds,
                serializer,
            )
        }
    }

    impl<'de> Deserialize<'de> for MillisBlendLayerInfo {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            deserialize_blend_layer_info_with_unit(
                "elapsed_ms",
                AnimationDurationUnit::Milliseconds,
                deserializer,
            )
            .map(Self)
        }
    }

    #[test]
    fn blend_layer_info_serializes_runtime_specific_elapsed_field() {
        let info = AnimationBlendLayerInfo::new_with_unit(
            "walk",
            0.5,
            AnimationDurationUnit::Seconds,
            0.7,
            true,
        );

        let seconds_json = serde_json::to_string(&SecondsBlendLayerInfo(info.clone())).unwrap();
        assert!(seconds_json.contains("\"elapsed\":0.5"));
        assert!(!seconds_json.contains("elapsed_ms"));

        let millis_json = serde_json::to_string(&MillisBlendLayerInfo(info)).unwrap();
        assert!(millis_json.contains("\"elapsed_ms\":500.0"));
        assert!(!millis_json.contains("\"elapsed\":"));
    }

    #[test]
    fn blend_layer_info_deserializes_runtime_specific_elapsed_field() {
        let seconds: SecondsBlendLayerInfo = serde_json::from_str(
            r#"{"clip_name":"walk","elapsed":0.5,"weight":0.7,"looping":true}"#,
        )
        .unwrap();
        assert_close(
            seconds
                .0
                .elapsed_in_unit(AnimationDurationUnit::Milliseconds),
            500.0,
        );

        let millis: MillisBlendLayerInfo = serde_json::from_str(
            r#"{"clip_name":"walk","elapsed_ms":500.0,"weight":0.7,"looping":true}"#,
        )
        .unwrap();
        assert_close(
            millis.0.elapsed_in_unit(AnimationDurationUnit::Seconds),
            0.5,
        );
    }
}
