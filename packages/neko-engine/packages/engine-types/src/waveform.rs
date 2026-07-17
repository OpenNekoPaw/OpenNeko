//! Waveform types

use serde::{Deserialize, Serialize};

/// Waveform peak data for timeline visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformData {
    /// Sample rate of source audio
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Peaks per second (resolution)
    pub peaks_per_second: u32,
    /// Duration in seconds
    pub duration: f64,
    /// Per-channel peak arrays: peaks[channel][sample_index]
    pub peaks: Vec<Vec<f32>>,
}

impl WaveformData {
    pub fn new(sample_rate: u32, channels: u16, peaks_per_second: u32, duration: f64) -> Self {
        let num_peaks = (duration * peaks_per_second as f64).ceil() as usize;
        let peaks = (0..channels as usize)
            .map(|_| vec![0.0; num_peaks])
            .collect();

        Self {
            sample_rate,
            channels,
            peaks_per_second,
            duration,
            peaks,
        }
    }

    /// Get total number of peak samples
    pub fn num_peaks(&self) -> usize {
        self.peaks.first().map(|p| p.len()).unwrap_or(0)
    }

    /// Get peak at time for a specific channel
    pub fn peak_at(&self, channel: usize, time: f64) -> Option<f32> {
        let index = (time * self.peaks_per_second as f64) as usize;
        self.peaks.get(channel).and_then(|p| p.get(index).copied())
    }
}

/// Waveform output format
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaveformFormat {
    #[default]
    Json,
    Binary,
}
