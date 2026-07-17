//! Soft GPU budget controller shared by interactive, export, and transcode paths.
//!
//! The controller is intentionally policy-only: it does not serialize wgpu work
//! behind a hard lock. Callers acquire a permit before render-loop GPU work and
//! report timing afterward so the policy can pause lower-priority producers.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

/// GPU pipeline priority class.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PipelinePriority {
    /// Interactive viewport or timeline preview work. Always proceeds.
    Interactive,
    /// Export work. May be queued fairly while interactive work is under pressure.
    Export,
    /// Transcode and GPU preview-provider work. May pause until recovery.
    Transcode,
}

impl PipelinePriority {
    fn weight(self) -> f64 {
        match self {
            Self::Interactive => 1.0,
            Self::Export => 0.65,
            Self::Transcode => 0.45,
        }
    }
}

/// Permit decision returned by [`GpuBudgetController::acquire_permit`].
#[derive(Debug, Clone, PartialEq)]
pub enum GpuPermit {
    /// Caller can run GPU work now.
    Proceed,
    /// Caller should wait for FIFO export turn or recovery.
    Queued {
        /// One-based position in the export queue.
        position: usize,
        /// Suggested retry interval.
        retry_after: Duration,
    },
    /// Caller should pause until the controller notifies recovery.
    Paused {
        /// Suggested retry interval for retryable preview artifacts or polling callers.
        retry_after: Duration,
        /// Monotonic recovery generation, useful for diagnostics.
        generation: u64,
    },
}

/// Runtime snapshot of budget pressure signals.
#[derive(Debug, Clone, PartialEq)]
pub struct GpuBudgetSnapshot {
    /// Whether sustained pressure is currently active.
    pub under_pressure: bool,
    /// Weighted frame-time EMA across known pipelines.
    pub global_frame_time_ema: Option<Duration>,
    /// Interactive frame-time EMA across known interactive pipelines.
    pub interactive_frame_time_ema: Option<Duration>,
    /// Weighted queue-completion-delay EMA across known pipelines.
    pub queue_completion_delay_ema: Option<Duration>,
    /// Number of consecutive pressure samples.
    pub pressure_samples: u32,
    /// Number of consecutive recovery samples.
    pub recovery_samples: u32,
    /// Number of queued export pipeline ids.
    pub queued_exports: usize,
    /// Monotonic recovery generation.
    pub generation: u64,
}

/// Soft budget policy configuration.
#[derive(Debug, Clone, PartialEq)]
pub struct GpuBudgetConfig {
    /// EMA smoothing factor in the range `(0, 1]`.
    pub ema_alpha: f64,
    /// Interactive frame-time threshold required to enter pressure.
    pub interactive_pressure_threshold: Duration,
    /// Weighted global frame-time threshold required to enter pressure.
    pub global_pressure_threshold: Duration,
    /// Queue-completion-delay threshold required to enter pressure.
    pub queue_delay_pressure_threshold: Duration,
    /// Interactive/global frame-time threshold required for recovery.
    pub recovery_frame_time_threshold: Duration,
    /// Queue-completion-delay threshold required for recovery.
    pub queue_delay_recovery_threshold: Duration,
    /// Consecutive pressure samples required before pausing lower-priority work.
    pub pressure_window_samples: u32,
    /// Consecutive recovery samples required before resuming paused work.
    pub recovery_window_samples: u32,
    /// Retry hint returned for queued export work.
    pub export_retry_after: Duration,
    /// Retry hint returned for paused transcode/preview-provider work.
    pub transcode_retry_after: Duration,
}

impl Default for GpuBudgetConfig {
    fn default() -> Self {
        Self {
            ema_alpha: 0.25,
            interactive_pressure_threshold: Duration::from_millis(24),
            global_pressure_threshold: Duration::from_millis(30),
            queue_delay_pressure_threshold: Duration::from_millis(8),
            recovery_frame_time_threshold: Duration::from_millis(17),
            queue_delay_recovery_threshold: Duration::from_millis(2),
            pressure_window_samples: 3,
            recovery_window_samples: 5,
            export_retry_after: Duration::from_millis(8),
            transcode_retry_after: Duration::from_millis(50),
        }
    }
}

