//! Silence detection types

use serde::{Deserialize, Serialize};

/// A contiguous region of silence in the audio
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceRegion {
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
    /// Duration in seconds (end - start)
    pub duration: f64,
}

/// Result of silence detection for an audio source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceAnalysis {
    /// Total duration of the audio in seconds
    pub total_duration: f64,
    /// Total silence duration in seconds
    pub silence_duration: f64,
    /// Ratio of silence to total duration (0.0 - 1.0)
    pub silence_ratio: f64,
    /// Number of silent regions detected
    pub region_count: usize,
    /// Individual silence regions sorted by start time
    pub regions: Vec<SilenceRegion>,
    /// Threshold used for detection in dBFS
    pub threshold_dbfs: f64,
    /// Minimum duration used for detection in seconds
    pub min_duration: f64,
}
