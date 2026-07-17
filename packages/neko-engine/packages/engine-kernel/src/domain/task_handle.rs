//! Task handle for progress reporting

use neko_engine_types::{TaskProgress, TaskState, TaskType};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::broadcast;

/// Task configuration for registration
#[derive(Debug, Clone)]
pub struct TaskConfig {
    /// Task ID
    pub id: String,
    /// Task type
    pub task_type: TaskType,
    /// Total units (frames, samples, bytes)
    pub total_units: u64,
}

impl TaskConfig {
    pub fn new(id: impl Into<String>, task_type: TaskType, total_units: u64) -> Self {
        Self {
            id: id.into(),
            task_type,
            total_units,
        }
    }

    pub fn export(id: impl Into<String>, total_frames: u64) -> Self {
        Self::new(id, TaskType::Export, total_frames)
    }

    pub fn transcode(id: impl Into<String>, total_frames: u64) -> Self {
        Self::new(id, TaskType::Transcode, total_frames)
    }

    pub fn waveform(id: impl Into<String>, total_samples: u64) -> Self {
        Self::new(id, TaskType::Waveform, total_samples)
    }

    pub fn proxy(id: impl Into<String>, total_frames: u64) -> Self {
        Self::new(id, TaskType::Proxy, total_frames)
    }
}

/// Task handle for progress reporting (used by Service implementations)
///
/// This handle is given to long-running operations so they can report progress
/// and check for cancellation.
#[derive(Clone)]
pub struct TaskHandle {
    /// Task ID
    id: String,
    /// Task type
    task_type: TaskType,
    /// Total units
    total_units: u64,
    /// Current progress (atomic for lock-free updates)
    current_unit: Arc<AtomicU64>,
    /// Cancellation flag
    cancel_flag: Arc<AtomicBool>,
    /// Pause flag
    pause_flag: Arc<AtomicBool>,
    /// Progress broadcast sender
    progress_tx: broadcast::Sender<TaskProgress>,
    /// Start time
    start_time: Instant,
}

impl TaskHandle {
    /// Create a new task handle
    pub fn new(config: TaskConfig) -> (Self, broadcast::Receiver<TaskProgress>) {
        let (progress_tx, progress_rx) = broadcast::channel(16);

        let handle = Self {
            id: config.id,
            task_type: config.task_type,
            total_units: config.total_units,
            current_unit: Arc::new(AtomicU64::new(0)),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            progress_tx,
            start_time: Instant::now(),
        };

        (handle, progress_rx)
    }

    /// Get task ID
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Get task type
    pub fn task_type(&self) -> TaskType {
        self.task_type
    }

    /// Report progress
    pub fn report_progress(&self, current: u64) {
        self.current_unit.store(current, Ordering::Relaxed);

        let progress = self.build_progress(TaskState::Running);
        let _ = self.progress_tx.send(progress);
    }

    /// Report completion
    pub fn report_complete(&self) {
        self.current_unit.store(self.total_units, Ordering::Relaxed);

        let progress = self.build_progress(TaskState::Completed);
        let _ = self.progress_tx.send(progress);
    }

    /// Report error
    pub fn report_error(&self, error: impl Into<String>) {
        let mut progress = self.build_progress(TaskState::Error);
        progress.error = Some(error.into());
        let _ = self.progress_tx.send(progress);
    }

    /// Check if task is cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    /// Check if task is paused
    pub fn is_paused(&self) -> bool {
        self.pause_flag.load(Ordering::Relaxed)
    }

    /// Request cancellation
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
    }

    /// Request pause
    pub fn pause(&self) {
        self.pause_flag.store(true, Ordering::Relaxed);
    }

    /// Resume from pause
    pub fn resume(&self) {
        self.pause_flag.store(false, Ordering::Relaxed);
    }

    /// Get current progress
    pub fn current_progress(&self) -> TaskProgress {
        let state = if self.is_cancelled() {
            TaskState::Cancelled
        } else if self.is_paused() {
            TaskState::Paused
        } else {
            TaskState::Running
        };
        self.build_progress(state)
    }

    /// Subscribe to progress updates
    pub fn subscribe(&self) -> broadcast::Receiver<TaskProgress> {
        self.progress_tx.subscribe()
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> u64 {
        self.start_time.elapsed().as_millis() as u64
    }

    /// Build progress struct
    fn build_progress(&self, state: TaskState) -> TaskProgress {
        let current = self.current_unit.load(Ordering::Relaxed);
        let elapsed_ms = self.elapsed_ms();

        let ratio = if self.total_units > 0 {
            current as f64 / self.total_units as f64
        } else {
            0.0
        };

        let estimated_remaining_ms = if ratio > 0.0 && ratio < 1.0 {
            let total_estimated = elapsed_ms as f64 / ratio;
            (total_estimated - elapsed_ms as f64) as u64
        } else {
            0
        };

        TaskProgress {
            task_id: self.id.clone(),
            task_type: self.task_type,
            state,
            ratio,
            current_unit: current,
            total_units: self.total_units,
            elapsed_ms,
            estimated_remaining_ms,
            error: None,
            metadata: None,
        }
    }
}

impl std::fmt::Debug for TaskHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TaskHandle")
            .field("id", &self.id)
            .field("task_type", &self.task_type)
            .field("total_units", &self.total_units)
            .field("current_unit", &self.current_unit.load(Ordering::Relaxed))
            .field("cancelled", &self.is_cancelled())
            .field("paused", &self.is_paused())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_handle_progress() {
        let config = TaskConfig::export("test-job", 100);
        let (handle, _rx) = TaskHandle::new(config);

        handle.report_progress(50);

        let progress = handle.current_progress();
        assert_eq!(progress.task_id, "test-job");
        assert_eq!(progress.current_unit, 50);
        assert_eq!(progress.total_units, 100);
        assert!((progress.ratio - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_task_handle_cancellation() {
        let config = TaskConfig::export("test-job", 100);
        let (handle, _rx) = TaskHandle::new(config);

        assert!(!handle.is_cancelled());
        handle.cancel();
        assert!(handle.is_cancelled());
    }

    #[test]
    fn test_task_handle_pause_resume() {
        let config = TaskConfig::export("test-job", 100);
        let (handle, _rx) = TaskHandle::new(config);

        assert!(!handle.is_paused());
        handle.pause();
        assert!(handle.is_paused());
        handle.resume();
        assert!(!handle.is_paused());
    }
}
