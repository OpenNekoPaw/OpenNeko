//! NodeService implementation
//!
//! Provides system health monitoring and resource metrics.

use crate::error::Result;
use crate::monitor::SystemMonitor;
use crate::services::{GpuInfo, INodeService, ITaskService};
use async_trait::async_trait;
use neko_engine_gpu::GpuContext;
use neko_engine_types::{HealthStatus, ResourceSnapshot};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

/// NodeService implementation
///
/// Wraps SystemMonitor and GpuContext to provide health and metrics.
pub struct NodeService {
    /// System monitor for CPU/memory metrics
    monitor: Arc<Mutex<SystemMonitor>>,
    /// GPU context for GPU info
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Task service for active task count
    task_service: Option<Arc<dyn ITaskService + Send + Sync>>,
    /// Active stream count (set externally by Controller layer)
    active_streams: Arc<AtomicUsize>,
}

impl NodeService {
    /// Create a new NodeService
    pub fn new(gpu_ctx: Option<Arc<GpuContext>>) -> Self {
        Self {
            monitor: Arc::new(Mutex::new(SystemMonitor::new())),
            gpu_ctx,
            task_service: None,
            active_streams: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Set task service for active task count
    pub fn set_task_service(&mut self, task_service: Arc<dyn ITaskService + Send + Sync>) {
        self.task_service = Some(task_service);
    }

    /// Get the active streams counter (for external updates)
    #[allow(dead_code)]
    pub fn active_streams_counter(&self) -> Arc<AtomicUsize> {
        self.active_streams.clone()
    }
}

#[async_trait]
impl INodeService for NodeService {
    async fn health(&self) -> Result<HealthStatus> {
        let gpu_info = self.gpu_ctx.as_ref().map(|ctx| ctx.info());

        Ok(HealthStatus {
            gpu_available: self.gpu_ctx.is_some(),
            gpu_backend: gpu_info
                .as_ref()
                .map(|i| i.backend.clone())
                .unwrap_or_default(),
            gpu_name: gpu_info
                .as_ref()
                .map(|i| i.name.clone())
                .unwrap_or_default(),
            hw_decoders: self.get_hw_decoder_info(),
            hw_encoders: self.get_hw_encoder_info(),
            supported_codecs: vec![],
            zero_copy_supported: cfg!(target_os = "macos"),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
        })
    }

    async fn metrics(&self) -> Result<ResourceSnapshot> {
        let mut monitor = self.monitor.lock().await;
        let snapshot = monitor.sample();

        let active_tasks = self
            .task_service
            .as_ref()
            .map(|ts| ts.list().len() as u32)
            .unwrap_or(0);

        let active_streams = self.active_streams.load(Ordering::Relaxed) as u32;

        Ok(ResourceSnapshot {
            cpu_usage_percent: snapshot.cpu_usage_percent,
            gpu_usage_percent: snapshot.gpu_usage_percent,
            memory_bytes: snapshot.memory_bytes,
            vram_bytes: snapshot.vram_bytes,
            peak_memory_bytes: Some(monitor.peak_memory()),
            peak_vram_bytes: monitor.peak_vram(),
            active_tasks,
            active_streams,
            timestamp: Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            ),
        })
    }

    async fn gpu_info(&self) -> Result<GpuInfo> {
        match &self.gpu_ctx {
            Some(ctx) => {
                let info = ctx.info();
                Ok(GpuInfo {
                    name: info.name.clone(),
                    vendor: info.vendor.clone(),
                    driver: info.backend.clone(),
                    vram_bytes: 0, // wgpu doesn't expose VRAM size directly
                    hw_accel: self.get_hw_accel_names(),
                })
            }
            None => Ok(GpuInfo {
                name: "No GPU".to_string(),
                vendor: "Unknown".to_string(),
                driver: "None".to_string(),
                vram_bytes: 0,
                hw_accel: vec![],
            }),
        }
    }

    fn active_streams_counter(&self) -> Arc<AtomicUsize> {
        self.active_streams.clone()
    }
}

impl NodeService {
    /// Get hardware acceleration names based on platform
    fn get_hw_accel_names(&self) -> Vec<String> {
        let mut accel = Vec::new();

        #[cfg(target_os = "macos")]
        {
            accel.push("VideoToolbox".to_string());
        }

        #[cfg(target_os = "linux")]
        {
            accel.push("VAAPI".to_string());
        }

        #[cfg(target_os = "windows")]
        {
            accel.push("D3D11VA".to_string());
            accel.push("NVENC".to_string());
        }

        accel
    }

    /// Get hardware decoder info
    fn get_hw_decoder_info(&self) -> Vec<neko_engine_types::HwAccelInfo> {
        let mut decoders = Vec::new();

        #[cfg(target_os = "macos")]
        {
            decoders.push(neko_engine_types::HwAccelInfo {
                name: "VideoToolbox".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string(), "prores".to_string()],
            });
        }

        #[cfg(target_os = "linux")]
        {
            decoders.push(neko_engine_types::HwAccelInfo {
                name: "VAAPI".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string()],
            });
        }

        #[cfg(target_os = "windows")]
        {
            decoders.push(neko_engine_types::HwAccelInfo {
                name: "D3D11VA".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string()],
            });
        }

        decoders
    }

    /// Get hardware encoder info
    fn get_hw_encoder_info(&self) -> Vec<neko_engine_types::HwAccelInfo> {
        let mut encoders = Vec::new();

        #[cfg(target_os = "macos")]
        {
            encoders.push(neko_engine_types::HwAccelInfo {
                name: "VideoToolbox".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string(), "prores".to_string()],
            });
        }

        #[cfg(target_os = "linux")]
        {
            encoders.push(neko_engine_types::HwAccelInfo {
                name: "VAAPI".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string()],
            });
        }

        #[cfg(target_os = "windows")]
        {
            encoders.push(neko_engine_types::HwAccelInfo {
                name: "NVENC".to_string(),
                available: true,
                codecs: vec!["h264".to_string(), "hevc".to_string()],
            });
        }

        encoders
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_node_service_health() {
        let service = NodeService::new(None);
        let health = service.health().await.unwrap();
        assert!(!health.gpu_available);
    }

    #[tokio::test]
    async fn test_node_service_metrics() {
        let service = NodeService::new(None);
        let metrics = service.metrics().await.unwrap();
        assert!(metrics.memory_bytes > 0);
    }

    #[tokio::test]
    async fn test_node_service_gpu_info_no_gpu() {
        let service = NodeService::new(None);
        let info = service.gpu_info().await.unwrap();
        assert_eq!(info.name, "No GPU");
    }
}
