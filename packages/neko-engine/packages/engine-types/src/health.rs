//! Health and monitoring types

use serde::{Deserialize, Serialize};

/// Health check result (nodes:health response)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    /// Whether GPU is available
    pub gpu_available: bool,
    /// GPU backend (Metal, Vulkan, DX12)
    pub gpu_backend: String,
    /// GPU device name
    pub gpu_name: String,
    /// Available hardware decoders
    #[serde(default)]
    pub hw_decoders: Vec<HwAccelInfo>,
    /// Available hardware encoders
    #[serde(default)]
    pub hw_encoders: Vec<HwAccelInfo>,
    /// Supported codecs
    #[serde(default)]
    pub supported_codecs: Vec<CodecSupport>,
    /// Whether zero-copy GPU encoding is supported
    pub zero_copy_supported: bool,
    /// Engine version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// Hardware acceleration info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HwAccelInfo {
    /// Accelerator name (VideoToolbox, NVENC, VAAPI, etc.)
    pub name: String,
    /// Whether it's available
    pub available: bool,
    /// Supported codecs
    #[serde(default)]
    pub codecs: Vec<String>,
}

/// Codec support info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecSupport {
    /// Codec name
    pub codec: String,
    /// Decode support
    pub decode: bool,
    /// Encode support
    pub encode: bool,
    /// Hardware acceleration available
    pub hw_accel: bool,
}

/// Resource metrics snapshot (nodes:metric response)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    /// CPU usage percentage (0.0 - 100.0)
    pub cpu_usage_percent: f64,
    /// GPU usage percentage (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_usage_percent: Option<f64>,
    /// Memory usage in bytes
    pub memory_bytes: u64,
    /// VRAM usage in bytes (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_bytes: Option<u64>,
    /// Peak memory usage in bytes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_memory_bytes: Option<u64>,
    /// Peak VRAM usage in bytes (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak_vram_bytes: Option<u64>,
    /// Number of active tasks
    pub active_tasks: u32,
    /// Number of active streams
    pub active_streams: u32,
    /// Timestamp (Unix ms)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

impl ResourceSnapshot {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cpu(mut self, percent: f64) -> Self {
        self.cpu_usage_percent = percent;
        self
    }

    pub fn with_memory(mut self, bytes: u64) -> Self {
        self.memory_bytes = bytes;
        self
    }

    pub fn with_gpu(mut self, percent: f64) -> Self {
        self.gpu_usage_percent = Some(percent);
        self
    }

    pub fn with_vram(mut self, bytes: u64) -> Self {
        self.vram_bytes = Some(bytes);
        self
    }
}
