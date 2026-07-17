//! Ordered chain of audio effects, processed in sequence.

use super::traits::AudioEffect;

pub struct EffectChain {
    effects: Vec<(String, bool, Box<dyn AudioEffect>)>, // (id, enabled, effect)
}

impl EffectChain {
    pub fn new() -> Self {
        Self {
            effects: Vec::new(),
        }
    }

    pub fn push(&mut self, id: String, enabled: bool, effect: Box<dyn AudioEffect>) {
        self.effects.push((id, enabled, effect));
    }

    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }

    pub fn len(&self) -> usize {
        self.effects.len()
    }
}

impl AudioEffect for EffectChain {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        for (_, enabled, effect) in &mut self.effects {
            if *enabled {
                effect.process(buffer, channels, sample_rate);
            }
        }
    }

    fn reset(&mut self) {
        for (_, _, effect) in &mut self.effects {
            effect.reset();
        }
    }

    fn latency_samples(&self) -> usize {
        self.effects
            .iter()
            .filter(|(_, enabled, _)| *enabled)
            .map(|(_, _, e)| e.latency_samples())
            .sum()
    }
}

impl Default for EffectChain {
    fn default() -> Self {
        Self::new()
    }
}
