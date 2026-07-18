//! CLI runner - handles different command modes
//!
//! All commands go through EngineApi for consistent MVC architecture.
//! The CLI layer is purely a View adapter — it handles user interaction
//! (progress bars, formatting) while delegating business logic to the engine.

use std::path::PathBuf;
use std::sync::Arc;

use crate::args::{ActionOpts, Command, TimelineAction};
use indicatif::{ProgressBar, ProgressStyle};
use neko_engine_types::{ActionRequest, EngineConfig};
use neko_host_api::{
    EngineApi, ExportHwEncoder, ExportJobConfig, ExportPreset, ExportVideoCodec, JviLoader,
};

/// CLI runner for executing commands
pub struct Runner {
    engine: Option<Arc<EngineApi>>,
}

impl Runner {
    pub fn new() -> Self {
        Self { engine: None }
    }

    /// Initialize the engine with optional config (lazy initialization)
    async fn get_engine(
        &mut self,
    ) -> Result<Arc<EngineApi>, Box<dyn std::error::Error + Send + Sync>> {
        if self.engine.is_none() {
            let config = EngineConfig::load(None, None)?;
            let engine = EngineApi::with_config(config).await.map_err(|e| {
                Box::new(std::io::Error::other(format!(
                    "Failed to initialize engine: {}",
                    e
                ))) as Box<dyn std::error::Error + Send + Sync>
            })?;
            self.engine = Some(Arc::new(engine));
        }
        Ok(self.engine.clone().unwrap())
    }

    /// Run the specified command
    pub async fn run(
        &mut self,
        command: Command,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match command {
            Command::Serve { port, config, .. } => self.run_server(port, config).await,

            // Groups with typed actions — extract (group, action_name, opts) and dispatch
            Command::Nodes { action } => {
                self.dispatch_action("nodes", action.action_name(), action.opts())
                    .await
            }
            Command::Tasks { action } => {
                self.dispatch_action("tasks", action.action_name(), action.opts())
                    .await
            }
            Command::Videos { action } => {
                self.dispatch_action("videos", action.action_name(), action.opts())
                    .await
            }
            Command::Audios { action } => {
                reject_removed_project_source(action.opts())?;
                self.dispatch_action("audios", action.action_name(), action.opts())
                    .await
            }
            Command::Images { action } => {
                self.dispatch_action("images", action.action_name(), action.opts())
                    .await
            }
            Command::Streams { action } => {
                self.dispatch_action("streams", action.action_name(), action.opts())
                    .await
            }
            Command::Files { action } => {
                self.dispatch_action("files", action.action_name(), action.opts())
                    .await
            }

            // Timelines: special handling for export (progress bar), generic for others
            Command::Timelines { action } => match action {
                TimelineAction::Export {
                    jvi_file,
                    output,
                    codec,
                    bitrate,
                    preset,
                    hw_encoder,
                    zero_copy,
                } => {
                    self.run_export(
                        jvi_file, output, codec, bitrate, preset, hw_encoder, zero_copy,
                    )
                    .await
                }
                ref a => {
                    let action_name = timeline_action_name_from_opts(a);
                    let opts = timeline_action_opts(a);
                    self.dispatch_action("timelines", action_name, opts).await
                }
            },
        }
    }

    /// Run in server mode
    async fn run_server(
        &mut self,
        port: u16,
        config: Option<PathBuf>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let engine_config = EngineConfig::load(config.as_deref(), None)?;
        // CLI --port flag overrides config file
        let effective_port = if port != 8765 {
            port
        } else {
            engine_config.server.port
        };

        tracing::info!("Starting OpenNeko Server on port {}", effective_port);

        let engine = Arc::new(EngineApi::with_config(engine_config).await.map_err(|e| {
            Box::new(std::io::Error::other(format!(
                "Failed to initialize engine: {}",
                e
            ))) as Box<dyn std::error::Error + Send + Sync>
        })?);
        self.engine = Some(engine.clone());
        neko_host_http::start_server(engine, effective_port).await?;

        Ok(())
    }

