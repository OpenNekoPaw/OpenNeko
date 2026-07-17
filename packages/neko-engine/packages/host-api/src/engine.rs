//! EngineApi - Main facade for all engine operations

use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use crate::preview::PreviewFileRegistry;
use crate::registry::{ResourceRegistry, StreamRegistry};
use crate::router::ActionRouter;
use crate::session::SessionManager;
use neko_engine_kernel::contracts::gpu::GpuContext;
use neko_engine_kernel::facade::EngineKernelFacade;
use neko_engine_types::{ActionRequest, ActionResponse, EngineConfig};
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Main facade for the Neko Engine API
///
/// Provides a unified interface for all engine operations.
/// This is the primary entry point for View layer adapters.
pub struct EngineApi {
    /// Action router
    router: ActionRouter,
    /// Resource registry
    resource_registry: Arc<ResourceRegistry>,
    /// Stream registry
    stream_registry: Arc<StreamRegistry>,
    /// Preview token/asset registry shared by ActionRouter and HTTP file routes
    preview_registry: Arc<PreviewFileRegistry>,
    /// Generic engine file access registry shared with preview compatibility routes
    file_access_registry: Arc<FileAccessRegistry>,
    /// Session manager
    session_manager: Arc<SessionManager>,
    /// Kernel service graph facade
    kernel_facade: EngineKernelFacade,
    /// Global HTTP admission semaphore — limits total concurrent requests
    admission_semaphore: Arc<Semaphore>,
    /// FFmpeg codec semaphore — limits concurrent probe/encode/decode
    codec_semaphore: Arc<Semaphore>,
    /// GPU operation semaphore — limits concurrent GPU submissions
    gpu_semaphore: Arc<Semaphore>,
}

impl EngineApi {
    /// Create a new EngineApi with GPU support and default config
    pub async fn new() -> ApiResult<Self> {
        Self::with_config(EngineConfig::default()).await
    }

    /// Create EngineApi with explicit configuration
    pub async fn with_config(config: EngineConfig) -> ApiResult<Self> {
        let kernel_facade = EngineKernelFacade::new().await?;
        Self::with_kernel_facade_and_config(kernel_facade, config)
    }

    /// Create EngineApi with optional GPU context (uses default config)
    pub fn with_gpu(gpu_ctx: Option<Arc<GpuContext>>) -> ApiResult<Self> {
        Self::with_gpu_and_config(gpu_ctx, EngineConfig::default())
    }

    /// Create EngineApi with optional GPU context and explicit config
    pub fn with_gpu_and_config(
        gpu_ctx: Option<Arc<GpuContext>>,
        config: EngineConfig,
    ) -> ApiResult<Self> {
        let kernel_facade = EngineKernelFacade::with_gpu(gpu_ctx);
        Self::with_kernel_facade_and_config(kernel_facade, config)
    }

    /// Create EngineApi with an already constructed kernel facade.
    pub fn with_kernel_facade_and_config(
        kernel_facade: EngineKernelFacade,
        config: EngineConfig,
    ) -> ApiResult<Self> {
        let kernel_services = kernel_facade.service_handles();

        // Create registries
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());
        let file_access_registry = Arc::new(FileAccessRegistry::new());
        let preview_registry = Arc::new(PreviewFileRegistry::from_file_access(
            file_access_registry.clone(),
        ));

        // Create session manager
        let session_manager = Arc::new(SessionManager::new(stream_registry.clone()));

