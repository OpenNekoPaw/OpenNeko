//! Loudness analysis types (ITU-R BS.1770-4 / EBU R128)

use serde::{Deserialize, Serialize};

/// Result of loudness analysis for a single audio source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessAnalysis {
    /// Integrated loudness in LUFS (ITU-R BS.1770-4).
    /// Represents the overall perceived loudness of the entire file.
    /// Range: typically -70 to 0 LUFS
    pub integrated_lufs: f64,

    /// True peak level in dBFS (ITU-R BS.1770-4).
    /// Maximum inter-sample peak across all channels.
    /// Range: typically -70 to +3 dBFS
    pub true_peak_dbfs: f64,

    /// Loudness Range (LRA) in LU (EBU R128 / ITU-R BS.1770-4).
    /// Describes the dynamic range of the audio.
    /// Range: typically 0 to 30 LU
    pub loudness_range: f64,

    /// Recommended gain adjustment in dB to reach target LUFS.
    /// Calculated as: target_lufs - integrated_lufs, clamped to [-60, +60].
    /// Applying this gain via AudioProperties.gain achieves loudness normalization.
    pub recommended_gain: f64,

    /// Target LUFS used for recommended_gain calculation
    pub target_lufs: f64,
}
