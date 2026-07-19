//! AudioMixdown — Multi-track audio mixing for retained timeline/media workflows.
//!
//! Unlike AudioMixer (which is frame-aligned for video export), AudioMixdown
//! operates on sample-aligned buffers for audio-only projects.
//!
//! Supports per-track: volume, pan, solo, mute, effect chain, fade in/out, gain.
//! Supports master bus: effect chain, master volume, soft limiter.

use std::collections::{HashMap, HashSet};

use crate::error::Result;
use neko_engine_audio::dsp::effect_factory::{AudioEffectConfig, AudioEffectFactory};
use neko_engine_audio::dsp::gain::db_to_linear;
use neko_engine_audio::dsp::{AudioEffect, EffectChain};
use neko_engine_audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat, SoftLimiter};
use serde::{Deserialize, Serialize};

/// Full mix configuration sent from the TS layer.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownConfig {
    pub tracks: Vec<MixdownTrack>,
    #[serde(default)]
    pub master_effects: Vec<AudioEffectConfig>,
    #[serde(default = "default_volume")]
    pub master_volume: f32,
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    #[serde(default = "default_channels")]
    pub channels: u16,
}

/// Simplified track description for audio-only mixing.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownTrack {
    pub id: String,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub effect_chain: Vec<AudioEffectConfig>,
    #[serde(default)]
    pub automation: Vec<MixAutomationLane>,
    pub elements: Vec<MixdownElement>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixAutomationLane {
    pub id: String,
    pub target: MixAutomationTarget,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub points: Vec<MixAutomationPoint>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MixAutomationTarget {
    TrackVolume,
    TrackPan,
    EffectParam { effect_id: String, param: String },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixAutomationPoint {
    pub time: f64,
    pub value: f32,
    #[serde(default = "default_automation_curve")]
    pub curve: String,
}

/// Audio element within a mixdown track.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownElement {
    pub id: String,
    pub src: String,
    pub start_time: f64,
    pub duration: f64,
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub gain: f64,
}

fn default_volume() -> f32 {
    1.0
}

fn default_sample_rate() -> u32 {
    48000
}

fn default_channels() -> u16 {
    2
}

fn default_automation_curve() -> String {
    "linear".to_string()
}

struct MixdownSource {
    src: String,
    decoder: FfmpegAudioDecoder,
    current_position: f64,
    residual: Vec<f32>,
}

/// Mixed audio buffer output.
#[derive(Debug)]
pub struct MixdownBuffer {
    pub data: Vec<f32>,
    pub samples: usize,
    pub timestamp: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Audio mixdown engine for multi-track audio projects.
pub struct AudioMixdown {
    sources: HashMap<String, MixdownSource>,
    tracks: Vec<MixdownTrack>,
    sample_rate: u32,
    channels: u16,
    buffer_size: usize,
    limiter: SoftLimiter,
    master_volume: f32,
    master_effect_chain: EffectChain,
    track_effect_chains: HashMap<String, EffectChain>,
    has_solo: bool,
    warnings: Vec<String>,
}

impl AudioMixdown {
    pub fn new(config: MixdownConfig) -> Self {
        let has_solo = config.tracks.iter().any(|t| t.solo);
        let (master_chain, track_chains, warnings) = rebuild_effect_chains(&config);

        Self {
            sources: HashMap::new(),
            tracks: config.tracks,
            sample_rate: config.sample_rate,
            channels: config.channels,
            buffer_size: 4096,
            limiter: SoftLimiter::new(0.95, 50.0, config.sample_rate),
            master_volume: config.master_volume,
            master_effect_chain: master_chain,
            track_effect_chains: track_chains,
            has_solo,
            warnings,
        }
    }

    /// Open decoders for all active audio elements.
    pub fn initialize(&mut self) -> Result<()> {
        for entry in self.collect_source_entries() {
            if self.sources.contains_key(&entry.key) {
                continue;
            }
            let mut decoder = self.create_decoder();
            match decoder.open(&entry.src) {
                Ok(info) => {
                    tracing::info!(
                        "Mixdown: opened {} — {} Hz, {} ch, {:.2}s",
                        entry.src,
                        info.sample_rate,
                        info.channels,
                        info.duration
                    );
                    self.sources.insert(
                        entry.key,
                        MixdownSource {
                            src: entry.src,
                            decoder,
                            current_position: -1.0,
                            residual: Vec::new(),
                        },
                    );
                }
                Err(e) => {
                    tracing::error!("Mixdown: failed to open {}: {}", entry.src, e);
                    return Err(e.into());
                }
            }
        }
        Ok(())
    }

    /// Hot-update configuration without recreating decoders.
    pub fn update_config(&mut self, config: MixdownConfig) -> Vec<String> {
        let output_format_changed =
            self.sample_rate != config.sample_rate || self.channels != config.channels;
        self.has_solo = config.tracks.iter().any(|t| t.solo);
        self.master_volume = config.master_volume;
        self.sample_rate = config.sample_rate;
        self.channels = config.channels;
        if output_format_changed {
            self.close();
            self.limiter = SoftLimiter::new(0.95, 50.0, config.sample_rate);
        }

        let (master_chain, track_chains, warnings) = rebuild_effect_chains(&config);
        self.master_effect_chain = master_chain;
        self.track_effect_chains = track_chains;
        self.warnings = warnings;

        self.tracks = config.tracks;
        let active_sources = self.collect_source_entries();
        let active_source_map: HashMap<String, String> = active_sources
            .iter()
            .map(|entry| (entry.key.clone(), entry.src.clone()))
            .collect();
        self.sources.retain(|key, source| {
            let keep = active_source_map
                .get(key)
                .is_some_and(|active_src| active_src == &source.src);
            if !keep {
                source.decoder.close();
            }
            keep
        });

        for entry in active_sources {
            if self.sources.contains_key(&entry.key) {
                continue;
            }
            let mut decoder = self.create_decoder();
            match decoder.open(&entry.src) {
                Ok(_) => {
                    self.sources.insert(
                        entry.key,
                        MixdownSource {
                            src: entry.src,
                            decoder,
                            current_position: -1.0,
                            residual: Vec::new(),
                        },
                    );
                }
                Err(err) => {
                    let warning = format!(
                        "Audio source '{}' failed to open during update: {}",
                        entry.src, err
                    );
                    tracing::warn!("Mixdown: {}", warning);
                    self.warnings.push(warning);
                }
            }
        }

        self.warnings.clone()
    }

    pub fn warnings(&self) -> &[String] {
        &self.warnings
    }

    pub fn take_warnings(&mut self) -> Vec<String> {
        std::mem::take(&mut self.warnings)
    }

    /// Mix a buffer of audio at the given timeline time.
    ///
    /// Pipeline:
    /// 1. For each active track (respecting solo/mute):
    ///    a. Decode elements → apply per-element volume/pan/fade/gain
    ///    b. Sum into per-track buffer
    ///    c. Run track effect chain
    ///    d. Apply track volume/pan
    /// 2. Sum all track buffers into master output
    /// 3. Run master effect chain
    /// 4. Apply master volume + limiter
    pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer> {
        let needed = self.buffer_size * self.channels as usize;
        let mut output = vec![0.0f32; needed];
        let buf_duration = self.buffer_size as f64 / self.sample_rate as f64;
        let ch = self.channels as usize;

        for track in &self.tracks {
            if self.is_track_muted(track) {
                continue;
            }

            let mut track_buf = vec![0.0f32; needed];

            for elem in &track.elements {
                if elem.muted {
                    continue;
                }
                let end = elem.start_time + elem.duration;
                if elem.start_time >= time + buf_duration || end <= time {
                    continue;
                }

                let source_key = source_key(&track.id, &elem.id);
                let source = match self.sources.get_mut(&source_key) {
                    Some(s) => s,
                    None => continue,
                };

                let active_start = time.max(elem.start_time);
                let source_time = (elem.trim_start + (active_start - elem.start_time)).max(0.0);
                let timeline_offset_samples =
                    ((active_start - time) * self.sample_rate as f64).round() as usize;
                if timeline_offset_samples >= self.buffer_size {
                    continue;
                }
                let source_needed = (self.buffer_size - timeline_offset_samples) * ch;
                let need_seek = source.current_position < 0.0
                    || (source_time - source.current_position).abs() > buf_duration * 1.5;

                if need_seek {
                    if source.decoder.seek(source_time).is_err() {
                        continue;
                    }
                    source.residual.clear();
                    source.current_position = source_time;
                    for _ in 0..3 {
                        match source.decoder.decode_next() {
                            Ok(Some(f)) => {
                                let samples: &[f32] = bytemuck::cast_slice(&f.data);
                                if samples.iter().any(|s| s.abs() > 0.0) {
                                    source.residual.extend_from_slice(samples);
                                    break;
                                }
                            }
                            _ => break,
                        }
                    }
                }

                while source.residual.len() < source_needed {
                    match source.decoder.decode_next() {
                        Ok(Some(f)) => {
                            let samples: &[f32] = bytemuck::cast_slice(&f.data);
                            source.residual.extend_from_slice(samples);
                        }
                        _ => {
                            source.residual.resize(source_needed, 0.0);
                            break;
                        }
                    }
                }

                let frame_samples: Vec<f32> = source.residual.drain(..source_needed).collect();
                source.current_position +=
                    (frame_samples.len() / ch) as f64 / self.sample_rate as f64;

                // Mix element samples with per-element volume, pan, fade, gain
                for frame_idx in timeline_offset_samples..self.buffer_size {
                    let sample_idx = frame_idx - timeline_offset_samples;
                    let sample_time = time + frame_idx as f64 / self.sample_rate as f64;
                    if sample_time >= end {
                        break;
                    }
                    let vol = self.compute_element_volume(elem, sample_time);

                    let base_idx = frame_idx * ch;
                    let sample_base_idx = sample_idx * ch;
                    if ch >= 2 {
                        let (gain_l, gain_r) = equal_power_pan(elem.pan);
                        if sample_base_idx + 1 < frame_samples.len()
                            && base_idx + 1 < track_buf.len()
                        {
                            let sl = frame_samples[sample_base_idx] * vol * gain_l;
                            let sr = frame_samples[sample_base_idx + 1] * vol * gain_r;
                            if sl.is_finite() {
                                track_buf[base_idx] += sl;
                            }
                            if sr.is_finite() {
                                track_buf[base_idx + 1] += sr;
                            }
                        }
                    } else if sample_base_idx < frame_samples.len() && base_idx < track_buf.len() {
                        let s = frame_samples[sample_base_idx] * vol;
                        if s.is_finite() {
                            track_buf[base_idx] += s;
                        }
                    }
                }
            }

            // Run track effect chain
            if let Some(chain) = self.track_effect_chains.get_mut(&track.id) {
                chain.process(&mut track_buf, self.channels, self.sample_rate);
            }

            // Apply track volume and pan, then sum into master output.
            for i in 0..needed {
                let frame_idx = i / ch;
                let sample_time = time + frame_idx as f64 / self.sample_rate as f64;
                let (track_vol, track_pan) = evaluate_track_mix(track, sample_time);
                let (track_gain_l, track_gain_r) = equal_power_pan(track_pan);
                let pan_gain = if ch >= 2 {
                    if i % 2 == 0 {
                        track_gain_l
                    } else {
                        track_gain_r
                    }
                } else {
                    1.0
                };
                let s = track_buf[i] * track_vol * pan_gain;
                if s.is_finite() {
                    output[i] += s;
                }
            }
        }

        // Master effect chain
        self.master_effect_chain
            .process(&mut output, self.channels, self.sample_rate);

        // Master volume
        if (self.master_volume - 1.0).abs() > f32::EPSILON {
            for sample in output.iter_mut() {
                *sample *= self.master_volume;
            }
        }

        // Limiter
        self.limiter.process_buffer(&mut output);

        Ok(MixdownBuffer {
            data: output,
            samples: self.buffer_size,
            timestamp: time,
            sample_rate: self.sample_rate,
            channels: self.channels,
        })
    }

    /// Reset all effect chains and decoders (after seek).
    pub fn reset(&mut self) {
        self.master_effect_chain.reset();
        for chain in self.track_effect_chains.values_mut() {
            chain.reset();
        }
        for source in self.sources.values_mut() {
            source.current_position = -1.0;
            source.residual.clear();
        }
    }

    /// Convert f32 buffer to s16le bytes.
    pub fn to_s16_bytes(buf: &MixdownBuffer) -> Vec<u8> {
        let mut out = Vec::with_capacity(buf.data.len() * 2);
        for &sample in &buf.data {
            let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            out.extend_from_slice(&s16.to_le_bytes());
        }
        out
    }

    /// Compute total project duration (max end time across all elements).
    pub fn total_duration(&self) -> f64 {
        self.tracks
            .iter()
            .flat_map(|t| &t.elements)
            .map(|e| e.start_time + e.duration)
            .fold(0.0, f64::max)
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    pub fn close(&mut self) {
        for source in self.sources.values_mut() {
            source.decoder.close();
        }
        self.sources.clear();
    }

    // -- private --

    fn is_track_muted(&self, track: &MixdownTrack) -> bool {
        if track.muted {
            return true;
        }
        if self.has_solo && !track.solo {
            return true;
        }
        false
    }

    fn compute_element_volume(&self, elem: &MixdownElement, time: f64) -> f32 {
        let relative_time = time - elem.start_time;
        let mut vol = elem.volume;

        // Apply gain (dB → linear)
        if elem.gain != 0.0 {
            let clamped = elem.gain.clamp(-60.0, 60.0);
            vol *= db_to_linear(clamped as f32);
        }

        // Fade in (linear)
        if elem.fade_in > 0.0 && relative_time < elem.fade_in {
            let t = (relative_time / elem.fade_in).clamp(0.0, 1.0) as f32;
            vol *= t;
        }

        // Fade out (linear)
        let time_to_end = elem.duration - relative_time;
        if elem.fade_out > 0.0 && time_to_end < elem.fade_out {
            let t = (time_to_end / elem.fade_out).clamp(0.0, 1.0) as f32;
            vol *= t;
        }

        vol.clamp(0.0, 10.0)
    }

    fn create_decoder(&self) -> FfmpegAudioDecoder {
        FfmpegAudioDecoder::new()
            .with_output_format(SampleFormat::F32)
            .with_output_sample_rate(self.sample_rate)
            .with_output_channels(self.channels)
    }

    fn collect_source_entries(&self) -> Vec<MixdownSourceEntry> {
        let mut entries = Vec::new();
        let mut seen = HashSet::new();
        for track in &self.tracks {
            if self.is_track_muted(track) {
                continue;
            }
            for elem in &track.elements {
                if !elem.muted {
                    let key = source_key(&track.id, &elem.id);
                    if seen.insert(key.clone()) {
                        entries.push(MixdownSourceEntry {
                            key,
                            src: elem.src.clone(),
                        });
                    }
                }
            }
        }
        entries
    }
}

impl Drop for AudioMixdown {
    fn drop(&mut self) {
        self.close();
    }
}

/// Equal-power panning: pan = -1.0 (left) to 1.0 (right).
/// Returns (left_gain, right_gain).
fn equal_power_pan(pan: f32) -> (f32, f32) {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * 0.25 * std::f32::consts::PI;
    (angle.cos(), angle.sin())
}

#[derive(Debug, Clone, Copy)]
enum AutomationKind {
    Volume,
    Pan,
}

fn evaluate_track_mix(track: &MixdownTrack, time: f64) -> (f32, f32) {
    let track_vol = evaluate_track_automation(track, AutomationKind::Volume, time)
        .unwrap_or(track.volume)
        .clamp(0.0, 10.0);
    let track_pan = evaluate_track_automation(track, AutomationKind::Pan, time)
        .unwrap_or(track.pan)
        .clamp(-1.0, 1.0);
    (track_vol, track_pan)
}

fn evaluate_track_automation(track: &MixdownTrack, kind: AutomationKind, time: f64) -> Option<f32> {
    let lane = track.automation.iter().find(|lane| {
        lane.enabled
            && matches!(
                (&lane.target, kind),
                (MixAutomationTarget::TrackVolume, AutomationKind::Volume)
                    | (MixAutomationTarget::TrackPan, AutomationKind::Pan)
            )
    })?;
    evaluate_automation_points(&lane.points, time)
}

fn evaluate_automation_points(points: &[MixAutomationPoint], time: f64) -> Option<f32> {
    let first = points.first()?;
    if time <= first.time {
        return Some(first.value);
    }

    for window in points.windows(2) {
        let left = &window[0];
        let right = &window[1];
        if time >= left.time && time <= right.time {
            if left.curve == "hold" || right.time <= left.time {
                return Some(left.value);
            }
            let t = ((time - left.time) / (right.time - left.time)).clamp(0.0, 1.0) as f32;
            if left.curve == "exponential" {
                let shaped = t * t;
                return Some(left.value + (right.value - left.value) * shaped);
            }
            return Some(left.value + (right.value - left.value) * t);
        }
    }

    points.last().map(|point| point.value)
}

#[derive(Debug)]
struct MixdownSourceEntry {
    key: String,
    src: String,
}

fn source_key(track_id: &str, element_id: &str) -> String {
    format!("{track_id}:{element_id}")
}

fn rebuild_effect_chains(
    config: &MixdownConfig,
) -> (EffectChain, HashMap<String, EffectChain>, Vec<String>) {
    let mut warnings = Vec::new();
    collect_automation_warnings(config, &mut warnings);
    let factory = AudioEffectFactory::with_builtins();
    let master_chain =
        build_lossy_effect_chain(&factory, &config.master_effects, None, &mut warnings);

    let mut track_chains = HashMap::new();
    for track in &config.tracks {
        if track.effect_chain.is_empty() {
            continue;
        }
        let chain = build_lossy_effect_chain(
            &factory,
            &track.effect_chain,
            Some(&track.id),
            &mut warnings,
        );
        if !chain.is_empty() {
            track_chains.insert(track.id.clone(), chain);
        }
    }

    (master_chain, track_chains, warnings)
}

fn collect_automation_warnings(config: &MixdownConfig, warnings: &mut Vec<String>) {
    for track in &config.tracks {
        for lane in &track.automation {
            if !lane.enabled {
                continue;
            }
            if matches!(lane.target, MixAutomationTarget::EffectParam { .. }) {
                warnings.push(format!(
                    "Unsupported effect automation '{}' in track {} skipped",
                    lane.id, track.id
                ));
            }
        }
    }
}

fn build_lossy_effect_chain(
    factory: &AudioEffectFactory,
    configs: &[AudioEffectConfig],
    track_id: Option<&str>,
    warnings: &mut Vec<String>,
) -> EffectChain {
    let mut chain = EffectChain::new();
    for config in configs {
        match factory.create(config) {
            Ok(effect) => chain.push(config.id.clone(), config.enabled, effect),
            Err(err) => {
                let scope = track_id
                    .map(|id| format!("track {}", id))
                    .unwrap_or_else(|| "master".to_string());
                warnings.push(format!(
                    "Unsupported audio effect '{}' ({}) in {} skipped: {}",
                    config.effect_type, config.id, scope, err
                ));
            }
        }
    }
    chain
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_track(id: &str) -> MixdownTrack {
        MixdownTrack {
            id: id.into(),
            muted: false,
            solo: false,
            volume: 1.0,
            pan: 0.0,
            effect_chain: vec![],
            automation: vec![],
            elements: vec![],
        }
    }

    fn make_point(time: f64, value: f32, curve: &str) -> MixAutomationPoint {
        MixAutomationPoint {
            time,
            value,
            curve: curve.to_string(),
        }
    }

    fn make_config(tracks: Vec<MixdownTrack>) -> MixdownConfig {
        MixdownConfig {
            tracks,
            master_effects: vec![],
            master_volume: 1.0,
            sample_rate: 48000,
            channels: 2,
        }
    }

    #[test]
    fn test_equal_power_pan_center() {
        let (l, r) = equal_power_pan(0.0);
        assert!((l - r).abs() < 0.01, "Center pan should be equal L/R");
        assert!((l - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_equal_power_pan_hard_left() {
        let (l, r) = equal_power_pan(-1.0);
        assert!((l - 1.0).abs() < 0.01);
        assert!(r < 0.01);
    }

    #[test]
    fn test_mixdown_config_deserializes_automation() {
        let config: MixdownConfig = serde_json::from_value(serde_json::json!({
            "tracks": [
                {
                    "id": "track-a",
                    "muted": false,
                    "solo": false,
                    "volume": 1.0,
                    "pan": 0.0,
                    "effectChain": [],
                    "automation": [
                        {
                            "id": "volume-lane",
                            "enabled": true,
                            "target": { "kind": "track-volume" },
                            "points": [
                                { "time": 0.0, "value": 0.25, "curve": "linear" },
                                { "time": 1.0, "value": 0.75, "curve": "hold" }
                            ]
                        },
                        {
                            "id": "effect-lane",
                            "enabled": true,
                            "target": {
                                "kind": "effect-param",
                                "effectId": "fx-1",
                                "param": "threshold"
                            },
                            "points": [
                                { "time": 0.0, "value": -24.0, "curve": "linear" }
                            ]
                        }
                    ],
                    "elements": []
                }
            ],
            "masterEffects": [],
            "masterVolume": 1.0,
            "sampleRate": 48000,
            "channels": 2
        }))
        .unwrap();

        assert_eq!(config.tracks[0].automation.len(), 2);
        assert!(matches!(
            config.tracks[0].automation[0].target,
            MixAutomationTarget::TrackVolume
        ));
        assert!(matches!(
            config.tracks[0].automation[1].target,
            MixAutomationTarget::EffectParam { .. }
        ));
    }

    #[test]
    fn test_evaluate_automation_points_uses_deterministic_curves() {
        let linear = vec![
            make_point(0.0, 0.0, "linear"),
            make_point(1.0, 1.0, "linear"),
        ];
        assert_eq!(evaluate_automation_points(&linear, -0.5), Some(0.0));
        assert!((evaluate_automation_points(&linear, 0.5).unwrap() - 0.5).abs() < 0.001);
        assert_eq!(evaluate_automation_points(&linear, 2.0), Some(1.0));

        let hold = vec![
            make_point(0.0, 0.25, "hold"),
            make_point(1.0, 0.75, "linear"),
        ];
        assert_eq!(evaluate_automation_points(&hold, 0.5), Some(0.25));

        let exponential = vec![
            make_point(0.0, 0.0, "exponential"),
            make_point(1.0, 1.0, "linear"),
        ];
        assert!((evaluate_automation_points(&exponential, 0.5).unwrap() - 0.25).abs() < 0.001);
    }

    #[test]
    fn test_evaluate_track_mix_applies_enabled_track_automation_only() {
        let mut track = make_track("track-a");
        track.volume = 0.8;
        track.pan = -0.25;
        track.automation = vec![
            MixAutomationLane {
                id: "volume-lane".into(),
                target: MixAutomationTarget::TrackVolume,
                enabled: true,
                points: vec![
                    make_point(0.0, 0.2, "linear"),
                    make_point(1.0, 1.0, "linear"),
                ],
            },
            MixAutomationLane {
                id: "pan-lane".into(),
                target: MixAutomationTarget::TrackPan,
                enabled: true,
                points: vec![
                    make_point(0.0, -1.0, "linear"),
                    make_point(1.0, 1.0, "linear"),
                ],
            },
            MixAutomationLane {
                id: "disabled-volume".into(),
                target: MixAutomationTarget::TrackVolume,
                enabled: false,
                points: vec![make_point(0.0, 2.0, "linear")],
            },
        ];

        let (volume, pan) = evaluate_track_mix(&track, 0.5);

        assert!((volume - 0.6).abs() < 0.001);
        assert!(pan.abs() < 0.001);
    }

    #[test]
    fn test_effect_parameter_automation_is_warned_and_ignored_by_track_mix() {
        let mut track = make_track("track-a");
        track.volume = 0.7;
        track.automation = vec![MixAutomationLane {
            id: "effect-lane".into(),
            target: MixAutomationTarget::EffectParam {
                effect_id: "fx-1".into(),
                param: "threshold".into(),
            },
            enabled: true,
            points: vec![make_point(0.0, -24.0, "linear")],
        }];

        let mixdown = AudioMixdown::new(make_config(vec![track.clone()]));
        let (volume, pan) = evaluate_track_mix(&track, 0.5);

        assert_eq!(volume, 0.7);
        assert_eq!(pan, 0.0);
        assert!(mixdown
            .warnings()
            .iter()
            .any(|warning| warning.contains("Unsupported effect automation")));
    }

    #[test]
    fn test_solo_mutes_others() {
        let config = make_config(vec![
            MixdownTrack {
                id: "a".into(),
                muted: false,
                solo: true,
                volume: 1.0,
                pan: 0.0,
                effect_chain: vec![],
                automation: vec![],
                elements: vec![],
            },
            MixdownTrack {
                id: "b".into(),
                muted: false,
                solo: false,
                volume: 1.0,
                pan: 0.0,
                effect_chain: vec![],
                automation: vec![],
                elements: vec![],
            },
        ]);
        let mixdown = AudioMixdown::new(config);
        assert!(!mixdown.is_track_muted(&mixdown.tracks[0]));
        assert!(mixdown.is_track_muted(&mixdown.tracks[1]));
    }

    #[test]
    fn test_element_fade_in() {
        let config = make_config(vec![]);
        let mixdown = AudioMixdown::new(config);
        let elem = MixdownElement {
            id: "e1".into(),
            src: "test.wav".into(),
            start_time: 0.0,
            duration: 10.0,
            trim_start: 0.0,
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 2.0,
            fade_out: 0.0,
            gain: 0.0,
        };
        let vol_at_0 = mixdown.compute_element_volume(&elem, 0.0);
        let vol_at_1 = mixdown.compute_element_volume(&elem, 1.0);
        let vol_at_2 = mixdown.compute_element_volume(&elem, 2.0);
        assert!(vol_at_0 < 0.01);
        assert!((vol_at_1 - 0.5).abs() < 0.01);
        assert!((vol_at_2 - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_element_gain_db() {
        let config = make_config(vec![]);
        let mixdown = AudioMixdown::new(config);
        let elem = MixdownElement {
            id: "e1".into(),
            src: "test.wav".into(),
            start_time: 0.0,
            duration: 10.0,
            trim_start: 0.0,
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 0.0,
            fade_out: 0.0,
            gain: 6.0,
        };
        let vol = mixdown.compute_element_volume(&elem, 5.0);
        assert!((vol - 2.0).abs() < 0.1, "+6dB ≈ 2x gain");
    }

    #[test]
    fn test_new_collects_unsupported_effect_warnings() {
        let mut config = make_config(vec![MixdownTrack {
            id: "track-a".into(),
            muted: false,
            solo: false,
            volume: 1.0,
            pan: 0.0,
            effect_chain: vec![AudioEffectConfig {
                id: "fx-missing".into(),
                effect_type: "spectral-wizard".into(),
                enabled: true,
                params: serde_json::json!({}),
            }],
            automation: vec![],
            elements: vec![],
        }]);
        config.master_effects = vec![AudioEffectConfig {
            id: "master-missing".into(),
            effect_type: "noise-reduction".into(),
            enabled: true,
            params: serde_json::json!({}),
        }];

        let mixdown = AudioMixdown::new(config);

        assert_eq!(mixdown.warnings().len(), 2);
        assert!(mixdown
            .warnings()
            .iter()
            .any(|w| w.contains("noise-reduction") && w.contains("master")));
        assert!(mixdown
            .warnings()
            .iter()
            .any(|w| w.contains("spectral-wizard") && w.contains("track-a")));
    }

    #[test]
    fn test_update_config_replaces_warning_lifecycle() {
        let mut mixdown = AudioMixdown::new(make_config(vec![]));
        assert!(mixdown.warnings().is_empty());

        let config_with_warning = make_config(vec![MixdownTrack {
            id: "track-a".into(),
            muted: false,
            solo: false,
            volume: 1.0,
            pan: 0.0,
            effect_chain: vec![AudioEffectConfig {
                id: "fx-missing".into(),
                effect_type: "missing-effect".into(),
                enabled: true,
                params: serde_json::json!({}),
            }],
            automation: vec![],
            elements: vec![],
        }]);
        let warnings = mixdown.update_config(config_with_warning);

        assert_eq!(warnings.len(), 1);
        assert_eq!(mixdown.warnings().len(), 1);

        let warnings = mixdown.update_config(make_config(vec![]));

        assert!(warnings.is_empty());
        assert!(mixdown.warnings().is_empty());
    }

    #[test]
    fn test_update_config_replaces_output_format() {
        let mut mixdown = AudioMixdown::new(make_config(vec![]));

        let mut updated = make_config(vec![]);
        updated.sample_rate = 44100;
        updated.channels = 1;

        let warnings = mixdown.update_config(updated);

        assert!(warnings.is_empty());
        assert_eq!(mixdown.sample_rate(), 44100);
        assert_eq!(mixdown.channels(), 1);
        let buf = mixdown.mix_buffer(0.0).unwrap();
        assert_eq!(buf.sample_rate, 44100);
        assert_eq!(buf.channels, 1);
        assert_eq!(buf.data.len(), mixdown.buffer_size());
    }

    #[test]
    fn test_update_config_warns_when_new_source_fails_to_open() {
        let mut mixdown = AudioMixdown::new(make_config(vec![]));
        let config = make_config(vec![MixdownTrack {
            id: "track-a".into(),
            muted: false,
            solo: false,
            volume: 1.0,
            pan: 0.0,
            effect_chain: vec![],
            automation: vec![],
            elements: vec![MixdownElement {
                id: "element-a".into(),
                src: "/path/that/does/not/exist.wav".into(),
                start_time: 0.0,
                duration: 1.0,
                trim_start: 0.0,
                volume: 1.0,
                pan: 0.0,
                muted: false,
                fade_in: 0.0,
                fade_out: 0.0,
                gain: 0.0,
            }],
        }]);

        let warnings = mixdown.update_config(config);

        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("failed to open during update"));
    }

    #[test]
    fn test_collect_source_entries_keeps_repeated_source_elements_independent() {
        let mixdown = AudioMixdown::new(make_config(vec![MixdownTrack {
            id: "track-a".into(),
            muted: false,
            solo: false,
            volume: 1.0,
            pan: 0.0,
            effect_chain: vec![],
            automation: vec![],
            elements: vec![
                MixdownElement {
                    id: "element-a".into(),
                    src: "shared.wav".into(),
                    start_time: 0.0,
                    duration: 1.0,
                    trim_start: 0.0,
                    volume: 1.0,
                    pan: 0.0,
                    muted: false,
                    fade_in: 0.0,
                    fade_out: 0.0,
                    gain: 0.0,
                },
                MixdownElement {
                    id: "element-b".into(),
                    src: "shared.wav".into(),
                    start_time: 1.0,
                    duration: 1.0,
                    trim_start: 0.0,
                    volume: 1.0,
                    pan: 0.0,
                    muted: false,
                    fade_in: 0.0,
                    fade_out: 0.0,
                    gain: 0.0,
                },
            ],
        }]));

        let entries = mixdown.collect_source_entries();

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "track-a:element-a");
        assert_eq!(entries[1].key, "track-a:element-b");
        assert_eq!(entries[0].src, "shared.wav");
        assert_eq!(entries[1].src, "shared.wav");
    }
}