impl GpuBudgetConfig {
    /// Create a config normalized for safe controller use.
    pub fn normalized(mut self) -> Self {
        if !(self.ema_alpha > 0.0 && self.ema_alpha <= 1.0) {
            self.ema_alpha = Self::default().ema_alpha;
        }
        self.pressure_window_samples = self.pressure_window_samples.max(1);
        self.recovery_window_samples = self.recovery_window_samples.max(1);
        self
    }
}

/// Cloneable GPU budget controller.
#[derive(Clone)]
pub struct GpuBudgetController {
    inner: Arc<GpuBudgetInner>,
}

struct GpuBudgetInner {
    config: GpuBudgetConfig,
    state: Mutex<GpuBudgetState>,
    resume: Condvar,
}

#[derive(Debug, Default)]
struct GpuBudgetState {
    pipelines: HashMap<String, PipelineStats>,
    global_frame_time_ema_ms: Option<f64>,
    interactive_frame_time_ema_ms: Option<f64>,
    queue_completion_delay_ema_ms: Option<f64>,
    pressure_samples: u32,
    recovery_samples: u32,
    under_pressure: bool,
    generation: u64,
    export_queue: VecDeque<String>,
    active_export_slot: Option<String>,
}

#[derive(Debug, Clone)]
struct PipelineStats {
    priority: PipelinePriority,
    frame_time_ema_ms: Option<f64>,
    queue_delay_ema_ms: Option<f64>,
}

impl PipelineStats {
    fn new(priority: PipelinePriority) -> Self {
        Self {
            priority,
            frame_time_ema_ms: None,
            queue_delay_ema_ms: None,
        }
    }
}

impl GpuBudgetController {
    /// Create a controller with the supplied policy.
    pub fn new(config: GpuBudgetConfig) -> Self {
        Self {
            inner: Arc::new(GpuBudgetInner {
                config: config.normalized(),
                state: Mutex::new(GpuBudgetState::default()),
                resume: Condvar::new(),
            }),
        }
    }

    /// Create a controller with default policy.
    pub fn with_defaults() -> Self {
        Self::new(GpuBudgetConfig::default())
    }

    /// Return the active configuration.
    pub fn config(&self) -> &GpuBudgetConfig {
        &self.inner.config
    }

    /// Register a pipeline for automatic cleanup when the returned guard is dropped.
    pub fn register_pipeline(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
    ) -> GpuBudgetPipelineGuard {
        let pipeline_id = pipeline_id.into();
        let mut state = self.lock_state();
        state
            .pipelines
            .entry(pipeline_id.clone())
            .or_insert_with(|| PipelineStats::new(priority))
            .priority = priority;
        drop(state);

        GpuBudgetPipelineGuard {
            controller: self.clone(),
            pipeline_id: Some(pipeline_id),
        }
    }

    /// Remove a pipeline from budget accounting and release queued export state.
    pub fn deregister_pipeline(&self, pipeline_id: impl AsRef<str>) {
        let mut state = self.lock_state();
        let pipeline_id = pipeline_id.as_ref();
        state.pipelines.remove(pipeline_id);
        remove_export_queue_entry(&mut state, pipeline_id);
        self.recompute_emas_locked(&mut state);
        if state.pipelines.is_empty() {
            if state.under_pressure {
                state.generation = state.generation.saturating_add(1);
            }
            state.under_pressure = false;
            state.pressure_samples = 0;
            state.recovery_samples = 0;
        } else {
            let _ = self.update_pressure_locked(&mut state);
        }
        drop(state);

        self.inner.resume.notify_all();
    }

    /// Acquire a non-blocking permit decision.
    pub fn acquire_permit(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
    ) -> GpuPermit {
        let mut state = self.lock_state();
        self.acquire_permit_locked(&mut state, pipeline_id.into(), priority)
    }

    /// Block until the caller can proceed.
    pub fn wait_for_resume(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
    ) -> GpuPermit {
        let pipeline_id = pipeline_id.into();
        let mut state = self.lock_state();

        loop {
            let permit = self.acquire_permit_locked(&mut state, pipeline_id.clone(), priority);
            match permit {
                GpuPermit::Proceed => return GpuPermit::Proceed,
                GpuPermit::Queued { retry_after, .. } | GpuPermit::Paused { retry_after, .. } => {
                    state = self.wait_timeout(state, retry_after);
                }
            }
        }
    }

