//! TaskService implementation
//!
//! Provides unified task lifecycle management for long-running operations.

use crate::domain::{TaskConfig, TaskHandle};
use crate::error::{Error, Result};
use crate::services::ITaskService;
use neko_engine_types::TaskProgress;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

/// TaskService implementation
///
/// Manages task registration, progress tracking, and lifecycle control.
pub struct TaskService {
    /// Active tasks by ID
    tasks: Arc<RwLock<HashMap<String, TaskHandle>>>,
    /// Global progress broadcast for all tasks
    global_tx: broadcast::Sender<TaskProgress>,
}

impl TaskService {
    /// Create a new TaskService
    pub fn new() -> Self {
        let (global_tx, _) = broadcast::channel(256);
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            global_tx,
        }
    }

    /// Internal: forward task progress to global channel
    async fn forward_progress(&self, task_id: String, mut rx: broadcast::Receiver<TaskProgress>) {
        let global_tx = self.global_tx.clone();
        let tasks = self.tasks.clone();

        tokio::spawn(async move {
            while let Ok(progress) = rx.recv().await {
                // Forward to global channel
                let _ = global_tx.send(progress.clone());

                // Remove task if completed/cancelled/error
                if progress.state.is_terminal() {
                    let mut tasks = tasks.write().await;
                    tasks.remove(&task_id);
                }
            }
        });
    }
}

impl Default for TaskService {
    fn default() -> Self {
        Self::new()
    }
}

impl ITaskService for TaskService {
    fn register(&self, config: TaskConfig) -> Result<TaskHandle> {
        let (handle, rx) = TaskHandle::new(config.clone());
        let task_id = handle.id().to_string();

        // Store handle
        let tasks = self.tasks.clone();
        let task_id_clone = task_id.clone();
        let handle_clone = handle.clone();

        tokio::spawn(async move {
            let mut tasks = tasks.write().await;
            tasks.insert(task_id_clone, handle_clone);
        });

        // Start forwarding progress
        let self_clone = Self {
            tasks: self.tasks.clone(),
            global_tx: self.global_tx.clone(),
        };
        tokio::spawn(async move {
            self_clone.forward_progress(task_id, rx).await;
        });

        Ok(handle)
    }

    fn probe(&self, task_id: &str) -> Result<TaskProgress> {
        let tasks = self
            .tasks
            .try_read()
            .map_err(|_| Error::Other("Task lock busy".to_string()))?;
        match tasks.get(task_id) {
            Some(handle) => Ok(handle.current_progress()),
            None => Err(Error::NotFound(format!("Task not found: {}", task_id))),
        }
    }

    fn pause(&self, task_id: &str) -> Result<()> {
        let tasks = self
            .tasks
            .try_read()
            .map_err(|_| Error::Other("Task lock busy".to_string()))?;
        match tasks.get(task_id) {
            Some(handle) => {
                handle.pause();
                Ok(())
            }
            None => Err(Error::NotFound(format!("Task not found: {}", task_id))),
        }
    }

    fn resume(&self, task_id: &str) -> Result<()> {
        let tasks = self
            .tasks
            .try_read()
            .map_err(|_| Error::Other("Task lock busy".to_string()))?;
        match tasks.get(task_id) {
            Some(handle) => {
                handle.resume();
                Ok(())
            }
            None => Err(Error::NotFound(format!("Task not found: {}", task_id))),
        }
    }

    fn cancel(&self, task_id: &str) -> Result<()> {
        let tasks = self
            .tasks
            .try_read()
            .map_err(|_| Error::Other("Task lock busy".to_string()))?;
        match tasks.get(task_id) {
            Some(handle) => {
                handle.cancel();
                Ok(())
            }
            None => Err(Error::NotFound(format!("Task not found: {}", task_id))),
        }
    }

    fn list(&self) -> Vec<TaskProgress> {
        match self.tasks.try_read() {
            Ok(tasks) => tasks.values().map(|h| h.current_progress()).collect(),
            Err(_) => vec![],
        }
    }

    fn subscribe(&self, task_id: &str) -> Result<broadcast::Receiver<TaskProgress>> {
        let tasks = self
            .tasks
            .try_read()
            .map_err(|_| Error::Other("Task lock busy".to_string()))?;
        match tasks.get(task_id) {
            Some(handle) => Ok(handle.subscribe()),
            None => Err(Error::NotFound(format!("Task not found: {}", task_id))),
        }
    }

    fn subscribe_all(&self) -> broadcast::Receiver<TaskProgress> {
        self.global_tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::TaskType;

    #[test]
    fn test_task_service_creation() {
        let service = TaskService::new();
        assert!(service.list().is_empty());
    }

    #[tokio::test]
    async fn test_task_registration() {
        let service = TaskService::new();
        let config = TaskConfig::new("test-task", TaskType::Export, 100);

        let handle = service.register(config).unwrap();
        assert_eq!(handle.id(), "test-task");
    }

    #[test]
    fn test_task_not_found() {
        let service = TaskService::new();
        let result = service.probe("nonexistent");
        assert!(result.is_err());
    }
}