    /// Run direct export mode with progress bar (via EngineApi)
    #[allow(clippy::too_many_arguments)]
    async fn run_export(
        &mut self,
        jvi_file: PathBuf,
        output: PathBuf,
        codec: String,
        bitrate: u64,
        preset: String,
        hw_encoder: String,
        zero_copy: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Load .nkv file
        let loader = JviLoader::new();
        let (timeline, mut settings) = loader.load(&jvi_file)?;

        // Override settings from CLI
        settings.video_codec = parse_video_codec(&codec);
        settings.video_bitrate = Some(bitrate);
        settings.preset = parse_preset(&preset);
        settings.hw_encoder = parse_hw_encoder(&hw_encoder);
        settings.use_zero_copy_gpu = zero_copy;

        // Build ExportJobConfig
        let config = ExportJobConfig {
            job_id: uuid::Uuid::new_v4().to_string(),
            output_path: output.to_string_lossy().to_string(),
            settings,
            timeline,
        };

        let total_frames = config.timeline.total_frames_at_fps(config.settings.fps);
        let fps = config.settings.fps;

        // Create progress bar
        let pb = ProgressBar::new(total_frames);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} frames ({percent}%) | {msg}")
                .unwrap()
                .progress_chars("=>-"),
        );

        pb.println(format!(
            "Exporting: {} -> {}",
            jvi_file.display(),
            output.display()
        ));
        pb.println(format!(
            "Settings: {} frames @ {} fps, codec: {}, bitrate: {} kbps",
            total_frames,
            fps,
            codec,
            bitrate / 1000
        ));

        // Start export via EngineApi
        let engine = self.get_engine().await?;

        let config_json = serde_json::to_value(&config).map_err(|e| {
            Box::new(std::io::Error::other(format!(
                "Failed to serialize export config: {}",
                e
            ))) as Box<dyn std::error::Error + Send + Sync>
        })?;

        let request = ActionRequest::new("timelines", "export").with_body(config_json);

        let response = engine.dispatch(request).await;

        if !response.is_ok() {
            let error_msg = response
                .error
                .map(|e| e.message)
                .unwrap_or_else(|| "Unknown error".to_string());
            pb.finish_with_message(format!("Error: {}", error_msg));
            return Err(Box::new(std::io::Error::other(format!(
                "Failed to start export: {}",
                error_msg
            ))));
        }

        // Extract job_id from response
        let data = response.data.ok_or_else(|| {
            Box::new(std::io::Error::other("No data in export start response"))
                as Box<dyn std::error::Error + Send + Sync>
        })?;

        let job_id = data["job_id"]
            .as_str()
            .or_else(|| data["jobId"].as_str())
            .ok_or_else(|| {
                Box::new(std::io::Error::other("No job_id in export start response"))
                    as Box<dyn std::error::Error + Send + Sync>
            })?
            .to_string();

        pb.set_message(format!("Exporting at {} fps", fps));

        // Poll for completion via EngineApi
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let progress_request =
                ActionRequest::new("timelines", "export_progress").with_id(&job_id);

            let progress_response = engine.dispatch(progress_request).await;

            if let Some(data) = progress_response.data {
                let current_frame = data["current_frame"]
                    .as_u64()
                    .or_else(|| data["currentFrame"].as_u64())
                    .unwrap_or(0);
                pb.set_position(current_frame);

                // Update message with speed and detailed performance stats
                let stats = &data["stats"];
                if !stats.is_null() {
                    let avg_fps = stats["avg_fps"]
                        .as_f64()
                        .or_else(|| stats["avgFps"].as_f64())
                        .unwrap_or(0.0);

                    if avg_fps > 0.0 {
                        let eta_secs = ((total_frames - current_frame) as f64 / avg_fps) as u64;
                        let hw_decode_ms = stats["hw_decode_ms"]
                            .as_f64()
                            .or_else(|| stats["hwDecodeMs"].as_f64())
                            .unwrap_or(0.0);
                        let nv12_import_ms = stats["nv12_import_ms"]
                            .as_f64()
                            .or_else(|| stats["nv12ImportMs"].as_f64())
                            .unwrap_or(0.0);
                        let nv12_to_rgba_ms = stats["nv12_to_rgba_ms"]
                            .as_f64()
                            .or_else(|| stats["nv12ToRgbaMs"].as_f64())
                            .unwrap_or(0.0);
                        let composite_ms = stats["composite_ms"]
                            .as_f64()
                            .or_else(|| stats["compositeMs"].as_f64())
                            .unwrap_or(0.0);
                        let rgba_to_nv12_ms = stats["rgba_to_nv12_ms"]
                            .as_f64()
                            .or_else(|| stats["rgbaToNv12Ms"].as_f64())
                            .unwrap_or(0.0);
                        let cpu_readback_ms = stats["cpu_readback_ms"]
                            .as_f64()
                            .or_else(|| stats["cpuReadbackMs"].as_f64())
                            .unwrap_or(0.0);
                        let encode_submit_ms = stats["encode_submit_ms"]
                            .as_f64()
                            .or_else(|| stats["encodeSubmitMs"].as_f64())
                            .unwrap_or(0.0);

                        pb.set_message(format!(
                            "{:.1}fps | dec:{:.1} imp:{:.1} cvt:{:.1} cmp:{:.1} nv12:{:.1} read:{:.1} enc:{:.1} | ETA {}:{:02}",
                            avg_fps,
                            hw_decode_ms,
                            nv12_import_ms,
                            nv12_to_rgba_ms,
                            composite_ms,
                            rgba_to_nv12_ms,
                            cpu_readback_ms,
                            encode_submit_ms,
                            eta_secs / 60,
                            eta_secs % 60
                        ));
                    }
                }

                // Check terminal state
                let state_str = data["state"].as_str().unwrap_or("");
                match state_str {
                    "completed" => {
                        pb.finish_with_message("Export completed!");
                        print_performance_summary(&data);
                        break;
                    }
                    "error" => {
                        let error_msg = data["error"].as_str().unwrap_or("Unknown error");
                        pb.finish_with_message(format!("Error: {}", error_msg));
                        return Err(Box::new(std::io::Error::other(format!(
                            "Export failed: {}",
                            error_msg
                        ))));
                    }
                    "cancelled" => {
                        pb.finish_with_message("Cancelled");
                        return Err(Box::new(std::io::Error::new(
                            std::io::ErrorKind::Interrupted,
                            "Export was cancelled",
                        )));
                    }
                    _ => {}
                }
            }
        }

        Ok(())
    }

    /// Dispatch a generic action to the engine and print the response
    async fn dispatch_action(
        &mut self,
        group: &str,
        action: &str,
        opts: &ActionOpts,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let engine = self.get_engine().await?;

        let mut request = ActionRequest::new(group, action);

        if let Some(ref id) = opts.id {
            request = request.with_id(id);
        }
        if let Some(ref source) = opts.source {
            request = request.with_source(source);
        }
        if let Some(ref session) = opts.session {
            request = request.with_session(session);
        }
        if let Some(ref stream) = opts.stream {
            request = request.with_stream(stream);
        }
        if let Some(ref opts_json) = opts.options {
            let parsed: serde_json::Value = serde_json::from_str(opts_json).map_err(|e| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("Invalid options JSON: {}", e),
                )) as Box<dyn std::error::Error + Send + Sync>
            })?;
            request = request.with_options(parsed);
        }

        // Merge CLI flags into options so controllers can find them
        // Controllers read source/session/stream from options JSON
        {
            let mut options = if request.options.is_object() {
                request.options.clone()
            } else {
                serde_json::json!({})
            };
            if let Some(ref source) = opts.source {
                if options.get("source").is_none() {
                    options["source"] = serde_json::Value::String(source.clone());
                }
            }
            if let Some(ref session) = opts.session {
                if options.get("sessionId").is_none() {
                    options["sessionId"] = serde_json::Value::String(session.clone());
                }
            }
            if let Some(ref stream) = opts.stream {
                if options.get("streamId").is_none() {
                    options["streamId"] = serde_json::Value::String(stream.clone());
                }
            }
            request.options = options;
        }
        if let Some(ref body_json) = opts.body {
            let parsed: serde_json::Value = serde_json::from_str(body_json).map_err(|e| {
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("Invalid body JSON: {}", e),
                )) as Box<dyn std::error::Error + Send + Sync>
            })?;
            request = request.with_body(parsed);
        }

        let response = engine.dispatch(request).await;

        match opts.format.as_str() {
            "json" => println!(
                "{}",
                serde_json::to_string(&response).map_err(|e| {
                    Box::new(std::io::Error::other(format!(
                        "Failed to serialize response: {}",
                        e
                    ))) as Box<dyn std::error::Error + Send + Sync>
                })?
            ),
            _ => println!(
                "{}",
                serde_json::to_string_pretty(&response).map_err(|e| {
                    Box::new(std::io::Error::other(format!(
                        "Failed to serialize response: {}",
                        e
                    ))) as Box<dyn std::error::Error + Send + Sync>
                })?
            ),
        }

        if !response.is_ok() {
            std::process::exit(1);
        }

        Ok(())
    }

}

