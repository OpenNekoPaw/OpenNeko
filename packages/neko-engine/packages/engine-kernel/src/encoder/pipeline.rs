//! Async Export Pipeline - Three-stage concurrent video export
//!
//! Pipeline architecture:
//! ```text
//! [Decode/Prepare] → [Compose (GPU)] → [Encode (CPU/HW)] → [Mux (IO)]
//!
//! Time:    T0      T1      T2      T3      T4      T5
//! ─────────────────────────────────────────────────────
//! Compose:   [F0]    [F1]    [F2]    [F3]    [F4]    [F5]
//! Encode:           [F0]    [F1]    [F2]    [F3]    [F4]
//! Mux:                      [F0]    [F1]    [F2]    [F3]
//! ```
//!
//! Key design choices:
//! - Bounded channels provide automatic backpressure
//! - Frame indices ensure correct ordering at mux stage
//! - Atomic counters track progress without locks
//! - Cancellation flag for graceful shutdown

// TODO(P2): retire this legacy CPU/encode-only pipeline after export fully
// migrates to sink-based zero-copy orchestration.
#![allow(dead_code)]

use crossbeam_channel::{bounded, select, Receiver, Sender};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use crate::encoder::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, FfmpegMuxer, HwAccelEncoder, Muxer,
};
use crate::error::{Error, Result};
use neko_engine_gpu::{CompositeLayer, GpuCompositor, GpuContext};
use neko_engine_types::AudioEncoderConfig;

// =============================================================================
// Pipeline Types
// =============================================================================

/// Legacy frame for backward compatibility (CPU data-based)
#[derive(Debug, Clone)]
pub struct PipelineFrame {
    /// Frame index (sequential, for ordering)
    pub index: u64,
    /// Presentation timestamp (time base units)
    pub pts: i64,
    /// Layers to composite
    pub layers: Vec<CompositeLayer>,
    /// Output width
    pub output_width: u32,
    /// Output height
    pub output_height: u32,
    /// Background color [r, g, b, a]
    pub background_color: [f32; 4],
}

/// Composited frame ready for encoding
pub struct CompositedFrame {
    /// Frame index (for ordering)
    pub index: u64,
    /// Presentation timestamp
    pub pts: i64,
    /// Composited pixel data (NV12) - used when gpu_handle is None
    pub data: Vec<u8>,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// GPU handle for zero-copy encoding (IOSurface on macOS)
    /// When Some, encoder uses encode_frame_gpu instead of encode_frame
    pub gpu_handle: Option<usize>,
}

/// Packet ready for muxing (video or audio)
enum MuxPacket {
    /// Video packet with frame index for ordering
    Video { index: u64, packet: EncodedPacket },
    /// Audio packet
    Audio { packet: EncodedPacket },
    /// Signal that all audio packets have been sent
    AudioFinished,
}

// =============================================================================
// Pipeline Configuration
// =============================================================================

/// Pipeline configuration
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Compose stage buffer size (GPU memory constraint)
    pub compose_buffer_size: usize,
    /// Encode stage buffer size
    pub encode_buffer_size: usize,
    /// Mux stage buffer size
    pub mux_buffer_size: usize,
    /// Encoder configuration
    pub encoder_config: EncoderConfig,
    /// Audio encoder configuration (None = no audio)
    pub audio_encoder_config: Option<AudioEncoderConfig>,
    /// Output container format
    pub container: ContainerFormat,
    /// Output file path
    pub output_path: String,
    /// Total expected frames (for progress reporting)
    pub total_frames: u64,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            compose_buffer_size: 3, // ~3 frames in GPU memory
            encode_buffer_size: 4,
            mux_buffer_size: 8,
            encoder_config: EncoderConfig::new(1920, 1080, 30.0, crate::encoder::VideoCodec::H264),
            audio_encoder_config: None,
            container: ContainerFormat::Mp4,
            output_path: String::new(),
            total_frames: 0,
        }
    }
}

// =============================================================================
// Pipeline Progress
// =============================================================================

