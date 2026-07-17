//! VideoService implementation
//!
//! Provides video-related operations: probing, capture, extraction,
//! streaming, transcoding, keyframe analysis, waveform generation, and proxy creation.

use crate::domain::{
    CaptureOptions, ExtractOptions, ExtractType, FrameData, TaskHandle, TranscodeOptions,
};
use crate::encoder::{ContainerFormat, Encoder, EncoderConfig, FfmpegMuxer, HwAccelEncoder, Muxer};
use crate::error::{Error, Result};
use crate::services::impls::common::{convert_media_info, generate_waveform_blocking};
use crate::services::impls::stream_loop::{
    create_stream_channels, eof_idle_wait, normalize_stream_fps, pack_h264_frame, ActiveStreams,
    StreamLoopHandle, StreamPlaybackDelegate, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use crate::services::pipeline_sink::PipelineSink;
use crate::services::{IStreamPlayback, ITaskService, IVideoService, StreamSink};
use async_trait::async_trait;
use neko_engine_audio::{
    AudioDecoder, AudioEncoder, AudioEncoderConfig, FfmpegAudioDecoder, FfmpegAudioEncoder,
    SampleFormat,
};
use neko_engine_codec::decoder::{global_pool, Decoder, HwAccelDecoder, HwAccelType};
use neko_engine_codec::decoder::{IdrScanner, KeyframeInfo};
use neko_engine_gpu::{GpuContext, GpuPermit, PipelinePriority};
use neko_engine_types::{FrameFormat, LoopRegion, MediaInfo, StreamId, WaveformData};
use neko_runtime_media::{
    capture_video_frame, encode_rgba_to_jpeg, extract_subtitles, global_probe_cache,
    VideoFrameCaptureOptions,
};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Infer ContainerFormat from output file extension
fn container_from_path(path: &Path) -> ContainerFormat {
    match path.extension().and_then(|e| e.to_str()) {
        Some("mp4") | Some("m4v") => ContainerFormat::Mp4,
        Some("mkv") => ContainerFormat::Mkv,
        Some("webm") => ContainerFormat::Webm,
        Some("mov") => ContainerFormat::Mov,
        _ => ContainerFormat::Mp4, // Default
    }
}

fn validate_video_probe(media_info: &neko_runtime_media::MediaInfo, source: &Path) -> Result<()> {
    if media_info.width == 0 || media_info.height == 0 {
        return Err(Error::UnsupportedCapability(format!(
            "No video stream found in {}",
            source.display()
        )));
    }
    Ok(())
}

/// VideoService implementation
///
/// Wraps decoder, encoder, and media_service modules.
pub struct VideoService {
    /// GPU context for hardware acceleration
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
    /// Delegate for stream playback control (stop/pause/resume/speed/seek/loop)
    playback: StreamPlaybackDelegate,
}

impl VideoService {
    /// Create a new VideoService
    pub fn new(
        gpu_ctx: Option<Arc<GpuContext>>,
        _task_service: Arc<dyn ITaskService + Send + Sync>,
    ) -> Self {
        let active_streams = Arc::new(ActiveStreams::new());
        let playback = StreamPlaybackDelegate::new(active_streams.clone());
        Self {
            gpu_ctx,
            active_streams,
            playback,
        }
    }
}

#[async_trait]
impl IStreamPlayback for VideoService {
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.stop_stream(stream_id).await
    }

    async fn pause(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.pause(stream_id).await
    }

    async fn resume(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.resume(stream_id).await
    }

    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        self.playback.set_speed(stream_id, speed).await
    }

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.playback.seek(stream_id, time_seconds).await
    }

    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()> {
        self.playback.set_loop(stream_id, region).await
    }
}

