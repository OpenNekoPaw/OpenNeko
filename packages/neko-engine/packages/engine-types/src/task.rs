//! Task types — progress tracking and task management

use serde::{Deserialize, Serialize};

/// Task type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    Export,
    Transcode,
    Waveform,
    Proxy,
    KeyframeScan,
    AudioExtract,
    FrameExtract,
}

/// Task state
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskState {
    #[default]
    Pending,
    Running,
    Paused,
    Completed,
    Cancelled,
    Error,
}

impl TaskState {
    /// Check if task is in a terminal state
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled | Self::Error)
    }

    /// Check if task can be paused
    pub fn can_pause(&self) -> bool {
        matches!(self, Self::Running)
    }

    /// Check if task can be resumed
    pub fn can_resume(&self) -> bool {
        matches!(self, Self::Paused)
    }

    /// Check if task can be cancelled
    pub fn can_cancel(&self) -> bool {
        !self.is_terminal()
    }
}

/// Task progress (tasks:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    /// Task ID
    pub task_id: String,
    /// Task type
    pub task_type: TaskType,
    /// Current state
    pub state: TaskState,
    /// Progress ratio (0.0 - 1.0)
    pub ratio: f64,
    /// Current unit (frame, sample, byte)
    pub current_unit: u64,
    /// Total units
    pub total_units: u64,
    /// Elapsed time in milliseconds
    pub elapsed_ms: u64,
    /// Estimated remaining time in milliseconds
    pub estimated_remaining_ms: u64,
    /// Error message (if state is Error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl TaskProgress {
    pub fn new(task_id: impl Into<String>, task_type: TaskType, total_units: u64) -> Self {
        Self {
            task_id: task_id.into(),
            task_type,
            state: TaskState::Pending,
            ratio: 0.0,
            current_unit: 0,
            total_units,
            elapsed_ms: 0,
            estimated_remaining_ms: 0,
            error: None,
            metadata: None,
        }
    }

    /// Update progress
    pub fn update(&mut self, current: u64, elapsed_ms: u64) {
        self.current_unit = current;
        self.elapsed_ms = elapsed_ms;
        self.ratio = if self.total_units > 0 {
            current as f64 / self.total_units as f64
        } else {
            0.0
        };

        // Estimate remaining time
        if self.ratio > 0.0 && self.ratio < 1.0 {
            let total_estimated = elapsed_ms as f64 / self.ratio;
            self.estimated_remaining_ms = (total_estimated - elapsed_ms as f64) as u64;
        } else {
            self.estimated_remaining_ms = 0;
        }
    }

    /// Mark as completed
    pub fn complete(&mut self) {
        self.state = TaskState::Completed;
        self.ratio = 1.0;
        self.current_unit = self.total_units;
        self.estimated_remaining_ms = 0;
    }

    /// Mark as error
    pub fn fail(&mut self, error: impl Into<String>) {
        self.state = TaskState::Error;
        self.error = Some(error.into());
    }

    /// Mark as cancelled
    pub fn cancel(&mut self) {
        self.state = TaskState::Cancelled;
    }

    /// Get progress percentage (0-100)
    pub fn percentage(&self) -> f64 {
        self.ratio * 100.0
    }
}

/// Task summary for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSummary {
    /// Task ID
    pub task_id: String,
    /// Task type
    pub task_type: TaskType,
    /// Current state
    pub state: TaskState,
    /// Progress ratio (0.0 - 1.0)
    pub ratio: f64,
    /// Created timestamp (Unix ms)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<u64>,
}

impl From<&TaskProgress> for TaskSummary {
    fn from(progress: &TaskProgress) -> Self {
        Self {
            task_id: progress.task_id.clone(),
            task_type: progress.task_type,
            state: progress.state,
            ratio: progress.ratio,
            created_at: None,
        }
    }
}