impl Default for Runner {
    fn default() -> Self {
        Self::new()
    }
}

/// Map TimelineAction variant to engine action name string
fn timeline_action_name_from_opts(action: &TimelineAction) -> &'static str {
    match action {
        TimelineAction::Probe { .. } => "probe",
        TimelineAction::Composite { .. } => "composite",
        TimelineAction::Stream { .. } => "stream",
        TimelineAction::StreamStats { .. } => "stream_stats",
        TimelineAction::Stop { .. } => "stop",
        TimelineAction::Pause { .. } => "pause",
        TimelineAction::Resume { .. } => "resume",
        TimelineAction::Speed { .. } => "speed",
        TimelineAction::Loop { .. } => "loop",
        TimelineAction::Seek { .. } => "seek",
        TimelineAction::Diff { .. } => "diff",
        TimelineAction::Export { .. } => "export",
        TimelineAction::ExportProgress { .. } => "export_progress",
        TimelineAction::ExportCancel { .. } => "export_cancel",
    }
}

/// Extract ActionOpts from a TimelineAction variant (all except Export)
fn timeline_action_opts(action: &TimelineAction) -> &ActionOpts {
    match action {
        TimelineAction::Probe { opts }
        | TimelineAction::Composite { opts }
        | TimelineAction::Stream { opts }
        | TimelineAction::StreamStats { opts }
        | TimelineAction::Stop { opts }
        | TimelineAction::Pause { opts }
        | TimelineAction::Resume { opts }
        | TimelineAction::Speed { opts }
        | TimelineAction::Loop { opts }
        | TimelineAction::Seek { opts }
        | TimelineAction::Diff { opts }
        | TimelineAction::ExportProgress { opts }
        | TimelineAction::ExportCancel { opts } => opts,
        TimelineAction::Export { .. } => unreachable!("Export handled separately"),
    }
}

