//! Host-facing kernel facade and service graph factory.
//!
//! The facade owns construction of the default kernel service graph. Host
//! crates receive typed handles from this boundary instead of wiring concrete
//! service implementations directly.

use std::sync::Arc;

use crate::error::Result;
use crate::services::{
    AudioService, EffectRegistry, EffectsService, ExportService, IAudioService, IEffectsService,
    IExportService, IImageService, INodeService, ITaskService, ITimelineService, IVideoService,
    ImageService, NodeService, TaskService, TimelineService, VideoService,
};
use neko_engine_gpu::GpuContext;

/// Typed handle bundle for the default kernel service graph.
#[derive(Clone)]
pub struct KernelServices {
    pub gpu_ctx: Option<Arc<GpuContext>>,
    pub task_service: Arc<dyn ITaskService>,
    pub node_service: Arc<dyn INodeService>,
    pub video_service: Arc<dyn IVideoService>,
    pub audio_service: Arc<dyn IAudioService>,
    pub image_service: Arc<dyn IImageService>,
    pub timeline_service: Arc<dyn ITimelineService>,
    pub export_service: Option<Arc<dyn IExportService>>,
    pub effects_service: Option<Arc<dyn IEffectsService>>,
    pub effect_registry: Arc<EffectRegistry>,
}

impl KernelServices {
    /// Returns true when the service graph has a GPU context.
    pub fn has_gpu(&self) -> bool {
        self.gpu_ctx.is_some()
    }
}

/// Constructs kernel service graphs for host-facing adapters.
#[derive(Debug, Default, Clone, Copy)]
pub struct ServiceFactory;

impl ServiceFactory {
    /// Create a default factory.
    pub fn new() -> Self {
        Self
    }

    /// Initialize GPU best-effort, preserving CPU-only fallback behavior.
    pub async fn initialize_gpu(&self) -> Option<Arc<GpuContext>> {
        match GpuContext::new().await {
            Ok(ctx) => Some(Arc::new(ctx)),
            Err(error) => {
                tracing::warn!(
                    "GPU initialization failed, running in CPU-only mode: {}",
                    error
                );
                None
            }
        }
    }

    /// Create the default service graph with best-effort GPU initialization.
    pub async fn create_default(&self) -> KernelServices {
        let gpu_ctx = self.initialize_gpu().await;
        self.create_with_gpu(gpu_ctx)
    }

    /// Create the default service graph with an injected optional GPU context.
    pub fn create_with_gpu(&self, gpu_ctx: Option<Arc<GpuContext>>) -> KernelServices {
        let task_service = Arc::new(TaskService::new());

        let mut node_service = NodeService::new(gpu_ctx.clone());
        node_service.set_task_service(task_service.clone());
        let node_service = Arc::new(node_service);

        let video_service = Arc::new(VideoService::new(gpu_ctx.clone(), task_service.clone()));
        let audio_service = Arc::new(AudioService::new(gpu_ctx.clone(), task_service.clone()));
        let image_service = Arc::new(ImageService::new(gpu_ctx.clone()));
        let timeline_service =
            Arc::new(TimelineService::new(gpu_ctx.clone(), task_service.clone()));

        let export_service: Option<Arc<dyn IExportService>> = gpu_ctx
            .as_ref()
            .map(|ctx| Arc::new(ExportService::new(Arc::clone(ctx))) as Arc<dyn IExportService>);
        let effects_service: Option<Arc<dyn IEffectsService>> =
            gpu_ctx
                .as_ref()
                .and_then(|ctx| match EffectsService::new(Arc::clone(ctx)) {
                    Ok(service) => Some(Arc::new(service) as Arc<dyn IEffectsService>),
                    Err(error) => {
                        tracing::warn!("Effects service initialization failed: {}", error);
                        None
                    }
                });
        let effect_registry = Arc::new(EffectRegistry::with_builtins());

        KernelServices {
            gpu_ctx,
            task_service: task_service as Arc<dyn ITaskService>,
            node_service: node_service as Arc<dyn INodeService>,
            video_service: video_service as Arc<dyn IVideoService>,
            audio_service: audio_service as Arc<dyn IAudioService>,
            image_service: image_service as Arc<dyn IImageService>,
            timeline_service: timeline_service as Arc<dyn ITimelineService>,
            export_service,
            effects_service,
            effect_registry,
        }
    }
}

/// Stable host-facing facade for kernel lifecycle and service access.
#[derive(Clone)]
pub struct EngineKernelFacade {
    services: KernelServices,
}

impl EngineKernelFacade {
    /// Create a facade using the default service graph.
    pub async fn new() -> Result<Self> {
        Ok(Self {
            services: ServiceFactory::new().create_default().await,
        })
    }

    /// Create a facade using an injected optional GPU context.
    pub fn with_gpu(gpu_ctx: Option<Arc<GpuContext>>) -> Self {
        Self {
            services: ServiceFactory::new().create_with_gpu(gpu_ctx),
        }
    }

    /// Create a facade from an already-built service graph.
    pub fn from_services(services: KernelServices) -> Self {
        Self { services }
    }

    /// Borrow the service bundle.
    pub fn services(&self) -> &KernelServices {
        &self.services
    }

    /// Clone the service bundle for controller/router construction.
    pub fn service_handles(&self) -> KernelServices {
        self.services.clone()
    }

    /// Returns true when the service graph has a GPU context.
    pub fn has_gpu(&self) -> bool {
        self.services.has_gpu()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_creates_cpu_only_service_graph_for_tests() {
        let services = ServiceFactory::new().create_with_gpu(None);

        assert!(!services.has_gpu());
        assert!(services.export_service.is_none());
        assert!(services.effects_service.is_none());
    }

    #[test]
    fn facade_exposes_service_handles() {
        let facade = EngineKernelFacade::with_gpu(None);

        assert!(!facade.has_gpu());
        assert!(Arc::strong_count(&facade.service_handles().task_service) >= 1);
    }
}
