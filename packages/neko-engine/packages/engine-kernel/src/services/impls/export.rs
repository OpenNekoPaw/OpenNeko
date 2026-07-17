//! ExportService implementation
//!
//! Wraps the infrastructure-layer `export::ExportService` to implement
//! the `IExportService` trait for the MVC architecture.

use std::sync::Arc;

use crate::error::Result;
use crate::export::{ExportJobConfig, ExportProgress, ExportStartResponse, QueueEntry};
use crate::services::IExportService;
use async_trait::async_trait;
use neko_engine_gpu::GpuContext;

/// Export service implementation
///
/// Delegates to the infrastructure-layer `export::ExportService` for actual
/// GPU-accelerated export pipeline execution.
pub struct ExportService {
    inner: Arc<crate::export::ExportService>,
}

impl ExportService {
    /// Create a new export service with GPU context.
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        let inner = Arc::new(crate::export::ExportService::with_gpu_context(gpu_ctx));
        Self { inner }
    }
}

#[async_trait]
impl IExportService for ExportService {
    async fn start(&self, config: ExportJobConfig) -> Result<ExportStartResponse> {
        self.inner.start_export(config).await
    }

    async fn enqueue(&self, config: ExportJobConfig) -> Result<String> {
        self.inner.enqueue_export(config).await
    }

    async fn progress(&self, job_id: &str) -> Option<ExportProgress> {
        self.inner.get_progress(job_id).await
    }

    async fn cancel(&self, job_id: &str) -> Result<bool> {
        Ok(self.inner.cancel_export(job_id).await)
    }

    async fn list_queue(&self) -> Vec<QueueEntry> {
        self.inner.list_queue().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ExportService requires GPU context, so we can only test construction logic
    // in integration tests. Unit tests verify the type relationships.

    #[test]
    fn test_export_service_trait_object() {
        // Verify ExportService implements IExportService (compile-time check)
        fn _assert_impl<T: IExportService>() {}
        _assert_impl::<ExportService>();
    }
}