        // Wire up stream count into NodeService for metrics reporting
        let active_streams_counter = kernel_services.node_service.active_streams_counter();
        let stream_registry_for_sync = stream_registry.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                interval.tick().await;
                let count = stream_registry_for_sync.active_count().await;
                active_streams_counter.store(count, std::sync::atomic::Ordering::Relaxed);
            }
        });

        // Create router
        let router = ActionRouter::new(
            kernel_services,
            resource_registry.clone(),
            stream_registry.clone(),
            preview_registry.clone(),
        );

        Ok(Self {
            router,
            resource_registry,
            stream_registry,
            preview_registry,
            file_access_registry,
            session_manager,
            kernel_facade,
            admission_semaphore: Arc::new(Semaphore::new(config.concurrency.admission)),
            codec_semaphore: Arc::new(Semaphore::new(config.concurrency.codec)),
            gpu_semaphore: Arc::new(Semaphore::new(config.concurrency.gpu)),
        })
    }

    /// Create EngineApi without GPU (for testing)
    pub fn without_gpu() -> ApiResult<Self> {
        Self::with_gpu(None)
    }

    /// Dispatch an action request
    ///
    /// This is the main entry point for all operations.
    pub async fn dispatch(&self, request: ActionRequest) -> ActionResponse {
        let request_id = request.id.clone();

        tracing::debug!("Dispatching {}:{}", request.group, request.action);

        match self.router.route(request).await {
            Ok(mut response) => {
                // Echo back the request ID
                if response.id.is_empty() && !request_id.is_empty() {
                    response.id = request_id;
                }
                response
            }
            Err(e) => {
                tracing::error!("Action failed: {}", e);
                ActionResponse::from_error(request_id, e.to_response())
            }
        }
    }

    /// Dispatch with JSON input/output (convenience method)
    pub async fn dispatch_json(&self, request_json: &str) -> String {
        let request: ActionRequest = match serde_json::from_str(request_json) {
            Ok(r) => r,
            Err(e) => {
                let error = ApiError::SerializationError(e.to_string());
                let response = ActionResponse::from_error("", error.to_response());
                return serde_json::to_string(&response).unwrap_or_default();
            }
        };

        let response = self.dispatch(request).await;
        serde_json::to_string(&response).unwrap_or_default()
    }

    /// Get the resource registry
    pub fn resource_registry(&self) -> &Arc<ResourceRegistry> {
        &self.resource_registry
    }

    /// Get the stream registry
    pub fn stream_registry(&self) -> &Arc<StreamRegistry> {
        &self.stream_registry
    }

    /// Get the preview file/token registry shared with host-http.
    pub fn preview_registry(&self) -> &Arc<PreviewFileRegistry> {
        &self.preview_registry
    }

    /// Get the generic file access registry shared with host-http.
    pub fn file_access_registry(&self) -> &Arc<FileAccessRegistry> {
        &self.file_access_registry
    }

    /// Configure the shared file access allow-list roots for HTTP/server adapters.
    ///
    /// Preview compatibility routes and generic `/v1/files/*` routes are backed
    /// by the same `FileAccessRegistry`, so this is the canonical server-start
    /// configuration entry point.
    pub fn set_preview_allowed_roots(&self, roots: Vec<std::path::PathBuf>) -> ApiResult<()> {
        self.preview_registry.set_allowed_roots(roots)
    }

    /// Configure file access allow-list roots directly.
    ///
    /// Prefer `set_preview_allowed_roots` during HTTP server startup so preview
    /// compatibility and generic file routes remain visibly tied together.
    pub fn set_file_access_allowed_roots(&self, roots: Vec<std::path::PathBuf>) -> ApiResult<()> {
        self.file_access_registry.set_allowed_roots(roots)
    }

    /// Get the session manager
    pub fn session_manager(&self) -> &Arc<SessionManager> {
        &self.session_manager
    }

    /// Get the global HTTP admission semaphore
    pub fn admission_semaphore(&self) -> &Arc<Semaphore> {
        &self.admission_semaphore
    }

    /// Get the FFmpeg codec semaphore
    pub fn codec_semaphore(&self) -> &Arc<Semaphore> {
        &self.codec_semaphore
    }

    /// Get the GPU operation semaphore
    pub fn gpu_semaphore(&self) -> &Arc<Semaphore> {
        &self.gpu_semaphore
    }

    /// Check if GPU is available
    pub fn has_gpu(&self) -> bool {
        self.kernel_facade.has_gpu()
    }

    /// Get list of supported groups
    pub fn groups(&self) -> Vec<&str> {
        self.router.groups()
    }

    /// Get list of supported actions for a group
    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        self.router.actions(group)
    }

    /// Start background cleanup tasks
    pub fn start_background_tasks(&self) -> Vec<tokio::task::JoinHandle<()>> {
        let mut handles = Vec::new();

        // Start stream cleanup task
        let stream_registry = self.stream_registry.clone();
        handles.push(stream_registry.start_cleanup_task());

        handles
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_engine_api_creation() {
        let api = EngineApi::without_gpu().unwrap();
        assert!(!api.has_gpu());
    }

    #[tokio::test]
    async fn test_engine_api_dispatch_health() {
        let api = EngineApi::without_gpu().unwrap();

        let request = ActionRequest::new("nodes", "health");

        let response = api.dispatch(request).await;
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_engine_api_dispatch_json() {
        let api = EngineApi::without_gpu().unwrap();

        let request_json = r#"{"group":"nodes","action":"health","options":null}"#;
        let response_json = api.dispatch_json(request_json).await;

        assert!(response_json.contains("\"status\":\"ok\""));
    }

    #[tokio::test]
    async fn test_engine_api_groups() {
        let api = EngineApi::without_gpu().unwrap();
        let groups = api.groups();

        assert!(groups.contains(&"nodes"));
        assert!(groups.contains(&"tasks"));
        assert!(groups.contains(&"videos"));
        assert!(groups.contains(&"audios"));
        assert!(groups.contains(&"images"));
        assert!(groups.contains(&"timelines"));
    }

    #[tokio::test]
    async fn test_engine_api_actions() {
        let api = EngineApi::without_gpu().unwrap();

        let node_actions = api.actions("nodes").unwrap();
        assert!(node_actions.contains(&"health"));
        assert!(node_actions.contains(&"metric"));
    }
}