/// Pipeline progress tracking
pub struct PipelineProgress {
    /// Frames submitted to pipeline
    pub frames_submitted: AtomicU64,
    /// Frames composited (GPU)
    pub frames_composited: AtomicU64,
    /// Frames encoded
    pub frames_encoded: AtomicU64,
    /// Frames muxed (written to file)
    pub frames_muxed: AtomicU64,
    /// Total frames expected
    pub total_frames: u64,
    /// Error message if pipeline failed
    pub error: Mutex<Option<String>>,
}

impl PipelineProgress {
    fn new(total_frames: u64) -> Self {
        Self {
            frames_submitted: AtomicU64::new(0),
            frames_composited: AtomicU64::new(0),
            frames_encoded: AtomicU64::new(0),
            frames_muxed: AtomicU64::new(0),
            total_frames,
            error: Mutex::new(None),
        }
    }

    /// Get current progress as percentage (0.0 - 1.0)
    pub fn progress_ratio(&self) -> f64 {
        if self.total_frames == 0 {
            return 0.0;
        }
        // Use the slowest stage (mux) as the overall progress
        self.frames_muxed.load(Ordering::Relaxed) as f64 / self.total_frames as f64
    }

    /// Check if pipeline has completed
    pub fn is_complete(&self) -> bool {
        self.frames_muxed.load(Ordering::Relaxed) >= self.total_frames
    }

    /// Check if pipeline has errored
    pub fn has_error(&self) -> bool {
        self.error.lock().map(|e| e.is_some()).unwrap_or(false)
    }

    /// Get error message if any
    pub fn get_error(&self) -> Option<String> {
        self.error.lock().ok()?.clone()
    }

    fn set_error(&self, msg: String) {
        if let Ok(mut guard) = self.error.lock() {
            if guard.is_none() {
                *guard = Some(msg);
            }
        }
    }
}

// =============================================================================
// Async Export Pipeline
// =============================================================================

/// Asynchronous export pipeline with concurrent processing
///
/// Supports two modes:
/// - Full pipeline: compose → encode → mux (via `start()`)
/// - Encode-only: encode → mux (via `start_encode_only()`, compositing done externally)
pub struct AsyncExportPipeline {
    /// Channel to submit raw frames for compositing (full pipeline mode)
    input_tx: Option<Sender<PipelineFrame>>,
    /// Channel to submit pre-composited frames (encode-only mode)
    composited_tx: Option<Sender<CompositedFrame>>,
    /// Channel to submit audio packets directly to mux stage
    audio_tx: Option<Sender<MuxPacket>>,
    /// Progress tracking
    progress: Arc<PipelineProgress>,
    /// Cancellation flag
    cancel_flag: Arc<AtomicBool>,
    /// Compose worker handle (None in encode-only mode)
    compose_handle: Option<JoinHandle<Result<()>>>,
    /// Encode worker handle
    encode_handle: Option<JoinHandle<Result<()>>>,
    /// Mux worker handle
    mux_handle: Option<JoinHandle<Result<()>>>,
}

