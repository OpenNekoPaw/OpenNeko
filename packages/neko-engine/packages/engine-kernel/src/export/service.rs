//! Export Service - Main orchestrator for compat mode video export
//!
//! Coordinates export backend adapters to perform server-side video export with
//! audio mixing.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tokio::sync::{broadcast, Mutex, RwLock};

use crate::encoder::{ContainerFormat, EncodedPacket, PipelineConfig};
use crate::error::{Error, Result};
use crate::monitor::SystemMonitor;
use crate::telemetry::metrics::{FrameStatsCollector, FrameTiming};
use neko_engine_gpu::{GpuContext, PipelinePriority};
use neko_engine_types::{
    AudioCodec, AudioEncodedPacket, AudioOutput, GpuFrameLease, PipelineOutput, VideoGpuFrame,
    VideoOutput,
};

use super::backend::{build_audio_encoder_config, build_export_metadata, ExportBackendBundle};
use super::types::{
    ExportJobConfig, ExportMetadata, ExportProgress, ExportStartResponse, ExportState, ExportStats,
    QueueEntry, QueueStatus,
};
use super::ExportSinkFactory;

/// Active export job
pub(super) struct ExportJob {
    /// Job configuration
    config: ExportJobConfig,
    /// Current state
    state: ExportState,
    /// Cancellation flag
    pub(super) cancel_flag: Arc<AtomicBool>,
    /// Start time
    start_time: Instant,
    /// Current frame
    current_frame: u64,
    /// Total frames
    total_frames: u64,
    /// Export metadata
    metadata: Option<ExportMetadata>,
    /// Performance stats
    stats: ExportStats,
    /// Decode time accumulator (atomic for thread safety)
    decode_time_us: Arc<AtomicU64>,
    /// Composite time accumulator
    composite_time_us: Arc<AtomicU64>,
    /// Detailed timing stats (updated periodically)
    detailed_stats: Option<ExportStats>,
}

impl ExportJob {
    pub(super) fn new(config: ExportJobConfig, total_frames: u64) -> Self {
        Self {
            config,
            state: ExportState::Pending,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            start_time: Instant::now(),
            current_frame: 0,
            total_frames,
            metadata: None,
            stats: ExportStats::default(),
            decode_time_us: Arc::new(AtomicU64::new(0)),
            composite_time_us: Arc::new(AtomicU64::new(0)),
            detailed_stats: None,
        }
    }

    fn to_progress(&self) -> ExportProgress {
        let elapsed_ms = self.start_time.elapsed().as_millis() as u64;
        let progress = if self.total_frames > 0 {
            (self.current_frame as f64 / self.total_frames as f64) * 100.0
        } else {
            0.0
        };

        // Estimate remaining time
        let estimated_remaining_ms = if self.current_frame > 0 && progress > 0.0 {
            let ms_per_frame = elapsed_ms as f64 / self.current_frame as f64;
            let remaining_frames = self.total_frames - self.current_frame;
            (ms_per_frame * remaining_frames as f64) as u64
        } else {
            0
        };

        // Calculate average FPS
        let avg_fps = if elapsed_ms > 0 {
            (self.current_frame as f64 / elapsed_ms as f64) * 1000.0
        } else {
            0.0
        };

        // Use detailed stats if available, otherwise build from legacy accumulators
        let stats = if let Some(ref detailed) = self.detailed_stats {
            let mut s = detailed.clone();
            s.avg_fps = avg_fps;
            s
        } else {
            ExportStats {
                hw_decode_ms: 0.0,
                nv12_import_ms: 0.0,
                nv12_to_rgba_ms: 0.0,
                composite_ms: 0.0,
                rgba_to_nv12_ms: 0.0,
                cpu_readback_ms: 0.0,
                encode_submit_ms: 0.0,
                decode_time_ms: self.decode_time_us.load(Ordering::Relaxed) / 1000,
                composite_time_ms: self.composite_time_us.load(Ordering::Relaxed) / 1000,
                encode_time_ms: self.stats.encode_time_ms,
                mux_time_ms: self.stats.mux_time_ms,
                avg_fps,
                peak_memory_bytes: self.stats.peak_memory_bytes,
                cpu_usage_percent: self.stats.cpu_usage_percent,
                gpu_usage_percent: self.stats.gpu_usage_percent,
                vram_usage_bytes: self.stats.vram_usage_bytes,
            }
        };

        ExportProgress {
            job_id: self.config.job_id.clone(),
            state: self.state,
            progress,
            current_frame: self.current_frame,
            total_frames: self.total_frames,
            elapsed_ms,
            estimated_remaining_ms,
            error: None,
            metadata: self.metadata.clone(),
            stats: Some(stats),
        }
    }
}