    /// Report elapsed frame GPU work for a pipeline.
    pub fn report_frame_time(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
        elapsed: Duration,
    ) {
        let mut state = self.lock_state();
        let pipeline_id = pipeline_id.into();
        let sample_ms = duration_ms(elapsed);

        let stats = state
            .pipelines
            .entry(pipeline_id.clone())
            .or_insert_with(|| PipelineStats::new(priority));
        stats.priority = priority;
        stats.frame_time_ema_ms = Some(update_ema(
            stats.frame_time_ema_ms,
            sample_ms,
            self.inner.config.ema_alpha,
        ));

        if priority == PipelinePriority::Export {
            self.release_export_slot_locked(&mut state, &pipeline_id);
        }

        self.recompute_emas_locked(&mut state);
        let notify = self.update_pressure_locked(&mut state);
        drop(state);

        if notify {
            self.inner.resume.notify_all();
        }
    }

    /// Report queue-completion delay from submitted GPU work.
    pub fn report_queue_completion_delay(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
        elapsed: Duration,
    ) {
        let mut state = self.lock_state();
        let sample_ms = duration_ms(elapsed);
        let stats = state
            .pipelines
            .entry(pipeline_id.into())
            .or_insert_with(|| PipelineStats::new(priority));
        stats.priority = priority;
        stats.queue_delay_ema_ms = Some(update_ema(
            stats.queue_delay_ema_ms,
            sample_ms,
            self.inner.config.ema_alpha,
        ));

        self.recompute_emas_locked(&mut state);
        let notify = self.update_pressure_locked(&mut state);
        drop(state);

        if notify {
            self.inner.resume.notify_all();
        }
    }

    /// Register a callback for the current queue submission backlog.
    pub fn observe_submitted_work_done(
        &self,
        pipeline_id: impl Into<String>,
        priority: PipelinePriority,
        queue: &wgpu::Queue,
    ) {
        let controller = self.clone();
        let pipeline_id = pipeline_id.into();
        let started_at = Instant::now();
        queue.on_submitted_work_done(move || {
            controller.report_queue_completion_delay(pipeline_id, priority, started_at.elapsed());
        });
    }

    /// Return a point-in-time snapshot for tests and diagnostics.
    pub fn snapshot(&self) -> GpuBudgetSnapshot {
        let state = self.lock_state();
        GpuBudgetSnapshot {
            under_pressure: state.under_pressure,
            global_frame_time_ema: state.global_frame_time_ema_ms.map(ms_duration),
            interactive_frame_time_ema: state.interactive_frame_time_ema_ms.map(ms_duration),
            queue_completion_delay_ema: state.queue_completion_delay_ema_ms.map(ms_duration),
            pressure_samples: state.pressure_samples,
            recovery_samples: state.recovery_samples,
            queued_exports: state.export_queue.len(),
            generation: state.generation,
        }
    }

    fn acquire_permit_locked(
        &self,
        state: &mut GpuBudgetState,
        pipeline_id: String,
        priority: PipelinePriority,
    ) -> GpuPermit {
        state
            .pipelines
            .entry(pipeline_id.clone())
            .or_insert_with(|| PipelineStats::new(priority))
            .priority = priority;

        match priority {
            PipelinePriority::Interactive => GpuPermit::Proceed,
            PipelinePriority::Transcode if state.under_pressure => GpuPermit::Paused {
                retry_after: self.inner.config.transcode_retry_after,
                generation: state.generation,
            },
            PipelinePriority::Transcode => GpuPermit::Proceed,
            PipelinePriority::Export if state.under_pressure => {
                self.acquire_export_permit_locked(state, pipeline_id)
            }
            PipelinePriority::Export => {
                remove_export_queue_entry(state, &pipeline_id);
                GpuPermit::Proceed
            }
        }
    }