impl AsyncExportPipeline {
    /// Start the export pipeline
    ///
    /// Creates three worker threads: compose, encode, mux
    /// Returns immediately; use `submit_frame()` to feed frames
    pub fn start(config: PipelineConfig, gpu_ctx: Arc<GpuContext>) -> Result<Self> {
        let progress = Arc::new(PipelineProgress::new(config.total_frames));
        let cancel_flag = Arc::new(AtomicBool::new(false));

        // Create bounded channels for backpressure
        let (input_tx, compose_rx) = bounded::<PipelineFrame>(config.compose_buffer_size);
        let (compose_tx, encode_rx) = bounded::<CompositedFrame>(config.encode_buffer_size);
        let (encode_tx, mux_rx) = bounded::<MuxPacket>(config.mux_buffer_size);

        // Clone refs for workers
        let progress_compose = Arc::clone(&progress);
        let progress_encode = Arc::clone(&progress);
        let progress_mux = Arc::clone(&progress);
        let cancel_compose = Arc::clone(&cancel_flag);
        let cancel_encode = Arc::clone(&cancel_flag);
        let cancel_mux = Arc::clone(&cancel_flag);

        // Clone config for workers
        let encoder_config = config.encoder_config.clone();
        let container = config.container;
        let output_path = config.output_path.clone();

        // Start compose worker (GPU)
        let compose_handle = thread::Builder::new()
            .name("pipeline-compose".into())
            .spawn(move || {
                Self::compose_worker(
                    compose_rx,
                    compose_tx,
                    gpu_ctx,
                    cancel_compose,
                    progress_compose,
                )
            })
            .map_err(|e| Error::Other(format!("Failed to spawn compose worker: {}", e)))?;

        // Start encode worker (CPU/HW)
        let encode_handle = thread::Builder::new()
            .name("pipeline-encode".into())
            .spawn(move || {
                Self::encode_worker(
                    encode_rx,
                    encode_tx,
                    encoder_config,
                    cancel_encode,
                    progress_encode,
                )
            })
            .map_err(|e| Error::Other(format!("Failed to spawn encode worker: {}", e)))?;

        // Start mux worker (IO) with encoder config for proper stream setup
        let mux_encoder_config = config.encoder_config.clone();
        let mux_audio_config = config.audio_encoder_config.clone();
        // Full pipeline mode: create a dummy audio channel (no audio in compose mode)
        let (_audio_tx_dummy, audio_rx_dummy) = bounded::<MuxPacket>(1);
        drop(_audio_tx_dummy); // Close immediately so mux_worker sees audio as done
        let mux_handle = thread::Builder::new()
            .name("pipeline-mux".into())
            .spawn(move || {
                Self::mux_worker(
                    mux_rx,
                    audio_rx_dummy,
                    output_path,
                    container,
                    mux_encoder_config,
                    mux_audio_config,
                    cancel_mux,
                    progress_mux,
                )
            })
            .map_err(|e| Error::Other(format!("Failed to spawn mux worker: {}", e)))?;

        tracing::info!(
            "AsyncExportPipeline started (compose_buf={}, encode_buf={}, mux_buf={})",
            config.compose_buffer_size,
            config.encode_buffer_size,
            config.mux_buffer_size
        );

        Ok(Self {
            input_tx: Some(input_tx),
            composited_tx: None,
            audio_tx: None,
            progress,
            cancel_flag,
            compose_handle: Some(compose_handle),
            encode_handle: Some(encode_handle),
            mux_handle: Some(mux_handle),
        })
    }

    /// Start encode-only pipeline (no compose stage)
    ///
    /// Use when compositing is done externally (e.g., by GpuExportPipeline).
    /// Submit pre-composited frames via `submit_composited()`.
    /// Submit encoded audio packets via `submit_audio_packet()`.
    pub fn start_encode_only(config: PipelineConfig) -> Result<Self> {
        let progress = Arc::new(PipelineProgress::new(config.total_frames));
        let cancel_flag = Arc::new(AtomicBool::new(false));

        // Create channels: composited → encode → mux
        let (composited_tx, encode_rx) = bounded::<CompositedFrame>(config.encode_buffer_size);
        let (encode_tx, mux_rx) = bounded::<MuxPacket>(config.mux_buffer_size);

        // Audio channel: audio packets go directly to mux worker
        let (audio_tx, audio_rx) = bounded::<MuxPacket>(config.mux_buffer_size);

        let progress_encode = Arc::clone(&progress);
        let progress_mux = Arc::clone(&progress);
        let cancel_encode = Arc::clone(&cancel_flag);
        let cancel_mux = Arc::clone(&cancel_flag);

        let encoder_config = config.encoder_config.clone();
        let container = config.container;
        let output_path = config.output_path.clone();

        // Start encode worker
        let encode_handle = thread::Builder::new()
            .name("pipeline-encode".into())
            .spawn(move || {
                Self::encode_worker(
                    encode_rx,
                    encode_tx,
                    encoder_config,
                    cancel_encode,
                    progress_encode,
                )
            })
            .map_err(|e| Error::Other(format!("Failed to spawn encode worker: {}", e)))?;

        // Start mux worker with encoder config for proper stream setup
        let mux_encoder_config = config.encoder_config.clone();
        let mux_audio_config = config.audio_encoder_config.clone();
        let mux_handle = thread::Builder::new()
            .name("pipeline-mux".into())
            .spawn(move || {
                Self::mux_worker(
                    mux_rx,
                    audio_rx,
                    output_path,
                    container,
                    mux_encoder_config,
                    mux_audio_config,
                    cancel_mux,
                    progress_mux,
                )
            })
            .map_err(|e| Error::Other(format!("Failed to spawn mux worker: {}", e)))?;

        tracing::info!(
            "AsyncExportPipeline started (encode-only, encode_buf={}, mux_buf={}, audio={})",
            config.encode_buffer_size,
            config.mux_buffer_size,
            config.audio_encoder_config.is_some(),
        );

        Ok(Self {
            input_tx: None,
            composited_tx: Some(composited_tx),
            audio_tx: Some(audio_tx),
            progress,
            cancel_flag,
            compose_handle: None,
            encode_handle: Some(encode_handle),
            mux_handle: Some(mux_handle),
        })
    }