/// Export service for managing export jobs
pub struct ExportService {
    /// Active export jobs
    jobs: Arc<RwLock<HashMap<String, ExportJob>>>,
    /// Pending job queue (FIFO order)
    pending: Arc<Mutex<VecDeque<(ExportJobConfig, u64)>>>,
    /// Progress broadcast channel
    progress_tx: broadcast::Sender<ExportProgress>,
    /// Export backend adapters
    backends: Arc<ExportBackendBundle>,
}

impl ExportService {
    /// Create a new export service
    #[allow(dead_code)]
    pub async fn new() -> Result<Self> {
        let gpu_ctx = Arc::new(
            GpuContext::new()
                .await
                .map_err(|e| Error::Other(format!("Failed to create GPU context: {}", e)))?,
        );

        Ok(Self::with_backend_bundle(Arc::new(
            ExportBackendBundle::with_gpu_context(gpu_ctx),
        )))
    }

    /// Create with existing GPU context
    #[allow(dead_code)]
    pub fn with_gpu_context(gpu_ctx: Arc<GpuContext>) -> Self {
        Self::with_backend_bundle(Arc::new(ExportBackendBundle::with_gpu_context(gpu_ctx)))
    }

    /// Create with existing GPU context and export sink factory.
    #[allow(dead_code)]
    pub fn with_gpu_context_and_sink_factory(
        gpu_ctx: Arc<GpuContext>,
        sink_factory: Arc<dyn ExportSinkFactory>,
    ) -> Self {
        Self::with_backend_bundle(Arc::new(
            ExportBackendBundle::with_gpu_context_and_sink_factory(gpu_ctx, sink_factory),
        ))
    }