fn reject_removed_project_source(
    opts: &ActionOpts,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if opts
        .source
        .as_deref()
        .is_some_and(|source| source.to_ascii_lowercase().ends_with(".nka"))
    {
        return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            ".nka projects are not supported by the retained media CLI",
        )));
    }
    Ok(())
}

/// Print detailed performance summary from export progress data
fn print_performance_summary(data: &serde_json::Value) {
    let stats = &data["stats"];
    if stats.is_null() {
        return;
    }

    let current_frame = data["current_frame"]
        .as_u64()
        .or_else(|| data["currentFrame"].as_u64())
        .unwrap_or(0);
    let avg_fps = stats["avg_fps"]
        .as_f64()
        .or_else(|| stats["avgFps"].as_f64())
        .unwrap_or(0.0);
    let hw_decode_ms = stats["hw_decode_ms"]
        .as_f64()
        .or_else(|| stats["hwDecodeMs"].as_f64())
        .unwrap_or(0.0);
    let nv12_import_ms = stats["nv12_import_ms"]
        .as_f64()
        .or_else(|| stats["nv12ImportMs"].as_f64())
        .unwrap_or(0.0);
    let nv12_to_rgba_ms = stats["nv12_to_rgba_ms"]
        .as_f64()
        .or_else(|| stats["nv12ToRgbaMs"].as_f64())
        .unwrap_or(0.0);
    let composite_ms = stats["composite_ms"]
        .as_f64()
        .or_else(|| stats["compositeMs"].as_f64())
        .unwrap_or(0.0);
    let rgba_to_nv12_ms = stats["rgba_to_nv12_ms"]
        .as_f64()
        .or_else(|| stats["rgbaToNv12Ms"].as_f64())
        .unwrap_or(0.0);
    let cpu_readback_ms = stats["cpu_readback_ms"]
        .as_f64()
        .or_else(|| stats["cpuReadbackMs"].as_f64())
        .unwrap_or(0.0);
    let encode_submit_ms = stats["encode_submit_ms"]
        .as_f64()
        .or_else(|| stats["encodeSubmitMs"].as_f64())
        .unwrap_or(0.0);
    let cpu_usage_percent = stats["cpu_usage_percent"]
        .as_f64()
        .or_else(|| stats["cpuUsagePercent"].as_f64())
        .unwrap_or(0.0);
    let gpu_usage_percent = stats["gpu_usage_percent"]
        .as_f64()
        .or_else(|| stats["gpuUsagePercent"].as_f64());
    let peak_memory_bytes = stats["peak_memory_bytes"]
        .as_u64()
        .or_else(|| stats["peakMemoryBytes"].as_u64())
        .unwrap_or(0);
    let vram_usage_bytes = stats["vram_usage_bytes"]
        .as_u64()
        .or_else(|| stats["vramUsageBytes"].as_u64());

    println!();
    println!("=== Export Performance Summary ===");
    println!("Total frames: {}", current_frame);
    println!("Average FPS:  {:.1}", avg_fps);
    println!();
    println!("Per-frame timing (avg):");
    println!();
    println!("  [Decode]");
    println!("    HW Decode:     {:>6.2} ms", hw_decode_ms);
    println!();
    println!("  [GPU Pipeline]");
    println!(
        "    NV12 Import:   {:>6.2} ms  (CPU→GPU transfer)",
        nv12_import_ms
    );
    println!(
        "    NV12→RGBA:     {:>6.2} ms  (GPU shader)",
        nv12_to_rgba_ms
    );
    println!("    Composite:     {:>6.2} ms  (GPU render)", composite_ms);
    println!(
        "    RGBA→NV12:     {:>6.2} ms  (GPU compute)",
        rgba_to_nv12_ms
    );
    println!(
        "    CPU Readback:  {:>6.2} ms  (GPU→CPU transfer)",
        cpu_readback_ms
    );
    let gpu_total =
        nv12_import_ms + nv12_to_rgba_ms + composite_ms + rgba_to_nv12_ms + cpu_readback_ms;
    println!("    ─────────────────────────");
    println!("    GPU Total:     {:>6.2} ms", gpu_total);
    println!();
    println!("  [Encode]");
    println!("    Encode Submit: {:>6.2} ms", encode_submit_ms);
    println!();
    let frame_total = hw_decode_ms + gpu_total + encode_submit_ms;
    println!("  [Total]");
    println!("    Frame Total:   {:>6.2} ms", frame_total);

    // Resource usage section
    println!();
    println!("Resource usage:");
    println!("  CPU Usage:   {:>6.1} %", cpu_usage_percent);
    if let Some(gpu) = gpu_usage_percent {
        println!("  GPU Usage:   {:>6.1} %", gpu);
    }
    println!(
        "  Peak RAM:    {:>6.1} MB",
        peak_memory_bytes as f64 / 1024.0 / 1024.0
    );
    if let Some(vram) = vram_usage_bytes {
        println!("  Peak VRAM:   {:>6.1} MB", vram as f64 / 1024.0 / 1024.0);
    }
}

