//! Stream types — session and playback control

use serde::{Deserialize, Serialize};

use crate::Resolution;

/// Stream session handle (returned by timelines:stream / videos:stream)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamSession {
    /// Unique stream identifier (for signal targeting)
    pub stream_id: String,
    /// Parent session ID
    pub session_id: String,
    /// WebSocket port for frame streaming
    pub ws_port: u16,
    /// WebSocket endpoint path
    pub ws_endpoint: String,
    /// Stream resolution
    pub resolution: Resolution,
    /// Stream frame rate
    pub fps: f64,
}

/// Loop region for playback
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopRegion {
    /// Loop start time (seconds)
    pub in_point: f64,
    /// Loop end time (seconds)
    pub out_point: f64,
    /// Loop count
    pub count: LoopCount,
}

impl LoopRegion {
    pub fn new(in_point: f64, out_point: f64) -> Self {
        Self {
            in_point,
            out_point,
            count: LoopCount::Infinite,
        }
    }

    pub fn with_count(mut self, count: u32) -> Self {
        self.count = LoopCount::Finite(count);
        self
    }

    pub fn duration(&self) -> f64 {
        self.out_point - self.in_point
    }
}

/// Loop count
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LoopCount {
    Finite(u32),
    #[default]
    Infinite,
}

/// Stream codec type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamCodec {
    #[default]
    H264,
    Raw,
}

/// Playback speed
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSpeed {
    pub rate: f64,
}

impl PlaybackSpeed {
    pub fn new(rate: f64) -> Self {
        Self {
            rate: rate.clamp(0.1, 16.0),
        }
    }

    pub fn normal() -> Self {
        Self { rate: 1.0 }
    }

    pub fn half() -> Self {
        Self { rate: 0.5 }
    }

    pub fn double() -> Self {
        Self { rate: 2.0 }
    }
}

impl Default for PlaybackSpeed {
    fn default() -> Self {
        Self::normal()
    }
}