    /// Create with fully injected backend adapters.
    pub fn with_backend_bundle(backends: Arc<ExportBackendBundle>) -> Self {
        let (progress_tx, _) = broadcast::channel(100);

        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            pending: Arc::new(Mutex::new(VecDeque::new())),
            progress_tx,
            backends,
        }
    }

    /// Enqueue an export job — returns the job_id immediately.
    ///
    /// If no job is currently running, the job starts immediately.
    /// Otherwise it waits until the running job finishes.
    pub async fn enqueue_export(&self, config: ExportJobConfig) -> Result<String> {
        let job_id = config.job_id.clone();
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        {
            let mut pending = self.pending.lock().await;
            pending.push_back((config, created_at));
        }

        self.try_process_next().await;

        Ok(job_id)
    }

    /// List all queued (pending) and active jobs.
    pub async fn list_queue(&self) -> Vec<QueueEntry> {
        let mut entries = Vec::new();

        // Active jobs
        {
            let jobs = self.jobs.read().await;
            for (job_id, job) in jobs.iter() {
                let status = match job.state {
                    ExportState::Pending
                    | ExportState::Initializing
                    | ExportState::Decoding
                    | ExportState::Compositing
                    | ExportState::Encoding
                    | ExportState::Muxing
                    | ExportState::Finalizing => QueueStatus::Running,
                    ExportState::Completed => QueueStatus::Completed,
                    ExportState::Cancelled => QueueStatus::Cancelled,
                    ExportState::Error => QueueStatus::Failed,
                };
                entries.push(QueueEntry {
                    job_id: job_id.clone(),
                    status,
                    created_at: job.start_time.elapsed().as_millis() as u64,
                });
            }
        }

        // Pending jobs (in order)
        {
            let pending = self.pending.lock().await;
            for (config, created_at) in pending.iter() {
                entries.push(QueueEntry {
                    job_id: config.job_id.clone(),
                    status: QueueStatus::Pending,
                    created_at: *created_at,
                });
            }
        }

        entries
    }

    /// Internal: start the next pending job if no job is currently running.
    async fn try_process_next(&self) {
        Self::process_next_from_queue(
            Arc::clone(&self.jobs),
            Arc::clone(&self.pending),
            self.progress_tx.clone(),
            Arc::clone(&self.backends),
        )
        .await;
    }

    /// Static helper: dequeue and start the next pending job when the queue is idle.
    ///
    /// Called from `try_process_next` (via `enqueue_export`) and from the blocking
    /// thread completion callback (so the chain continues automatically).
    async fn process_next_from_queue(
        jobs: Arc<RwLock<HashMap<String, ExportJob>>>,
        pending: Arc<Mutex<VecDeque<(ExportJobConfig, u64)>>>,
        progress_tx: broadcast::Sender<ExportProgress>,
        backends: Arc<ExportBackendBundle>,
    ) {
        // Check if any job is still running (non-terminal state)
        {
            let jobs_guard = jobs.read().await;
            let has_active = jobs_guard.values().any(|j| {
                !matches!(
                    j.state,
                    ExportState::Completed | ExportState::Cancelled | ExportState::Error
                )
            });
            if has_active {
                return;
            }
        }

        // Dequeue next pending job
        let next = {
            let mut pending_guard = pending.lock().await;
            pending_guard.pop_front()
        };

        let Some((config, _created_at)) = next else {
            return;
        };

        let job_id = config.job_id.clone();
        let total_frames = config.timeline.total_frames();
        let job = ExportJob::new(config.clone(), total_frames);
        let cancel_flag = Arc::clone(&job.cancel_flag);

        {
            let mut jobs_guard = jobs.write().await;
            if jobs_guard.contains_key(&job_id) {
                tracing::warn!("Queue: job {} already exists, skipping", job_id);
                return;
            }
            jobs_guard.insert(job_id.clone(), job);
        }

        let jobs_c = Arc::clone(&jobs);
        let pending_c = Arc::clone(&pending);
        let progress_tx_c = progress_tx.clone();
        let backends_c = Arc::clone(&backends);
        let job_id_c = job_id.clone();

        tokio::task::spawn_blocking(move || {
            let result = Self::export_worker_sync(
                config,
                jobs_c.clone(),
                progress_tx_c.clone(),
                backends_c,
                cancel_flag,
            );

            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                {
                    let mut jobs_guard = jobs_c.write().await;
                    if let Some(job) = jobs_guard.get_mut(&job_id_c) {
                        match &result {
                            Ok(()) => {
                                job.state = ExportState::Completed;
                                tracing::info!("Queued export job {} completed", job_id_c);
                            }
                            Err(Error::Cancelled) => {
                                job.state = ExportState::Cancelled;
                                tracing::info!("Queued export job {} cancelled", job_id_c);
                            }
                            Err(e) => {
                                job.state = ExportState::Error;
                                tracing::error!("Queued export job {} failed: {}", job_id_c, e);
                            }
                        }
                    }
                }
                // Continue processing the queue
                Self::process_next_from_queue(jobs_c, pending_c, progress_tx_c, backends).await;
            });

            result
        });
    }

    /// Start an export job
    pub async fn start_export(&self, config: ExportJobConfig) -> Result<ExportStartResponse> {
        let job_id = config.job_id.clone();
        let total_frames = config.timeline.total_frames();

        // Create job
        let job = ExportJob::new(config.clone(), total_frames);
        let cancel_flag = Arc::clone(&job.cancel_flag);

        // Store job
        {
            let mut jobs = self.jobs.write().await;
            if jobs.contains_key(&job_id) {
                return Err(Error::Other(format!("Job {} already exists", job_id)));
            }
            jobs.insert(job_id.clone(), job);
        }

        // Spawn export worker in blocking thread
        let jobs_c = Arc::clone(&self.jobs);
        let pending_c = Arc::clone(&self.pending);
        let progress_tx_c = self.progress_tx.clone();
        let backends_c = Arc::clone(&self.backends);
        let job_id_clone = job_id.clone();

        tokio::task::spawn_blocking(move || {
            let result = Self::export_worker_sync(
                config,
                jobs_c.clone(),
                progress_tx_c.clone(),
                backends_c.clone(),
                cancel_flag,
            );

            // Update job state on completion (need to use block_on for async)
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                {
                    let mut jobs_guard = jobs_c.write().await;
                    if let Some(job) = jobs_guard.get_mut(&job_id_clone) {
                        match &result {
                            Ok(()) => {
                                job.state = ExportState::Completed;
                                tracing::info!("Export job {} completed", job_id_clone);
                            }
                            Err(Error::Cancelled) => {
                                job.state = ExportState::Cancelled;
                                tracing::info!("Export job {} cancelled", job_id_clone);
                            }
                            Err(e) => {
                                job.state = ExportState::Error;
                                tracing::error!("Export job {} failed: {}", job_id_clone, e);
                            }
                        }
                    }
                }

                // Process next queued job if any
                Self::process_next_from_queue(jobs_c, pending_c, progress_tx_c, backends_c).await;
            });

            result
        });

        Ok(ExportStartResponse {
            job_id,
            total_frames,
        })
    }

    /// Cancel an export job
    pub async fn cancel_export(&self, job_id: &str) -> bool {
        let jobs = self.jobs.read().await;
        if let Some(job) = jobs.get(job_id) {
            job.cancel_flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    /// Get export progress
    pub async fn get_progress(&self, job_id: &str) -> Option<ExportProgress> {
        let jobs = self.jobs.read().await;
        jobs.get(job_id).map(|job| job.to_progress())
    }

    /// Subscribe to progress updates
    #[allow(dead_code)]
    pub fn subscribe_progress(&self) -> broadcast::Receiver<ExportProgress> {
        self.progress_tx.subscribe()
    }

    /// Export worker - runs the actual export pipeline
    ///
    /// This function runs in a blocking thread because GpuExportPipeline
    /// and AudioMixer contain FFmpeg contexts that are not Send.
    pub(super) fn export_worker_sync(
        config: ExportJobConfig,
        jobs: Arc<RwLock<HashMap<String, ExportJob>>>,
        progress_tx: broadcast::Sender<ExportProgress>,
        backends: Arc<ExportBackendBundle>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<()> {
        let job_id = config.job_id.clone();
        let budget = backends.render_factory.budget_controller();
        let budget_pipeline_id = format!("export:{}", job_id);
        let _budget_guard =
            budget.register_pipeline(budget_pipeline_id.clone(), PipelinePriority::Export);

        // Update state to Initializing (blocking)
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(
                &jobs,
                &job_id,
                ExportState::Initializing,
            ));
        }

        // Initialize render backend (decode + composite)
        let mut render_backend = backends.render_factory.create(&config)?;
        render_backend.initialize()?;

        // Initialize audio mix and encode backends.
        let mut audio_backend = backends.audio_factory.create(&config)?;
        let audio_encoder_config = audio_backend
            .as_ref()
            .map(|audio| build_audio_encoder_config(&config, audio.as_ref()));
        let mut audio_encoder = match audio_encoder_config.clone() {
            Some(audio_config) => Some(backends.audio_encode_factory.create(audio_config)?),
            None => None,
        };

        let total_frames = render_backend.total_frames();
        let (output_width, output_height) = render_backend.output_dimensions();
        let fps = config.settings.fps;

        // Build export metadata
        let metadata = build_export_metadata(&config, output_width, output_height);

        // Update job with metadata
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_metadata(&jobs, &job_id, metadata));
        }

        // Create pipeline config
        let pipeline_config = PipelineConfig {
            compose_buffer_size: 3,
            encode_buffer_size: 4,
            mux_buffer_size: 8,
            encoder_config: config.settings.to_encoder_config(),
            audio_encoder_config: audio_encoder_config.clone(),
            container: container_for_output_path(&config.output_path)?,
            output_path: config.output_path.clone(),
            total_frames,
        };

        // Start sink-backed encode/mux pipeline (compositing done by GpuExportPipeline).
        let export_sink = backends.sink_factory.create(pipeline_config)?;

        // Update state to Encoding
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(
                &jobs,
                &job_id,
                ExportState::Encoding,
            ));
        }

        // Create stats collector for periodic output (every 100ms)
        let mut stats_collector = FrameStatsCollector::new(Duration::from_millis(100));

        // Create system monitor for resource tracking
        let mut system_monitor = SystemMonitor::new();

        // Process frames
        let frame_duration = 1.0 / fps;
        for frame_idx in 0..total_frames {
            // Check cancellation
            if cancel_flag.load(Ordering::Relaxed) {
                let _ = export_sink.cancel();
                return Err(Error::Cancelled);
            }

            let time = frame_idx as f64 * frame_duration;
            let frame_start = Instant::now();
            let mut timing = FrameTiming::default();

            budget.wait_for_resume(budget_pipeline_id.clone(), PipelinePriority::Export);

            // GPU pipeline: decode + composite + NV12 convert (all on GPU)
            // Use zero-copy path on macOS, CPU path on other platforms
            let rendered = render_backend.render_frame(time, [0.0, 0.0, 0.0, 1.0])?;
            let nv12_data = rendered.nv12_data;
            let gpu_handle = rendered.gpu_handle;
            let gpu_timing = rendered.timing;

            // Copy detailed GPU timing to frame timing
            timing.hw_decode_ns = gpu_timing.hw_decode_ns;
            timing.nv12_import_ns = gpu_timing.nv12_import_ns;
            timing.nv12_to_rgba_ns = gpu_timing.nv12_to_rgba_ns;
            timing.composite_ns = gpu_timing.composite_ns;
            timing.rgba_to_nv12_ns = gpu_timing.rgba_to_nv12_ns;
            timing.cpu_readback_ns = gpu_timing.cpu_readback_ns;
            timing.decode_ns = gpu_timing.hw_decode_ns;
            timing.gpu_ns = gpu_timing.total_ns();

            // Mix and encode audio for this frame (streaming)
            if let (Some(ref mut enc), Some(ref mut audio)) =
                (audio_encoder.as_mut(), audio_backend.as_mut())
            {
                if let Some(audio_frame) = audio.mix_frame(time)? {
                    for audio_pkt in enc.encode_frame(&audio_frame)? {
                        submit_audio_packet_to_sink(
                            export_sink.as_ref(),
                            audio_pkt,
                            config.settings.audio_codec,
                        )?;
                    }
                }
            }

            // Update decode time stats (for backward compatibility)
            {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(Self::add_decode_time(&jobs, &job_id, timing.gpu_ns / 1000));
            }

            // Submit frame to encoder
            let encode_start = Instant::now();
            let _ = nv12_data;
            export_sink.submit(PipelineOutput::video(VideoOutput::gpu_frame(
                VideoGpuFrame {
                    lease: GpuFrameLease::new(gpu_handle),
                    pts: frame_idx as i64,
                    duration: (1_000_000.0 / fps) as i64,
                    frame_index: frame_idx,
                    width: output_width,
                    height: output_height,
                    force_keyframe: false,
                    diagnostics: None,
                },
            )))?;
            timing.encode_submit_ns = encode_start.elapsed().as_nanos() as u64;
            timing.encode_ns = timing.encode_submit_ns;

            timing.total_ns = frame_start.elapsed().as_nanos() as u64;
            budget.report_frame_time(
                budget_pipeline_id.clone(),
                PipelinePriority::Export,
                frame_start.elapsed(),
            );
            backends
                .render_factory
                .observe_submitted_work_done(&budget_pipeline_id);

            // Record frame timing (outputs stats every 100ms)
            stats_collector.record_frame(timing);

            // Update progress (every 10 frames to reduce overhead)
            if frame_idx % 10 == 0 || frame_idx == total_frames - 1 {
                // Sample system resources
                system_monitor.sample();

                let rt = tokio::runtime::Handle::current();
                rt.block_on(Self::update_job_progress_with_stats(
                    &jobs,
                    &job_id,
                    frame_idx + 1,
                    &stats_collector,
                    &system_monitor,
                ));

                // Broadcast progress
                if let Some(progress) = rt.block_on(Self::get_job_progress(&jobs, &job_id)) {
                    let _ = progress_tx.send(progress);
                }
            }
        }

        // Log final stats summary
        stats_collector.log_final_summary();

        // Flush audio encoder and submit remaining packets
        if let Some(ref mut enc) = audio_encoder {
            tracing::info!("Flushing audio encoder");
            for audio_pkt in enc.flush()? {
                submit_audio_packet_to_sink(
                    export_sink.as_ref(),
                    audio_pkt,
                    config.settings.audio_codec,
                )?;
            }
        }

        // Update state to Muxing
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(&jobs, &job_id, ExportState::Muxing));
        }

        // Close the sink to finalize video encode and mux output.
        export_sink.close()?;

        // Update state to Finalizing
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(
                &jobs,
                &job_id,
                ExportState::Finalizing,
            ));
        }

        Ok(())
    }

    /// Update job state
    async fn update_job_state(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        state: ExportState,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.state = state;
        }
    }

    /// Update job metadata
    async fn update_job_metadata(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        metadata: ExportMetadata,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.metadata = Some(metadata);
        }
    }

    /// Add decode time to stats
    async fn add_decode_time(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        time_us: u64,
    ) {
        let jobs_guard = jobs.read().await;
        if let Some(job) = jobs_guard.get(job_id) {
            job.decode_time_us.fetch_add(time_us, Ordering::Relaxed);
        }
    }

    /// Update job progress with detailed stats from FrameStatsCollector and SystemMonitor
    async fn update_job_progress_with_stats(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        current_frame: u64,
        stats_collector: &FrameStatsCollector,
        system_monitor: &SystemMonitor,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.current_frame = current_frame;

            // Get average timing from collector
            let avg_timing = stats_collector.avg_timing();

            // Update detailed stats
            job.detailed_stats = Some(ExportStats {
                // Detailed timing (per-frame average in ms)
                hw_decode_ms: avg_timing.hw_decode_ns as f64 / 1_000_000.0,
                nv12_import_ms: avg_timing.nv12_import_ns as f64 / 1_000_000.0,
                nv12_to_rgba_ms: avg_timing.nv12_to_rgba_ns as f64 / 1_000_000.0,
                composite_ms: avg_timing.composite_ns as f64 / 1_000_000.0,
                rgba_to_nv12_ms: avg_timing.rgba_to_nv12_ns as f64 / 1_000_000.0,
                cpu_readback_ms: avg_timing.cpu_readback_ns as f64 / 1_000_000.0,
                encode_submit_ms: avg_timing.encode_submit_ns as f64 / 1_000_000.0,
                // Aggregate timing (backward compatible)
                decode_time_ms: avg_timing.decode_ns / 1_000_000,
                composite_time_ms: avg_timing.gpu_ns / 1_000_000,
                encode_time_ms: avg_timing.encode_ns as f64 / 1_000_000.0,
                mux_time_ms: avg_timing.mux_ns / 1_000_000,
                // Performance metrics from SystemMonitor
                avg_fps: stats_collector.current_fps(),
                peak_memory_bytes: system_monitor.peak_memory(),
                cpu_usage_percent: system_monitor.avg_cpu_usage(),
                gpu_usage_percent: system_monitor.avg_gpu_usage(),
                vram_usage_bytes: system_monitor.peak_vram(),
            });
        }
    }

    /// Get job progress
    async fn get_job_progress(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
    ) -> Option<ExportProgress> {
        let jobs_guard = jobs.read().await;
        jobs_guard.get(job_id).map(|job| job.to_progress())
    }
}