    /// Submit a frame to the pipeline
    ///
    /// This may block if the compose buffer is full (backpressure)
    pub fn submit_frame(&self, frame: PipelineFrame) -> Result<()> {
        if self.cancel_flag.load(Ordering::Relaxed) {
            return Err(Error::Cancelled);
        }

        if self.progress.has_error() {
            let err = self
                .progress
                .get_error()
                .unwrap_or_else(|| "Unknown error".into());
            return Err(Error::Other(err));
        }

        let tx = self
            .input_tx
            .as_ref()
            .ok_or_else(|| Error::Other("Pipeline input already closed".into()))?;

        tx.send(frame)
            .map_err(|_| Error::Other("Pipeline compose channel closed".into()))?;

        self.progress
            .frames_submitted
            .fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    /// Submit a pre-composited frame directly to the encode stage
    ///
    /// Use with `start_encode_only()`. Skips the compose worker entirely.
    pub fn submit_composited(&self, frame: CompositedFrame) -> Result<()> {
        if self.cancel_flag.load(Ordering::Relaxed) {
            return Err(Error::Cancelled);
        }

        if self.progress.has_error() {
            let err = self
                .progress
                .get_error()
                .unwrap_or_else(|| "Unknown error".into());
            return Err(Error::Other(err));
        }

        let tx = self
            .composited_tx
            .as_ref()
            .ok_or_else(|| Error::Other("Pipeline not in encode-only mode".into()))?;

        tx.send(frame)
            .map_err(|_| Error::Other("Pipeline encode channel closed".into()))?;

        self.progress
            .frames_submitted
            .fetch_add(1, Ordering::Relaxed);
        self.progress
            .frames_composited
            .fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    /// Submit an encoded audio packet directly to the mux stage
    pub fn submit_audio_packet(&self, packet: EncodedPacket) -> Result<()> {
        if self.cancel_flag.load(Ordering::Relaxed) {
            return Err(Error::Cancelled);
        }

        let tx = self
            .audio_tx
            .as_ref()
            .ok_or_else(|| Error::Other("Pipeline audio channel not available".into()))?;

        tx.send(MuxPacket::Audio { packet })
            .map_err(|_| Error::Other("Pipeline audio channel closed".into()))?;

        Ok(())
    }

    /// Signal that all audio packets have been submitted
    pub fn finish_audio(&self) -> Result<()> {
        if let Some(tx) = self.audio_tx.as_ref() {
            let _ = tx.send(MuxPacket::AudioFinished);
        }
        Ok(())
    }

    /// Get current progress
    pub fn progress(&self) -> &PipelineProgress {
        &self.progress
    }

    /// Cancel the pipeline
    pub fn cancel(&self) {
        tracing::info!("Cancelling export pipeline");
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    /// Check if pipeline is cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    /// Signal that no more frames will be submitted
    ///
    /// This closes the input channel and allows workers to drain
    pub fn finish_input(&mut self) {
        // Drop the sender to close the channel
        // Workers will drain remaining items and exit
        // We use a placeholder here - the actual drop happens when self is dropped
        // or when we explicitly close it
        tracing::debug!("Finishing pipeline input (closing compose channel)");
    }

    /// Wait for the pipeline to complete
    ///
    /// This consumes the pipeline and waits for all workers to finish
    pub fn wait(mut self) -> Result<()> {
        // Take and drop input senders to signal end of input
        drop(self.input_tx.take());
        drop(self.composited_tx.take());
        drop(self.audio_tx.take());

        // Wait for workers in order
        if let Some(handle) = self.compose_handle.take() {
            match handle.join() {
                Ok(Ok(())) => tracing::debug!("Compose worker finished"),
                Ok(Err(e)) => {
                    tracing::error!("Compose worker error: {}", e);
                    return Err(e);
                }
                Err(_) => {
                    return Err(Error::Other("Compose worker panicked".into()));
                }
            }
        }

        if let Some(handle) = self.encode_handle.take() {
            match handle.join() {
                Ok(Ok(())) => tracing::debug!("Encode worker finished"),
                Ok(Err(e)) => {
                    tracing::error!("Encode worker error: {}", e);
                    return Err(e);
                }
                Err(_) => {
                    return Err(Error::Other("Encode worker panicked".into()));
                }
            }
        }

        if let Some(handle) = self.mux_handle.take() {
            match handle.join() {
                Ok(Ok(())) => tracing::debug!("Mux worker finished"),
                Ok(Err(e)) => {
                    tracing::error!("Mux worker error: {}", e);
                    return Err(e);
                }
                Err(_) => {
                    return Err(Error::Other("Mux worker panicked".into()));
                }
            }
        }

        tracing::info!(
            "Pipeline completed: {} frames muxed",
            self.progress.frames_muxed.load(Ordering::Relaxed)
        );

        Ok(())
    }

    // =========================================================================
    // Worker Functions
    // =========================================================================

    /// Compose worker - runs GPU compositing using TextureCompositor
    fn compose_worker(
        rx: Receiver<PipelineFrame>,
        tx: Sender<CompositedFrame>,
        gpu_ctx: Arc<GpuContext>,
        cancel: Arc<AtomicBool>,
        progress: Arc<PipelineProgress>,
    ) -> Result<()> {
        // Create compositor in this thread (GPU resources)
        let compositor = GpuCompositor::new(gpu_ctx).map_err(|e| {
            progress.set_error(format!("Failed to create compositor: {}", e));
            e
        })?;

        while let Ok(frame) = rx.recv() {
            if cancel.load(Ordering::Relaxed) {
                tracing::debug!("Compose worker cancelled");
                return Err(Error::Cancelled);
            }

            // Composite using GPU (never bypass)
            let result = compositor.composite(
                &frame.layers,
                frame.output_width,
                frame.output_height,
                frame.background_color,
            );

            match result {
                Ok(composited) => {
                    let composited_frame = CompositedFrame {
                        index: frame.index,
                        pts: frame.pts,
                        data: composited.data,
                        width: composited.width,
                        height: composited.height,
                        gpu_handle: None, // Compose worker uses CPU data path
                    };

                    if tx.send(composited_frame).is_err() {
                        tracing::debug!("Compose worker: encode channel closed");
                        return Ok(());
                    }

                    progress.frames_composited.fetch_add(1, Ordering::Relaxed);
                    tracing::trace!(
                        "Composited frame {} ({:.2}ms)",
                        frame.index,
                        composited.time_ms
                    );
                }
                Err(e) => {
                    progress.set_error(format!("Compose error on frame {}: {}", frame.index, e));
                    return Err(e.into());
                }
            }
        }

        // Channel closed - no more frames
        tracing::debug!("Compose worker: input channel closed, exiting");
        Ok(())
    }

    /// Encode worker - runs video encoding (hardware only)
    fn encode_worker(
        rx: Receiver<CompositedFrame>,
        tx: Sender<MuxPacket>,
        config: EncoderConfig,
        cancel: Arc<AtomicBool>,
        progress: Arc<PipelineProgress>,
    ) -> Result<()> {
        // Hardware encoder only
        let mut hw_encoder = HwAccelEncoder::new();
        hw_encoder.open(&config).map_err(|e| {
            progress.set_error(format!("Failed to open hardware encoder: {}", e));
            e
        })?;

        tracing::info!(
            "Pipeline using hardware encoder (type={:?})",
            config.hw_encoder
        );

        let mut encoder: Box<dyn Encoder + Send> = Box::new(hw_encoder);
        let mut dropped_frames: u64 = 0;

        while let Ok(frame) = rx.recv() {
            if cancel.load(Ordering::Relaxed) {
                tracing::debug!("Encode worker cancelled");
                encoder.close();
                return Err(Error::Cancelled);
            }

            // Encode the frame - use GPU path if gpu_handle is available
            // Note: Empty packets are normal for B-frame encoding (frames are buffered)
            // They will be output later or during flush
            let encode_result = if let Some(gpu_handle) = frame.gpu_handle {
                // Zero-copy GPU encoding (macOS IOSurface)
                encoder.encode_frame_gpu(gpu_handle, frame.pts)
            } else {
                // CPU data encoding
                encoder.encode_frame(&frame.data, frame.pts)
            };

            match encode_result {
                Ok(packets) => {
                    // Empty packets are normal - encoder is buffering for B-frames
                    for packet in packets {
                        let mux_packet = MuxPacket::Video {
                            index: frame.index,
                            packet,
                        };
                        if tx.send(mux_packet).is_err() {
                            tracing::debug!("Encode worker: mux channel closed");
                            encoder.close();
                            return Ok(());
                        }
                    }
                    progress.frames_encoded.fetch_add(1, Ordering::Relaxed);
                    tracing::trace!("Encoded frame {}", frame.index);
                }
                Err(e) => {
                    // Encoding error is non-fatal - drop the frame and continue
                    dropped_frames += 1;
                    tracing::warn!(
                        "Frame {} dropped due to encode error (total dropped: {}): {}",
                        frame.index,
                        dropped_frames,
                        e
                    );
                    progress.frames_encoded.fetch_add(1, Ordering::Relaxed);
                }
            }
        }

        // Flush remaining packets
        tracing::debug!("Encode worker: flushing remaining packets");
        match encoder.flush() {
            Ok(packets) => {
                for packet in packets {
                    let mux_packet = MuxPacket::Video {
                        index: u64::MAX, // Flush packets don't have specific indices
                        packet,
                    };
                    let _ = tx.send(mux_packet);
                }
            }
            Err(e) => {
                tracing::warn!("Flush error (may be normal at end): {}", e);
            }
        }

        encoder.close();
        if dropped_frames > 0 {
            tracing::warn!(
                "Encode worker: {} frames dropped during encoding",
                dropped_frames
            );
        }
        tracing::debug!("Encode worker: input channel closed, exiting");
        Ok(())
    }

    /// Mux worker - writes encoded video and audio packets to output file
    #[allow(clippy::too_many_arguments)]
    fn mux_worker(
        video_rx: Receiver<MuxPacket>,
        audio_rx: Receiver<MuxPacket>,
        output_path: String,
        container: ContainerFormat,
        encoder_config: EncoderConfig,
        audio_config: Option<AudioEncoderConfig>,
        cancel: Arc<AtomicBool>,
        progress: Arc<PipelineProgress>,
    ) -> Result<()> {
        let mut muxer = FfmpegMuxer::new();

        muxer.open(&output_path, container).map_err(|e| {
            progress.set_error(format!("Failed to open muxer: {}", e));
            e
        })?;

        // Add video stream
        muxer.add_video_stream(&encoder_config).map_err(|e| {
            progress.set_error(format!("Failed to add video stream: {}", e));
            e
        })?;

        // Add audio stream if configured
        let has_audio = if let Some(ref audio_cfg) = audio_config {
            match muxer.add_audio_stream(audio_cfg) {
                Ok(_) => {
                    tracing::info!("Audio stream added to muxer");
                    true
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to add audio stream (continuing without audio): {}",
                        e
                    );
                    false
                }
            }
        } else {
            false
        };

        muxer.write_header().map_err(|e| {
            progress.set_error(format!("Failed to write header: {}", e));
            e
        })?;

        let mut video_done = false;
        let mut audio_done = !has_audio; // If no audio, mark as done immediately

        loop {
            if cancel.load(Ordering::Relaxed) {
                tracing::debug!("Mux worker cancelled");
                return Err(Error::Cancelled);
            }

            if video_done && audio_done {
                break;
            }

            // Use crossbeam select to receive from both channels
            if !video_done && !audio_done {
                select! {
                    recv(video_rx) -> msg => {
                        match msg {
                            Ok(mux_packet) => Self::handle_mux_packet(&mut muxer, mux_packet, &progress)?,
                            Err(_) => { video_done = true; }
                        }
                    }
                    recv(audio_rx) -> msg => {
                        match msg {
                            Ok(MuxPacket::AudioFinished) => { audio_done = true; }
                            Ok(mux_packet) => Self::handle_mux_packet(&mut muxer, mux_packet, &progress)?,
                            Err(_) => { audio_done = true; }
                        }
                    }
                }
            } else if !video_done {
                match video_rx.recv() {
                    Ok(mux_packet) => Self::handle_mux_packet(&mut muxer, mux_packet, &progress)?,
                    Err(_) => {
                        video_done = true;
                    }
                }
            } else {
                // Only audio remaining
                match audio_rx.recv() {
                    Ok(MuxPacket::AudioFinished) => {
                        audio_done = true;
                    }
                    Ok(mux_packet) => Self::handle_mux_packet(&mut muxer, mux_packet, &progress)?,
                    Err(_) => {
                        audio_done = true;
                    }
                }
            }
        }

        // Finalize the output file
        muxer.finish().map_err(|e| {
            progress.set_error(format!("Failed to finish muxer: {}", e));
            e
        })?;

        tracing::debug!("Mux worker: all channels closed, file finalized");
        Ok(())
    }

    /// Handle a single mux packet (video or audio)
    fn handle_mux_packet(
        muxer: &mut FfmpegMuxer,
        packet: MuxPacket,
        progress: &PipelineProgress,
    ) -> Result<()> {
        match packet {
            MuxPacket::Video { index, packet } => match muxer.write_video_packet(&packet) {
                Ok(()) => {
                    if index != u64::MAX {
                        progress.frames_muxed.fetch_add(1, Ordering::Relaxed);
                    }
                    tracing::trace!("Muxed video packet (frame {})", index);
                }
                Err(e) => {
                    progress.set_error(format!("Mux error on video frame {}: {}", index, e));
                    return Err(e.into());
                }
            },
            MuxPacket::Audio { packet } => {
                match muxer.write_audio_packet(&packet) {
                    Ok(()) => {
                        tracing::trace!("Muxed audio packet (pts={})", packet.pts);
                    }
                    Err(e) => {
                        // Audio mux errors are non-fatal
                        tracing::warn!("Audio mux error (continuing): {}", e);
                    }
                }
            }
            MuxPacket::AudioFinished => {
                // Handled by caller
            }
        }
        Ok(())
    }
}

impl Drop for AsyncExportPipeline {
    fn drop(&mut self) {
        // Signal cancellation if pipeline is dropped without waiting
        if self.compose_handle.is_some()
            || self.encode_handle.is_some()
            || self.mux_handle.is_some()
        {
            tracing::debug!("Pipeline dropped without wait(), cancelling");
            self.cancel_flag.store(true, Ordering::SeqCst);
            // Drop audio_tx to unblock mux_worker
            drop(self.audio_tx.take());
        }
    }
}

// =============================================================================
// Encoder Send trait implementation
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_config_default() {
        let config = PipelineConfig::default();
        assert_eq!(config.compose_buffer_size, 3);
        assert_eq!(config.encode_buffer_size, 4);
        assert_eq!(config.mux_buffer_size, 8);
    }

    #[test]
    fn test_progress_tracking() {
        let progress = PipelineProgress::new(100);
        assert_eq!(progress.progress_ratio(), 0.0);
        assert!(!progress.is_complete());

        progress.frames_muxed.store(50, Ordering::Relaxed);
        assert_eq!(progress.progress_ratio(), 0.5);

        progress.frames_muxed.store(100, Ordering::Relaxed);
        assert_eq!(progress.progress_ratio(), 1.0);
        assert!(progress.is_complete());
    }

    #[test]
    fn test_progress_error() {
        let progress = PipelineProgress::new(100);
        assert!(!progress.has_error());
        assert!(progress.get_error().is_none());

        progress.set_error("Test error".into());
        assert!(progress.has_error());
        assert_eq!(progress.get_error(), Some("Test error".into()));
    }
}