#[cfg(test)]
mod tests {
    use super::reject_removed_project_source;
    use crate::args::ActionOpts;

    fn opts(source: &str) -> ActionOpts {
        ActionOpts {
            id: None,
            source: Some(source.to_string()),
            session: None,
            stream: None,
            options: None,
            body: None,
            format: "pretty".to_string(),
        }
    }

    #[test]
    fn rejects_removed_nka_projects_before_engine_dispatch() {
        let error = reject_removed_project_source(&opts("/workspace/legacy.NKA")).unwrap_err();
        assert_eq!(
            error.to_string(),
            ".nka projects are not supported by the retained media CLI"
        );
    }

    #[test]
    fn permits_retained_audio_sources() {
        assert!(reject_removed_project_source(&opts("/workspace/dialogue.wav")).is_ok());
    }
}

fn parse_video_codec(codec: &str) -> ExportVideoCodec {
    match codec.to_lowercase().as_str() {
        "h264" => ExportVideoCodec::H264,
        "h265" | "hevc" => ExportVideoCodec::H265,
        "vp9" => ExportVideoCodec::Vp9,
        "prores" => ExportVideoCodec::ProRes,
        _ => ExportVideoCodec::H264,
    }
}

fn parse_preset(preset: &str) -> ExportPreset {
    match preset.to_lowercase().as_str() {
        "ultrafast" => ExportPreset::Ultrafast,
        "fast" => ExportPreset::Fast,
        "medium" => ExportPreset::Medium,
        "slow" => ExportPreset::Slow,
        "veryslow" => ExportPreset::Veryslow,
        _ => ExportPreset::Medium,
    }
}

fn parse_hw_encoder(hw_encoder: &str) -> ExportHwEncoder {
    match hw_encoder.to_lowercase().as_str() {
        "auto" => ExportHwEncoder::Auto,
        "videotoolbox" => ExportHwEncoder::VideoToolbox,
        "nvenc" => ExportHwEncoder::Nvenc,
        "vaapi" => ExportHwEncoder::Vaapi,
        "qsv" => ExportHwEncoder::Qsv,
        "none" => ExportHwEncoder::None,
        _ => ExportHwEncoder::Auto,
    }
}