    fn acquire_export_permit_locked(
        &self,
        state: &mut GpuBudgetState,
        pipeline_id: String,
    ) -> GpuPermit {
        if !state.export_queue.iter().any(|id| id == &pipeline_id) {
            state.export_queue.push_back(pipeline_id.clone());
        }

        let position = state
            .export_queue
            .iter()
            .position(|id| id == &pipeline_id)
            .map(|index| index + 1)
            .unwrap_or(1);

        let is_front = state.export_queue.front() == Some(&pipeline_id);
        let slot_available = state
            .active_export_slot
            .as_ref()
            .map(|active| active == &pipeline_id)
            .unwrap_or(true);

        if is_front && slot_available {
            state.active_export_slot = Some(pipeline_id);
            GpuPermit::Proceed
        } else {
            GpuPermit::Queued {
                position,
                retry_after: self.inner.config.export_retry_after,
            }
        }
    }

    fn release_export_slot_locked(&self, state: &mut GpuBudgetState, pipeline_id: &str) {
        if state.active_export_slot.as_deref() == Some(pipeline_id) {
            state.active_export_slot = None;
            if state.export_queue.front().map(|id| id.as_str()) == Some(pipeline_id) {
                state.export_queue.pop_front();
            } else {
                remove_export_queue_entry(state, pipeline_id);
            }
            self.inner.resume.notify_all();
        }
    }

    fn recompute_emas_locked(&self, state: &mut GpuBudgetState) {
        state.global_frame_time_ema_ms =
            weighted_average(state.pipelines.values().filter_map(|stats| {
                stats
                    .frame_time_ema_ms
                    .map(|ema| (ema, stats.priority.weight()))
            }));

        state.interactive_frame_time_ema_ms =
            average(state.pipelines.values().filter_map(|stats| {
                if stats.priority == PipelinePriority::Interactive {
                    stats.frame_time_ema_ms
                } else {
                    None
                }
            }));

        state.queue_completion_delay_ema_ms =
            weighted_average(state.pipelines.values().filter_map(|stats| {
                stats
                    .queue_delay_ema_ms
                    .map(|ema| (ema, stats.priority.weight()))
            }));
    }

    fn update_pressure_locked(&self, state: &mut GpuBudgetState) -> bool {
        let was_under_pressure = state.under_pressure;
        let pressure = self.pressure_signal(state);
        let recovery = self.recovery_signal(state);

        if pressure {
            state.pressure_samples = state.pressure_samples.saturating_add(1);
            state.recovery_samples = 0;
        } else if recovery {
            state.recovery_samples = state.recovery_samples.saturating_add(1);
            state.pressure_samples = 0;
        } else {
            state.pressure_samples = 0;
            state.recovery_samples = 0;
        }

        if !state.under_pressure
            && state.pressure_samples >= self.inner.config.pressure_window_samples
        {
            state.under_pressure = true;
        }

        if state.under_pressure
            && state.recovery_samples >= self.inner.config.recovery_window_samples
        {
            state.under_pressure = false;
            state.generation = state.generation.saturating_add(1);
            state.export_queue.clear();
            state.active_export_slot = None;
        }

        was_under_pressure != state.under_pressure
    }

    fn pressure_signal(&self, state: &GpuBudgetState) -> bool {
        state
            .interactive_frame_time_ema_ms
            .is_some_and(|ema| ema >= duration_ms(self.inner.config.interactive_pressure_threshold))
            || state
                .global_frame_time_ema_ms
                .is_some_and(|ema| ema >= duration_ms(self.inner.config.global_pressure_threshold))
            || state.queue_completion_delay_ema_ms.is_some_and(|ema| {
                ema >= duration_ms(self.inner.config.queue_delay_pressure_threshold)
            })
    }

