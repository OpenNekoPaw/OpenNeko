//! Node service trait

use crate::error::Result;
use async_trait::async_trait;
use neko_engine_types::{HealthStatus, ResourceSnapshot};
use serde::Serialize;
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;

/// Node service interface
///
/// Handles system health monitoring and resource metrics.
#[async_trait]
pub trait INodeService: Send + Sync {
    /// Get system health status
    async fn health(&self) -> Result<HealthStatus>;

    /// Get current resource metrics (CPU, memory, GPU)
    async fn metrics(&self) -> Result<ResourceSnapshot>;

    /// Get GPU information
    async fn gpu_info(&self) -> Result<GpuInfo>;

    /// Counter used by host registries to report active stream count in metrics.
    fn active_streams_counter(&self) -> Arc<AtomicUsize>;
}

/// GPU information
#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    /// GPU device name
    pub name: String,
    /// GPU vendor
    pub vendor: String,
    /// GPU driver version
    pub driver: String,
    /// Available VRAM in bytes
    pub vram_bytes: u64,
    /// Supported hardware acceleration types
    pub hw_accel: Vec<String>,
}
