//! Task service trait

use crate::domain::{TaskConfig, TaskHandle};
use crate::error::Result;
use neko_engine_types::TaskProgress;
use tokio::sync::broadcast;

/// Task service interface
///
/// Manages long-running tasks: registration, progress tracking,
/// pause/resume/cancel operations.
#[allow(async_fn_in_trait)]
pub trait ITaskService: Send + Sync {
    /// Register a new task
    fn register(&self, config: TaskConfig) -> Result<TaskHandle>;

    /// Get task progress by ID
    fn probe(&self, task_id: &str) -> Result<TaskProgress>;

    /// Pause a running task
    fn pause(&self, task_id: &str) -> Result<()>;

    /// Resume a paused task
    fn resume(&self, task_id: &str) -> Result<()>;

    /// Cancel a task
    fn cancel(&self, task_id: &str) -> Result<()>;

    /// List all active tasks
    fn list(&self) -> Vec<TaskProgress>;

    /// Subscribe to task progress updates
    fn subscribe(&self, task_id: &str) -> Result<broadcast::Receiver<TaskProgress>>;

    /// Subscribe to all task updates
    fn subscribe_all(&self) -> broadcast::Receiver<TaskProgress>;
}