#[async_trait]
impl IVideoService for VideoService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        // Use blocking task for FFmpeg probe
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || global_probe_cache().probe(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(convert_media_info(info))
    }

    async fn capture(
        &self,
        source: &Path,
        time_seconds: f64,
        options: CaptureOptions,
    ) -> Result<FrameData> {
        let source = source.to_path_buf();
        let capture_options = VideoFrameCaptureOptions {
            quality: options.quality,
            format: options.format,
            width: options.width,
            height: options.height,
        };

        // Still-frame capture favors deterministic thumbnails over GPU zero-copy throughput.
        let result = tokio::task::spawn_blocking(move || -> Result<FrameData> {
            let frame = capture_video_frame(&source, time_seconds, capture_options)?;
            Ok(FrameData {
                data: frame.data,
                width: frame.width,
                height: frame.height,
                format: frame.format,
                timestamp: frame.timestamp,
                diagnostics: None,
            })
        })
        .await
        .map_err(|e| Error::Other(format!("Capture task failed: {}", e)))??;

        Ok(result)
    }

    async fn extract(
        &self,
        source: &Path,
        options: ExtractOptions,
        _task_handle: Option<TaskHandle>,
    ) -> Result<Vec<FrameData>> {
        match options.extract_type {
            ExtractType::Subtitles => {
                let path = source.to_string_lossy().to_string();
                let tracks = tokio::task::spawn_blocking(move || extract_subtitles(&path))
                    .await
                    .map_err(|e| {
                        Error::Other(format!("Subtitle extraction task failed: {}", e))
                    })??;

                // Convert internal types to neko_engine_types (which has Serialize)
                let typed_tracks: Vec<neko_engine_types::ExtractedSubtitleTrack> = tracks
                    .into_iter()
                    .map(|t| neko_engine_types::ExtractedSubtitleTrack {
                        index: t.stream_index,
                        language: t.language,
                        cues: t
                            .cues
                            .into_iter()
                            .map(|c| neko_engine_types::SubtitleCue {
                                start_time: c.start_time,
                                end_time: c.end_time,
                                text: c.text,
                            })
                            .collect(),
                    })
                    .collect();

                let json = serde_json::to_vec(&typed_tracks)
                    .map_err(|e| Error::Other(format!("Subtitle serialization failed: {}", e)))?;

                Ok(vec![FrameData {
                    data: json,
                    width: 0,
                    height: 0,
                    format: FrameFormat::Rgba, // Marker; actual data is JSON
                    timestamp: 0.0,
                    diagnostics: None,
                }])
            }
            ExtractType::Frame { time } => {
                let frame = self
                    .capture(source, time, CaptureOptions::default())
                    .await?;
                Ok(vec![frame])
            }
            ExtractType::FrameRange { start, end, fps } => {
                let frame_interval = 1.0 / fps;
                let mut frames = Vec::new();
                let mut time = start;
                while time <= end {
                    let frame = self
                        .capture(source, time, CaptureOptions::default())
                        .await?;
                    frames.push(frame);
                    time += frame_interval;
                }
                Ok(frames)
            }
        }
    }

    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let gpu_ctx = self
            .gpu_ctx
            .clone()
            .ok_or_else(|| Error::Other("GPU context required for video streaming".to_string()))?;
        let budget = gpu_ctx.budget_controller().clone();

        let path = source.to_string_lossy().to_string();

        // Probe to get video info
        let media_info = tokio::task::spawn_blocking({
            let path = path.clone();
            move || global_probe_cache().probe(Path::new(&path))
        })
        .await
        .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;
        validate_video_probe(&media_info, source)?;

        let width = media_info.width;
        let height = media_info.height;
        let fps = normalize_stream_fps(media_info.fps);

        // Create stream channels
        let (stream_id, tx, rx, cancel, state_tx, state_rx) =
            create_stream_channels(session_id, 64);

        // =====================================================================
        // Two-thread architecture: Encode Thread + Pacing Thread
        //
        // Encode Thread: decode → encode → push to FrameQueue (as fast as possible)
        // Pacing Thread: pop from FrameQueue → pace → send via broadcast
        //
        // The FrameQueue (sync_channel) absorbs encoding time variance
        // (e.g. keyframe encoding takes ~130ms vs ~3ms for delta frames),
        // ensuring smooth output regardless of encode cost fluctuations.
        // =====================================================================

        // FrameQueue: bounded channel between encode and pacing threads
        // Capacity 8 frames ≈ 267ms at 30fps, enough to absorb keyframe spikes
        let (queue_tx, queue_rx) = std::sync::mpsc::sync_channel::<crate::domain::FrameData>(8);

        // Seek counter: encode thread increments on seek, pacing thread drains queue when it detects change
        let seek_counter = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let seek_counter_enc = seek_counter.clone();
        let seek_counter_pac = seek_counter.clone();

        let cancel_clone = cancel.clone();
        let cancel_clone2 = cancel.clone();
        let budget_pipeline_id = format!("video-stream:{}", stream_id.as_str());
        // Create a second watch receiver for the pacing thread
        let pacing_state_rx = state_tx.subscribe();
        let streams_clone = self.active_streams.clone();
        let stream_id_clone = stream_id.clone();

        let join_handle = tokio::task::spawn_blocking(move || {
            // =================================================================
            // Encode Thread: decode + encode as fast as possible
            // =================================================================
            let encode_cancel = cancel_clone.clone();
            let encode_handle = std::thread::spawn(move || {
                let budget = budget;
                let budget_pipeline_id = budget_pipeline_id;
                let _budget_guard = budget
                    .register_pipeline(budget_pipeline_id.clone(), PipelinePriority::Interactive);
                // Acquire decoder from pool (reuses existing if available)
                let pool = global_pool();
                let mut guard = match pool.acquire(&path, HwAccelType::Auto) {
                    Ok(g) => g,
                    Err(e) => {
                        tracing::error!("Failed to acquire decoder from pool: {}", e);
                        return;
                    }
                };
                // Take decoder from guard for long-lived ownership in stream loop
                let mut decoder = match guard.take_decoder() {
                    Some(d) => d,
                    None => {
                        tracing::error!("Decoder guard was empty");
                        return;
                    }
                };
                let decoder_path = path.clone();

                // Get stream time_base for PTS→microseconds conversion
                let time_base = decoder.time_base();

                let encoder_config =
                    EncoderConfig::new(width, height, fps, crate::encoder::VideoCodec::H264)
                        .with_preset(crate::encoder::EncoderPreset::Fast)
                        .with_hw_encoder(crate::encoder::HwEncoderType::Auto)
                        .with_gop_size(1) // All-Intra: every frame is a keyframe (uniform encode cost)
                        .with_max_b_frames(0);
                let enc_pool = crate::encoder::global_encoder_pool();
                let mut encoder = match enc_pool.acquire(&encoder_config) {
                    Ok(e) => e,
                    Err(e) => {
                        tracing::error!("Failed to acquire encoder from pool: {}", e);
                        return;
                    }
                };

                let mut current_speed = 1.0;
                let mut last_seek_seq: u64 = 0;
                // After seek, discard frames whose PTS is before the seek target.
                // FFmpeg decode-seek lands on the nearest keyframe BEFORE the target,
                // so without this we'd briefly show wrong-position frames.
                let mut seek_skip_until: Option<f64> = None;
                // Consecutive decode error counter: flush+retry up to N times before
                // treating the stream as unrecoverable and closing it.
                let mut consecutive_decode_errors: u32 = 0;
                const MAX_DECODE_ERRORS: u32 = 5;

                loop {
                    if encode_cancel.is_cancelled() {
                        break;
                    }

                    let state = state_rx.borrow().clone();

                    // Handle seek: flush decoder + reset encoder (dedup via seek_seq)
                    let mut did_seek = false;
                    if let Some(time) = state.seek_to {
                        if state.seek_seq != last_seek_seq {
                            last_seek_seq = state.seek_seq;
                            did_seek = true;
                            // Reset error counter: each seek gets a fresh error budget.
                            // Without this, errors from a previous seek accumulate and
                            // can prematurely close the stream on rapid seeking.
                            consecutive_decode_errors = 0;
                            // Arm skip filter: discard decoded frames before target.
                            // FFmpeg seeks to the keyframe BEFORE time; we skip-decode
                            // to avoid sending pre-seek frames to the client.
                            seek_skip_until = Some(time);
                            let _ = decoder.seek(time);
                            Encoder::close(&mut encoder);
                            if let Err(e) = Encoder::open(&mut encoder, &encoder_config) {
                                tracing::error!("Failed to re-open encoder after seek: {}", e);
                                break;
                            }
                            // Signal pacing thread to drain stale frames
                            seek_counter_enc.fetch_add(1, std::sync::atomic::Ordering::Release);
                        }
                    }

                    // Paused: sleep unless we just seeked (produce one frame for preview)
                    if state.paused && !did_seek {
                        std::thread::sleep(std::time::Duration::from_millis(16));
                        continue;
                    }

                    // Track speed changes (encode thread doesn't pace, but needs
                    // to know speed for potential future use)
                    if (state.speed - current_speed).abs() > 0.001 {
                        current_speed = state.speed;
                    }

                    match budget
                        .acquire_permit(budget_pipeline_id.clone(), PipelinePriority::Interactive)
                    {
                        GpuPermit::Proceed => {}
                        GpuPermit::Queued { retry_after, .. }
                        | GpuPermit::Paused { retry_after, .. } => {
                            std::thread::sleep(retry_after);
                            continue;
                        }
                    }

                    // Decode next GPU frame
                    let gpu_start = std::time::Instant::now();
                    let gpu_texture = match decoder.decode_next_gpu() {
                        Ok(Some(t)) => {
                            consecutive_decode_errors = 0; // Reset on success
                            t
                        }
                        Ok(None) => {
                            let state = state_rx.borrow().clone();
                            if let Some(region) = &state.loop_region {
                                let _ = decoder.seek(region.in_point);
                                continue;
                            } else {
                                // No loop: enter EOF idle wait for seek
                                match eof_idle_wait(
                                    &encode_cancel,
                                    &state_rx,
                                    last_seek_seq,
                                    EOF_IDLE_TIMEOUT,
                                ) {
                                    Some(time) => {
                                        let _ = decoder.seek(time);
                                        Encoder::close(&mut encoder);
                                        if let Err(e) = Encoder::open(&mut encoder, &encoder_config)
                                        {
                                            tracing::error!(
                                                "Failed to re-open encoder after EOF seek: {}",
                                                e
                                            );
                                            break;
                                        }
                                        seek_counter_enc
                                            .fetch_add(1, std::sync::atomic::Ordering::Release);
                                        continue;
                                    }
                                    None => break, // Cancelled or timeout
                                }
                            }
                        }
                        Err(e) => {
                            consecutive_decode_errors += 1;
                            if consecutive_decode_errors > MAX_DECODE_ERRORS {
                                tracing::warn!(
                                    "Video stream closing after {} consecutive decode errors (last: {})",
                                    consecutive_decode_errors,
                                    e
                                );
                                break;
                            }
                            tracing::warn!(
                                "Video stream decode error ({}/{}): {} — flushing decoder to recover",
                                consecutive_decode_errors,
                                MAX_DECODE_ERRORS,
                                e
                            );
                            // Flush the hardware decoder by seeking to the current position.
                            // This clears corrupt/misaligned NAL state so the next packet
                            // is decoded cleanly from a keyframe boundary.
                            let pos = decoder.position().max(0.0);
                            let _ = decoder.seek(pos);
                            continue;
                        }
                    };

                    // Skip pre-seek frames: after decode-seek, FFmpeg starts from the
                    // keyframe before the target. Discard frames until we reach it.
                    if let Some(target_secs) = seek_skip_until {
                        let frame_secs = gpu_texture.pts as f64 * time_base;
                        // Allow ≤2 frames tolerance (67ms at 30fps) for keyframe alignment
                        if frame_secs < target_secs - 0.067 {
                            continue; // Decode next without encoding
                        }
                        seek_skip_until = None; // Reached seek target — start sending
                    }

                    let tex_width = gpu_texture.width;
                    let tex_height = gpu_texture.height;
                    let pts = gpu_texture.pts;

                    let gpu_handle = match gpu_texture.handle {
                        #[cfg(target_os = "macos")]
                        neko_engine_codec::decoder::GpuTextureHandle::VideoToolbox {
                            io_surface,
                            ..
                        } => io_surface,
                        #[allow(unreachable_patterns)]
                        _ => {
                            tracing::warn!("Unsupported GPU texture handle for encoding");
                            break;
                        }
                    };

                    match Encoder::encode_frame_gpu(&mut encoder, gpu_handle, pts) {
                        Ok(packets) => {
                            budget.report_frame_time(
                                budget_pipeline_id.clone(),
                                PipelinePriority::Interactive,
                                gpu_start.elapsed(),
                            );
                            for p in &packets {
                                let frame_data =
                                    pack_h264_frame(p, tex_width, tex_height, time_base);
                                // Push to FrameQueue; blocks if queue is full (backpressure)
                                if queue_tx.send(frame_data).is_err() {
                                    // Pacing thread exited
                                    return;
                                }
                            }
                        }
                        Err(e) => {
                            budget.report_frame_time(
                                budget_pipeline_id.clone(),
                                PipelinePriority::Interactive,
                                gpu_start.elapsed(),
                            );
                            tracing::warn!("Video stream encode error: {}", e);
                            break;
                        }
                    }
                }

                // Flush encoder and return to pool
                if let Ok(packets) = Encoder::flush(&mut encoder) {
                    for p in &packets {
                        let _ = queue_tx.send(pack_h264_frame(p, width, height, time_base));
                    }
                }
                enc_pool.release(encoder, encoder_config);

                // Return decoder to pool for reuse by future streams
                pool.return_decoder(decoder, &decoder_path, HwAccelType::Auto);
            });

            // =================================================================
            // Pacing Thread (runs on the spawn_blocking thread itself):
            // Pop from FrameQueue → pace by wall clock → send via broadcast
            // =================================================================
            let mut pacer = WallClockPacer::new(fps, 1.0);
            let mut current_speed = 1.0;
            let mut last_seen_paused = false;
            let mut last_seek_count = 0u64;

            loop {
                if cancel_clone2.is_cancelled() {
                    break;
                }

                // Detect seek: drain stale frames from queue
                let current_seek = seek_counter_pac.load(std::sync::atomic::Ordering::Acquire);
                if current_seek != last_seek_count {
                    last_seek_count = current_seek;
                    // Drain all stale frames from the queue
                    while queue_rx.try_recv().is_ok() {}
                    pacer.reset();
                }

                // Check for speed/pause changes from state channel
                {
                    let state = pacing_state_rx.borrow().clone();

                    // Detect pause→resume transition: reset pacer
                    if last_seen_paused && !state.paused {
                        pacer.reset();
                    }
                    last_seen_paused = state.paused;

                    if (state.speed - current_speed).abs() > 0.001 {
                        current_speed = state.speed;
                        pacer.update_speed(current_speed);
                    }

                    // When paused, don't consume from queue
                    if state.paused {
                        std::thread::sleep(std::time::Duration::from_millis(16));
                        continue;
                    }
                }

                // Wait for next frame time
                pacer.wait_for_next_frame();

                // Pop from FrameQueue
                match queue_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(frame_data) => {
                        let _ = tx.send(frame_data);
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Queue empty — encode thread might be slow or paused
                        // Reset pacer to avoid accumulating debt
                        pacer.reset();
                        continue;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        // Encode thread finished
                        break;
                    }
                }
            }

            // Wait for encode thread to finish
            let _ = encode_handle.join();

            // Self-cleanup: remove handle from ActiveStreams when loop exits
            let rt = tokio::runtime::Handle::current();
            rt.block_on(streams_clone.remove(stream_id_clone.as_str()));
        });

        // Store handle
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        self.active_streams.insert(handle).await;

        Ok((stream_id, rx))
    }

    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: TranscodeOptions,
        _task_handle: Option<TaskHandle>,
    ) -> Result<()> {
        let path = source.to_string_lossy().to_string();
        let output = output_path.to_path_buf();
        let budget = self
            .gpu_ctx
            .as_ref()
            .map(|ctx| ctx.budget_controller().clone())
            .unwrap_or_default();
        let budget_pipeline_id = format!("video-transcode:{}", output.display());

        tokio::task::spawn_blocking(move || -> Result<()> {
            let _budget_guard =
                budget.register_pipeline(budget_pipeline_id.clone(), PipelinePriority::Transcode);
            // =====================================================
            // Video decoder + encoder
            // =====================================================
            let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
            let media_info = decoder.open(&path)?;

            let width = options
                .resolution
                .map(|r| r.width)
                .unwrap_or(media_info.width);
            let height = options
                .resolution
                .map(|r| r.height)
                .unwrap_or(media_info.height);
            let fps = media_info.fps;

            let codec = options.video_codec;
            let mut encoder_config = EncoderConfig::new(width, height, fps, codec);
            if let Some(bitrate) = options.bitrate {
                encoder_config = encoder_config.with_bitrate(bitrate);
            }
            encoder_config = encoder_config
                .with_preset(options.preset)
                .with_hw_encoder(options.hw_encoder);

            let mut video_encoder = HwAccelEncoder::new();
            Encoder::open(&mut video_encoder, &encoder_config)?;

            // =====================================================
            // Audio decoder + encoder (optional)
            // =====================================================
            let mut audio_decoder: Option<FfmpegAudioDecoder> = None;
            let mut audio_encoder: Option<FfmpegAudioEncoder> = None;
            let mut audio_config: Option<AudioEncoderConfig> = None;

            if let Some(audio_codec) = options.audio_codec {
                // Try to open audio decoder
                let mut adec = FfmpegAudioDecoder::new()
                    .with_output_format(SampleFormat::F32)
                    .with_output_sample_rate(48000)
                    .with_output_channels(2);

                match AudioDecoder::open(&mut adec, &path) {
                    Ok(_audio_info) => {
                        // Configure audio encoder
                        let mut aconfig = AudioEncoderConfig::new(48000, 2, audio_codec);
                        if let Some(bitrate) = options.audio_bitrate {
                            aconfig = aconfig.with_bitrate(bitrate);
                        }
                        aconfig = aconfig.with_sample_format(SampleFormat::F32);

                        let mut aenc = FfmpegAudioEncoder::new();
                        if let Err(e) = AudioEncoder::open(&mut aenc, &aconfig) {
                            tracing::warn!("Failed to open audio encoder, skipping audio: {}", e);
                        } else {
                            audio_config = Some(aconfig);
                            audio_encoder = Some(aenc);
                            audio_decoder = Some(adec);
                        }
                    }
                    Err(e) => {
                        tracing::info!("No audio stream in source, skipping audio: {}", e);
                    }
                }
            }

            // =====================================================
            // Muxer setup
            // =====================================================
            let mut muxer = FfmpegMuxer::new();
            let container = container_from_path(&output);
            muxer.open(output.to_str().unwrap_or("output.mp4"), container)?;
            muxer.add_video_stream(&encoder_config)?;

            if let Some(ref aconfig) = audio_config {
                muxer.add_audio_stream(aconfig)?;
                // Copy encoder extradata to muxer stream (required for Opus in MP4)
                if let Some(ref aenc) = audio_encoder {
                    if let Some(extradata) = aenc.get_extradata() {
                        muxer.set_audio_extradata(&extradata)?;
                    }
                }
            }
            muxer.write_header()?;

            // =====================================================
            // Interleaved decode → encode → mux loop
            // =====================================================
            // Strategy: decode all video first while interleaving audio.
            // For each video frame decoded, also drain available audio frames
            // up to the same PTS to maintain interleaving.
            let time_base = 1.0 / fps;
            let mut video_done = false;
            let mut audio_done = audio_decoder.is_none();

            loop {
                if video_done && audio_done {
                    break;
                }

                // Decode + encode video frame
                if !video_done {
                    let _permit = budget
                        .wait_for_resume(budget_pipeline_id.clone(), PipelinePriority::Transcode);
                    let gpu_start = std::time::Instant::now();
                    match decoder.decode_next_gpu()? {
                        Some(nv12_texture) => {
                            let gpu_handle = match nv12_texture.handle {
                                #[cfg(target_os = "macos")]
                                neko_engine_codec::decoder::GpuTextureHandle::VideoToolbox {
                                    io_surface,
                                    ..
                                } => io_surface,
                                #[allow(unreachable_patterns)]
                                _ => {
                                    return Err(Error::Other(
                                        "Unsupported GPU texture handle for encoding".to_string(),
                                    ))
                                }
                            };
                            let packets =
                                video_encoder.encode_frame_gpu(gpu_handle, nv12_texture.pts)?;
                            budget.report_frame_time(
                                budget_pipeline_id.clone(),
                                PipelinePriority::Transcode,
                                gpu_start.elapsed(),
                            );
                            for packet in &packets {
                                muxer.write_video_packet(packet)?;
                            }

                            // Drain audio up to current video time
                            let video_time = nv12_texture.pts as f64 * time_base;
                            if let (Some(ref mut adec), Some(ref mut aenc)) =
                                (&mut audio_decoder, &mut audio_encoder)
                            {
                                while !audio_done {
                                    match AudioDecoder::decode_next(adec) {
                                        Ok(Some(frame)) => {
                                            let apackets = AudioEncoder::encode_frame(
                                                aenc,
                                                &frame.data,
                                                frame.samples,
                                            )?;
                                            for ap in &apackets {
                                                let video_packet = crate::encoder::EncodedPacket {
                                                    data: ap.data.clone(),
                                                    pts: ap.pts,
                                                    dts: ap.pts,
                                                    is_keyframe: true,
                                                    duration: ap.duration,
                                                    stream_index: 1,
                                                };
                                                muxer.write_audio_packet(&video_packet)?;
                                            }
                                            if frame.timestamp > video_time + 0.5 {
                                                break; // Don't get too far ahead
                                            }
                                        }
                                        Ok(None) => {
                                            audio_done = true;
                                        }
                                        Err(e) => {
                                            tracing::warn!(
                                                "Audio decode error during transcode: {}",
                                                e
                                            );
                                            audio_done = true;
                                        }
                                    }
                                }
                            }
                        }
                        None => {
                            budget.report_frame_time(
                                budget_pipeline_id.clone(),
                                PipelinePriority::Transcode,
                                gpu_start.elapsed(),
                            );
                            video_done = true;
                        }
                    }
                } else if !audio_done {
                    // Video done, drain remaining audio
                    if let (Some(ref mut adec), Some(ref mut aenc)) =
                        (&mut audio_decoder, &mut audio_encoder)
                    {
                        match AudioDecoder::decode_next(adec) {
                            Ok(Some(frame)) => {
                                let apackets =
                                    AudioEncoder::encode_frame(aenc, &frame.data, frame.samples)?;
                                for ap in &apackets {
                                    let video_packet = crate::encoder::EncodedPacket {
                                        data: ap.data.clone(),
                                        pts: ap.pts,
                                        dts: ap.pts,
                                        is_keyframe: true,
                                        duration: ap.duration,
                                        stream_index: 1,
                                    };
                                    muxer.write_audio_packet(&video_packet)?;
                                }
                            }
                            Ok(None) => {
                                audio_done = true;
                            }
                            Err(_) => {
                                audio_done = true;
                            }
                        }
                    }
                }
            }

            // Flush video encoder
            let flush_packets = Encoder::flush(&mut video_encoder)?;
            for packet in &flush_packets {
                muxer.write_video_packet(packet)?;
            }
            Encoder::close(&mut video_encoder);

            // Flush audio encoder
            if let Some(ref mut aenc) = audio_encoder {
                let flush_packets = AudioEncoder::flush(aenc)?;
                for ap in &flush_packets {
                    let video_packet = crate::encoder::EncodedPacket {
                        data: ap.data.clone(),
                        pts: ap.pts,
                        dts: ap.pts,
                        is_keyframe: true,
                        duration: ap.duration,
                        stream_index: 1,
                    };
                    muxer.write_audio_packet(&video_packet)?;
                }
                AudioEncoder::close(aenc);
            }

            muxer.finish()?;

            Ok(())
        })
        .await
        .map_err(|e| Error::Other(format!("Transcode task failed: {}", e)))?
    }

    async fn get_keyframes(&self, source: &Path) -> Result<Vec<KeyframeInfo>> {
        let path = source.to_string_lossy().to_string();
        tokio::task::spawn_blocking(move || {
            let scanner = IdrScanner::new(&path)?;
            scanner.scan_idr_frames()
        })
        .await
        .map_err(|e| Error::Other(format!("Keyframe scan task failed: {}", e)))?
        .map_err(Into::into)
    }

    async fn generate_waveform(
        &self,
        source: &Path,
        _task_handle: Option<TaskHandle>,
    ) -> Result<WaveformData> {
        let path = source.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || generate_waveform_blocking(&path))
            .await
            .map_err(|e| Error::Other(format!("Waveform generation task failed: {}", e)))?
    }

    async fn generate_proxy(
        &self,
        source: &Path,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()> {
        // Probe to get original resolution
        let path = source.to_string_lossy().to_string();
        let media_info = tokio::task::spawn_blocking({
            let path = path.clone();
            move || global_probe_cache().probe(Path::new(&path))
        })
        .await
        .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        // Proxy: 1/4 resolution, max 960x540, low bitrate, fast preset
        let proxy_width = (media_info.width / 4).max(320);
        let proxy_height = (media_info.height / 4).max(180);
        let (proxy_width, proxy_height) = if proxy_width > 960 {
            let scale = 960.0 / proxy_width as f64;
            (
                (proxy_width as f64 * scale) as u32,
                (proxy_height as f64 * scale) as u32,
            )
        } else {
            (proxy_width, proxy_height)
        };
        // Ensure even dimensions
        let proxy_width = proxy_width & !1;
        let proxy_height = proxy_height & !1;

        let proxy_options = TranscodeOptions {
            video_codec: neko_engine_types::VideoCodec::H264,
            resolution: Some(neko_engine_types::Resolution::new(
                proxy_width,
                proxy_height,
            )),
            bitrate: Some(1_000_000), // 1 Mbps
            hw_encoder: neko_engine_types::HwEncoderType::Auto,
            preset: neko_engine_types::EncoderPreset::Fast,
            audio_codec: Some(neko_engine_types::AudioCodec::Opus),
            audio_bitrate: None,
        };

        self.transcode(source, output_path, proxy_options, task_handle)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::TaskService;

    fn create_test_service() -> VideoService {
        let task_service = Arc::new(TaskService::new());
        VideoService::new(None, task_service)
    }

    #[tokio::test]
    async fn test_video_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.mp4")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_get_keyframes_nonexistent() {
        let service = create_test_service();
        let result = service
            .get_keyframes(Path::new("/nonexistent/file.mp4"))
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_generate_waveform_nonexistent() {
        let service = create_test_service();
        let result = service
            .generate_waveform(Path::new("/nonexistent/file.mp4"), None)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_subtitles_nonexistent() {
        let service = create_test_service();
        let options = ExtractOptions {
            extract_type: ExtractType::Subtitles,
            time_range: None,
        };
        let result = service
            .extract(Path::new("/nonexistent/file.mp4"), options, None)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_frame_no_gpu() {
        let service = create_test_service();
        let options = ExtractOptions {
            extract_type: ExtractType::Frame { time: 1.0 },
            time_range: None,
        };
        let result = service
            .extract(Path::new("/nonexistent/file.mp4"), options, None)
            .await;
        // Should fail because no GPU context or file doesn't exist
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_frame_range_no_gpu() {
        let service = create_test_service();
        let options = ExtractOptions {
            extract_type: ExtractType::FrameRange {
                start: 0.0,
                end: 5.0,
                fps: 1.0,
            },
            time_range: None,
        };
        let result = service
            .extract(Path::new("/nonexistent/file.mp4"), options, None)
            .await;
        // Should fail because no GPU context or file doesn't exist
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_start_stream_no_gpu() {
        let service = create_test_service();
        let result = service.start_stream(Path::new("test"), "session1").await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("GPU context required"));
    }

    #[tokio::test]
    async fn test_video_service_stop_stream_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.stop_stream(&stream_id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Stream not found"));
    }

    #[tokio::test]
    async fn test_video_service_transcode_nonexistent() {
        let service = create_test_service();
        let result = service
            .transcode(
                Path::new("/nonexistent/file.mp4"),
                Path::new("/tmp/out.mp4"),
                TranscodeOptions::default(),
                None,
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_generate_proxy_nonexistent() {
        let service = create_test_service();
        let result = service
            .generate_proxy(
                Path::new("/nonexistent/file.mp4"),
                Path::new("/tmp/proxy.mp4"),
                None,
            )
            .await;
        assert!(result.is_err());
    }
}
