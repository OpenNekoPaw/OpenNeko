//! Core trait for audio DSP effects.

/// A real-time audio effect processor.
///
/// Implementations must be `Send + Sync` so they can live inside
/// `AudioMixdown` which is shared across async tasks.
pub trait AudioEffect: Send + Sync {
    /// Process audio samples in-place.
    ///
    /// `buffer` contains interleaved samples for `channels` channels
    /// at the given `sample_rate`.
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32);

    /// Reset internal state (e.g. after a seek). Flushes delay lines,
    /// envelopes, filter histories, etc.
    fn reset(&mut self);

    /// Latency introduced by this effect, in samples. Used for
    /// delay compensation in the mix pipeline.
    fn latency_samples(&self) -> usize {
        0
    }
}
