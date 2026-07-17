//! Export service trait
//!
//! Defines the interface for timeline export operations.
//! The service manages export jobs identified by job_id, supporting
//! start, progress query, cancellation, and FIFO queue support.

use crate::error::Result;
use crate::export::{ExportJobConfig, ExportProgress, ExportStartResponse, QueueEntry};
use async_trait::async_trait;

/// Export service interface
///
/// Handles timeline export to video files with progress reporting.
/// Each export job is identified by a unique job_id.
#[async_trait]
pub trait IExportService: Send + Sync {
    /// Start an export job immediately
    ///
    /// Returns the job_id and total frames for progress tracking.
    async fn start(&self, config: ExportJobConfig) -> Result<ExportStartResponse>;

    /// Enqueue an export job — returns the job_id immediately.
    ///
    /// If no job is currently running, the job starts right away.
    /// Otherwise it is placed at the back of the FIFO queue.
    async fn enqueue(&self, config: ExportJobConfig) -> Result<String>;

    /// Get export progress by job_id
    async fn progress(&self, job_id: &str) -> Option<ExportProgress>;

    /// Cancel an export job
    async fn cancel(&self, job_id: &str) -> Result<bool>;

    /// List all queued (pending + active) jobs
    async fn list_queue(&self) -> Vec<QueueEntry>;
}