    fn recovery_signal(&self, state: &GpuBudgetState) -> bool {
        let frame_recovered = state
            .interactive_frame_time_ema_ms
            .or(state.global_frame_time_ema_ms)
            .is_some_and(|ema| ema <= duration_ms(self.inner.config.recovery_frame_time_threshold));
        let global_recovered = state
            .global_frame_time_ema_ms
            .is_none_or(|ema| ema <= duration_ms(self.inner.config.recovery_frame_time_threshold));
        let queue_recovered = state
            .queue_completion_delay_ema_ms
            .is_none_or(|ema| ema <= duration_ms(self.inner.config.queue_delay_recovery_threshold));

        frame_recovered && global_recovered && queue_recovered
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, GpuBudgetState> {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn wait_timeout<'a>(
        &self,
        state: std::sync::MutexGuard<'a, GpuBudgetState>,
        timeout: Duration,
    ) -> std::sync::MutexGuard<'a, GpuBudgetState> {
        self.inner
            .resume
            .wait_timeout(state, timeout)
            .map(|(guard, _)| guard)
            .unwrap_or_else(|poisoned| poisoned.into_inner().0)
    }
}

impl Default for GpuBudgetController {
    fn default() -> Self {
        Self::with_defaults()
    }
}

/// RAII cleanup for a budgeted pipeline id.
pub struct GpuBudgetPipelineGuard {
    controller: GpuBudgetController,
    pipeline_id: Option<String>,
}

impl Drop for GpuBudgetPipelineGuard {
    fn drop(&mut self) {
        if let Some(pipeline_id) = self.pipeline_id.take() {
            self.controller.deregister_pipeline(pipeline_id);
        }
    }
}

fn update_ema(previous: Option<f64>, sample: f64, alpha: f64) -> f64 {
    match previous {
        Some(prev) => alpha * sample + (1.0 - alpha) * prev,
        None => sample,
    }
}

fn weighted_average(samples: impl Iterator<Item = (f64, f64)>) -> Option<f64> {
    let mut total = 0.0;
    let mut weight_sum = 0.0;

    for (sample, weight) in samples {
        total += sample * weight;
        weight_sum += weight;
    }

    if weight_sum > 0.0 {
        Some(total / weight_sum)
    } else {
        None
    }
}

fn average(samples: impl Iterator<Item = f64>) -> Option<f64> {
    let mut total = 0.0;
    let mut count = 0usize;

    for sample in samples {
        total += sample;
        count += 1;
    }

    if count > 0 {
        Some(total / count as f64)
    } else {
        None
    }
}