fn container_for_output_path(output_path: &str) -> Result<ContainerFormat> {
    match std::path::Path::new(output_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4") => Ok(ContainerFormat::Mp4),
        Some("mov") => Ok(ContainerFormat::Mov),
        extension => Err(Error::UnsupportedContainer(
            extension.unwrap_or("<missing>").to_string(),
        )),
    }
}

fn submit_audio_packet_to_sink(
    sink: &dyn super::ExportSink,
    packet: EncodedPacket,
    codec: AudioCodec,
) -> Result<()> {
    sink.submit(PipelineOutput::Audio(AudioOutput::EncodedPacket(
        AudioEncodedPacket {
            data: packet.data,
            pts: packet.pts,
            dts: packet.dts,
            duration: packet.duration,
            codec,
            stream_index: packet.stream_index,
        },
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_job_progress() {
        use crate::domain::Timeline;
        use crate::export::types::{
            ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportSettings, ExportVideoCodec,
        };
        use neko_engine_types::Resolution;

        let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
        timeline.duration = 10.0;

        let config = ExportJobConfig {
            job_id: "test-job".to_string(),
            output_path: "/tmp/test.mp4".to_string(),
            settings: ExportSettings {
                width: 1920,
                height: 1080,
                fps: 30.0,
                video_codec: ExportVideoCodec::H264,
                video_bitrate: None,
                audio_codec: ExportAudioCodec::Aac,
                audio_bitrate: None,
                audio_sample_rate: 48_000,
                hw_encoder: ExportHwEncoder::None,
                time_range: None,
                preset: ExportPreset::Medium,
                use_zero_copy_gpu: false,
            },
            timeline,
        };

        let mut job = ExportJob::new(config, 300);
        job.current_frame = 150;

        let progress = job.to_progress();
        assert_eq!(progress.job_id, "test-job");
        assert_eq!(progress.total_frames, 300);
        assert_eq!(progress.current_frame, 150);
        assert!((progress.progress - 50.0).abs() < 0.1);
    }
}