fn remove_export_queue_entry(state: &mut GpuBudgetState, pipeline_id: &str) {
    state.export_queue.retain(|id| id != pipeline_id);
    if state.active_export_slot.as_deref() == Some(pipeline_id) {
        state.active_export_slot = None;
    }
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

fn ms_duration(ms: f64) -> Duration {
    let secs = (ms / 1_000.0).max(0.0);
    Duration::try_from_secs_f64(secs).unwrap_or(Duration::ZERO)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> GpuBudgetConfig {
        GpuBudgetConfig {
            ema_alpha: 1.0,
            interactive_pressure_threshold: Duration::from_millis(20),
            global_pressure_threshold: Duration::from_millis(30),
            queue_delay_pressure_threshold: Duration::from_millis(5),
            recovery_frame_time_threshold: Duration::from_millis(12),
            queue_delay_recovery_threshold: Duration::from_millis(2),
            pressure_window_samples: 2,
            recovery_window_samples: 2,
            export_retry_after: Duration::from_millis(1),
            transcode_retry_after: Duration::from_millis(1),
        }
    }

    #[test]
    fn permit_decisions_respect_priority_under_pressure() {
        let controller = GpuBudgetController::new(test_config());
        for _ in 0..2 {
            controller.report_frame_time(
                "timeline",
                PipelinePriority::Interactive,
                Duration::from_millis(25),
            );
        }

        assert!(controller.snapshot().under_pressure);
        assert_eq!(
            controller.acquire_permit("timeline", PipelinePriority::Interactive),
            GpuPermit::Proceed
        );
        assert!(matches!(
            controller.acquire_permit("proxy", PipelinePriority::Transcode),
            GpuPermit::Paused { .. }
        ));
        assert_eq!(
            controller.acquire_permit("export-a", PipelinePriority::Export),
            GpuPermit::Proceed
        );
        assert_eq!(
            controller.acquire_permit("export-b", PipelinePriority::Export),
            GpuPermit::Queued {
                position: 2,
                retry_after: Duration::from_millis(1)
            }
        );
    }

    #[test]
    fn export_queue_is_fifo_under_pressure() {
        let controller = GpuBudgetController::new(test_config());
        for _ in 0..2 {
            controller.report_frame_time(
                "timeline",
                PipelinePriority::Interactive,
                Duration::from_millis(25),
            );
        }

        assert_eq!(
            controller.acquire_permit("export-a", PipelinePriority::Export),
            GpuPermit::Proceed
        );
        assert!(matches!(
            controller.acquire_permit("export-b", PipelinePriority::Export),
            GpuPermit::Queued { position: 2, .. }
        ));
        assert!(matches!(
            controller.acquire_permit("export-c", PipelinePriority::Export),
            GpuPermit::Queued { position: 3, .. }
        ));

        controller.report_frame_time(
            "export-a",
            PipelinePriority::Export,
            Duration::from_millis(4),
        );
        assert_eq!(
            controller.acquire_permit("export-b", PipelinePriority::Export),
            GpuPermit::Proceed
        );
        assert!(matches!(
            controller.acquire_permit("export-c", PipelinePriority::Export),
            GpuPermit::Queued { position: 2, .. }
        ));
    }

    #[test]
    fn hysteresis_requires_sustained_recovery_before_resume() {
        let controller = GpuBudgetController::new(test_config());
        for _ in 0..2 {
            controller.report_frame_time(
                "timeline",
                PipelinePriority::Interactive,
                Duration::from_millis(25),
            );
        }
        assert!(controller.snapshot().under_pressure);

        controller.report_frame_time(
            "timeline",
            PipelinePriority::Interactive,
            Duration::from_millis(10),
        );
        assert!(controller.snapshot().under_pressure);

        controller.report_frame_time(
            "timeline",
            PipelinePriority::Interactive,
            Duration::from_millis(10),
        );
        let snapshot = controller.snapshot();
        assert!(!snapshot.under_pressure);
        assert_eq!(snapshot.generation, 1);
        assert_eq!(
            controller.acquire_permit("proxy", PipelinePriority::Transcode),
            GpuPermit::Proceed
        );
    }

    #[test]
    fn queue_completion_delay_participates_in_pressure() {
        let controller = GpuBudgetController::new(test_config());
        for _ in 0..2 {
            controller.report_queue_completion_delay(
                "timeline",
                PipelinePriority::Interactive,
                Duration::from_millis(7),
            );
        }

        assert!(controller.snapshot().under_pressure);
        assert!(matches!(
            controller.acquire_permit("proxy", PipelinePriority::Transcode),
            GpuPermit::Paused { .. }
        ));
    }

    #[test]
    fn deregister_pipeline_removes_stats_and_export_queue_state() {
        let controller = GpuBudgetController::new(test_config());
        for _ in 0..2 {
            controller.report_frame_time(
                "timeline",
                PipelinePriority::Interactive,
                Duration::from_millis(25),
            );
        }
        assert!(controller.snapshot().global_frame_time_ema.is_some());

        assert_eq!(
            controller.acquire_permit("export-a", PipelinePriority::Export),
            GpuPermit::Proceed
        );
        assert!(matches!(
            controller.acquire_permit("export-b", PipelinePriority::Export),
            GpuPermit::Queued { position: 2, .. }
        ));

        controller.deregister_pipeline("export-a");
        assert_eq!(
            controller.acquire_permit("export-b", PipelinePriority::Export),
            GpuPermit::Proceed
        );

        controller.deregister_pipeline("timeline");
        controller.deregister_pipeline("export-b");
        let snapshot = controller.snapshot();
        assert!(snapshot.global_frame_time_ema.is_none());
        assert!(!snapshot.under_pressure);
    }

    #[test]
    fn pipeline_guard_deregisters_on_drop() {
        let controller = GpuBudgetController::new(test_config());
        {
            let _guard = controller.register_pipeline("proxy", PipelinePriority::Transcode);
            controller.report_frame_time(
                "proxy",
                PipelinePriority::Transcode,
                Duration::from_millis(10),
            );
            assert!(controller.snapshot().global_frame_time_ema.is_some());
        }

        let snapshot = controller.snapshot();
        assert!(snapshot.global_frame_time_ema.is_none());
        assert!(!snapshot.under_pressure);
    }
}
