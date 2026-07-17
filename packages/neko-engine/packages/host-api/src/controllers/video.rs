//! VideoController - handles videos:* actions

use crate::controllers::utils::{
    base64_encode, handle_stream_control, resolve_file_source_ref, resolve_resource,
};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_engine_kernel::contracts::domain::{
    CaptureOptions, ExtractOptions, ExtractType, StreamConfig,
};
use neko_engine_kernel::contracts::media::{
    diff_media, diff_video_content, DiffCategory, VideoDiffOptions,
};
use neko_engine_kernel::contracts::services::IVideoService;
use neko_engine_types::registry;
use neko_engine_types::{ActionResponse, FileSourceRef, FrameFormat};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Controller for video-related actions
pub struct VideoController {
    video_service: Arc<dyn IVideoService>,
    resource_registry: Arc<ResourceRegistry>,
    stream_registry: Arc<StreamRegistry>,
    file_access_registry: Option<Arc<FileAccessRegistry>>,
}

impl VideoController {
    /// Create a new VideoController
    pub fn new(
        video_service: Arc<dyn IVideoService>,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            video_service,
            resource_registry,
            stream_registry,
            file_access_registry: None,
        }
    }

    pub fn with_file_access_registry(mut self, registry: Arc<FileAccessRegistry>) -> Self {
        self.file_access_registry = Some(registry);
        self
    }

    async fn resolve_media_resource(
        &self,
        resource_id: Option<&str>,
        source: Option<&str>,
        source_ref: Option<&FileSourceRef>,
        label: &str,
    ) -> ApiResult<(neko_engine_types::ResourceId, std::path::PathBuf)> {
        if let (Some(files), Some(source_ref)) = (&self.file_access_registry, source_ref) {
            let file_path = resolve_file_source_ref(files, Some(source_ref), source, label)?;
            let resource_id = self.resource_registry.register(&file_path).await;
            return Ok((resource_id, file_path));
        }
        resolve_resource(&self.resource_registry, resource_id, source).await
    }
}

/// Options for videos:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeOptions {
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
}

/// Options for videos:capture
#[derive(Debug, Deserialize, Default)]
struct CaptureRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Time in seconds to capture
    #[serde(default)]
    time: f64,
    /// JPEG quality (1-100)
    #[serde(default = "default_quality")]
    quality: u32,
    /// Output format (jpeg, png, rgba)
    #[serde(default = "default_format")]
    format: String,
    /// Output width (optional)
    width: Option<u32>,
    /// Output height (optional)
    height: Option<u32>,
}

fn default_quality() -> u32 {
    85
}

fn default_format() -> String {
    "jpeg".to_string()
}

/// Options for videos:keyframes
#[derive(Debug, Deserialize, Default)]
struct KeyframesRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
}

/// Options for videos:waveform
#[derive(Debug, Deserialize, Default)]
struct WaveformRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
}

/// Options for videos:extract
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ExtractRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Extract type: "subtitles", "frame", "frame_range"
    #[serde(default = "default_extract_type")]
    extract_type: String,
    /// Time for single frame extraction
    #[serde(default)]
    time: f64,
    /// Start time for frame range
    #[serde(default)]
    start: f64,
    /// End time for frame range
    #[serde(default)]
    end: f64,
    /// FPS for frame range
    #[serde(default = "default_extract_fps")]
    fps: f64,
}

fn default_extract_type() -> String {
    "subtitles".to_string()
}

fn default_extract_fps() -> f64 {
    1.0
}

/// Options for videos:stream
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StreamRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Session ID for the stream
    session_id: Option<String>,
}

/// Options for videos:transcode
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TranscodeRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Output file path
    output: Option<String>,
    /// Video codec
    codec: Option<neko_engine_types::VideoCodec>,
    /// Target width
    width: Option<u32>,
    /// Target height
    height: Option<u32>,
    /// Target bitrate
    bitrate: Option<u64>,
    /// Hardware encoder type
    hw_encoder: Option<neko_engine_types::HwEncoderType>,
    /// Encoder preset
    preset: Option<neko_engine_types::EncoderPreset>,
}

impl TranscodeRequestOptions {
    fn resolution(&self) -> Option<neko_engine_types::Resolution> {
        match (self.width, self.height) {
            (Some(w), Some(h)) => Some(neko_engine_types::Resolution::new(w, h)),
            _ => None,
        }
    }
}

/// Options for videos:proxy
#[derive(Debug, Deserialize, Default)]
struct ProxyRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Output file path
    output: Option<String>,
}

/// Options for videos:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
    /// SSIM threshold for diff frames (default 0.95)
    ssim_threshold: Option<f64>,
    /// Whether to generate a visual difference video
    #[serde(default)]
    generate_diff_video: bool,
    /// Output path for the difference video
    diff_video_output: Option<String>,
    /// Whether to include audio comparison (default true)
    include_audio: Option<bool>,
    /// Start time in seconds for range-based diff
    #[serde(default)]
    start_time: Option<f64>,
    /// End time in seconds for range-based diff
    #[serde(default)]
    end_time: Option<f64>,
    /// Sample frame rate for diff computation (None = full frame rate)
    #[serde(default)]
    sample_fps: Option<f64>,
}

impl Controller for VideoController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let opts: ProbeOptions = serde_json::from_value(options).unwrap_or_default();

                let (id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:probe",
                    )
                    .await?;

                let path = file_path.as_path();
                let media_info = self.video_service.probe(path).await?;

                // Include resource_id in response
                let mut response = serde_json::to_value(media_info)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            "capture" => {
                let opts: CaptureRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                // Resolve resource (by ID or source path)
                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:capture",
                    )
                    .await?;

                // Parse format
                let format = match opts.format.to_lowercase().as_str() {
                    "jpeg" | "jpg" => FrameFormat::Jpeg,
                    "png" => FrameFormat::Png,
                    "rgba" => FrameFormat::Rgba,
                    _ => FrameFormat::Jpeg,
                };

                // Build capture options
                let capture_opts = CaptureOptions {
                    quality: opts.quality,
                    format,
                    width: opts.width,
                    height: opts.height,
                };

                // Capture frame
                let frame_data = self
                    .video_service
                    .capture(&file_path, opts.time, capture_opts)
                    .await?;

                // Build response
                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "width": frame_data.width,
                    "height": frame_data.height,
                    "format": format!("{:?}", frame_data.format).to_lowercase(),
                    "timestamp": frame_data.timestamp,
                    "size": frame_data.data.len(),
                    // Base64 encode the data for JSON transport
                    "data": base64_encode(&frame_data.data),
                });

                Ok(ActionResponse::ok("", response))
            }
            "extract" => {
                let opts: ExtractRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:extract",
                    )
                    .await?;

                let extract_type = match opts.extract_type.to_lowercase().as_str() {
                    "subtitles" | "subtitle" => ExtractType::Subtitles,
                    "frame" => ExtractType::Frame { time: opts.time },
                    "frame_range" | "framerange" => ExtractType::FrameRange {
                        start: opts.start,
                        end: opts.end,
                        fps: opts.fps,
                    },
                    _ => ExtractType::Subtitles,
                };

                let extract_options = ExtractOptions {
                    extract_type,
                    time_range: None,
                };

                let frames = self
                    .video_service
                    .extract(&file_path, extract_options, None)
                    .await?;

                // Build response based on extract type
                let response = if opts.extract_type.to_lowercase().contains("subtitle") {
                    // Subtitle data is JSON in the first frame's data field
                    if let Some(frame) = frames.first() {
                        let subtitles: Value =
                            serde_json::from_slice(&frame.data).unwrap_or(Value::Array(vec![]));
                        serde_json::json!({
                            "resourceId": res_id.as_str(),
                            "type": "subtitles",
                            "tracks": subtitles,
                        })
                    } else {
                        serde_json::json!({
                            "resourceId": res_id.as_str(),
                            "type": "subtitles",
                            "tracks": [],
                        })
                    }
                } else {
                    // Frame data
                    let frame_results: Vec<Value> = frames
                        .iter()
                        .map(|f| {
                            serde_json::json!({
                                "width": f.width,
                                "height": f.height,
                                "format": format!("{:?}", f.format).to_lowercase(),
                                "timestamp": f.timestamp,
                                "size": f.data.len(),
                                "data": base64_encode(&f.data),
                            })
                        })
                        .collect();

                    serde_json::json!({
                        "resourceId": res_id.as_str(),
                        "type": "frames",
                        "frames": frame_results,
                    })
                };

                Ok(ActionResponse::ok("", response))
            }
            "stream" => {
                let opts: StreamRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:stream",
                    )
                    .await?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let (stream_id, rx) = self
                    .video_service
                    .start_stream(&file_path, &session_id)
                    .await?;

                // Register the stream into StreamRegistry so WebSocket subscribers can find it
                let cancel_token = CancellationToken::new();
                self.stream_registry
                    .register_external_stream(
                        stream_id.clone(),
                        &session_id,
                        res_id.as_str(),
                        StreamConfig::default(),
                        rx,
                        cancel_token,
                    )
                    .await;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "resourceId": res_id.as_str(),
                    "status": "active",
                    "projection": "flat",
                });

                Ok(ActionResponse::ok("", response))
            }
            "transcode" => {
                let opts: TranscodeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:transcode",
                    )
                    .await?;

                let resolution = opts.resolution();
                let codec = opts.codec.unwrap_or_default();
                let hw_encoder = opts.hw_encoder.unwrap_or_default();
                let preset = opts.preset.unwrap_or_default();
                let bitrate = opts.bitrate;

                let output = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "output path required for videos:transcode".to_string(),
                    )
                })?;

                let transcode_opts = neko_engine_kernel::contracts::domain::TranscodeOptions {
                    video_codec: codec,
                    resolution,
                    bitrate,
                    hw_encoder,
                    preset,
                    audio_codec: Some(neko_engine_types::AudioCodec::Opus),
                    audio_bitrate: None,
                };

                self.video_service
                    .transcode(&file_path, Path::new(&output), transcode_opts, None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "keyframes" => {
                let opts: KeyframesRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:keyframes",
                    )
                    .await?;

                let keyframes = self.video_service.get_keyframes(&file_path).await?;

                // Convert internal KeyframeInfo to neko_engine_types for serialization
                let typed_keyframes: Vec<neko_engine_types::KeyframeInfo> = keyframes
                    .into_iter()
                    .map(|kf| neko_engine_types::KeyframeInfo {
                        frame_index: kf.frame_index,
                        timestamp: kf.timestamp,
                        pts: kf.pts,
                        nal_type: Some(kf.nal_type),
                        width: kf.width,
                        height: kf.height,
                        size: None,
                    })
                    .collect();

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "count": typed_keyframes.len(),
                    "keyframes": serde_json::to_value(&typed_keyframes)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "waveform" => {
                let opts: WaveformRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:waveform",
                    )
                    .await?;

                let waveform = self
                    .video_service
                    .generate_waveform(&file_path, None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "waveform": serde_json::to_value(&waveform)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "proxy" => {
                let opts: ProxyRequestOptions = serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "videos:proxy",
                    )
                    .await?;

                let output = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest("output path required for videos:proxy".to_string())
                })?;

                self.video_service
                    .generate_proxy(&file_path, Path::new(&output), None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "stop" | "pause" | "resume" | "speed" | "seek" | "loop" => {
                handle_stream_control(self.video_service.as_ref(), action, options, "videos").await
            }
            "diff" => {
                let opts: DiffRequestOptions = serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for videos:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for videos:diff".to_string())
                })?;

                // Content-level diff with custom options
                let video_opts = VideoDiffOptions {
                    ssim_threshold: opts.ssim_threshold.unwrap_or(0.95),
                    generate_diff_video: opts.generate_diff_video,
                    diff_video_output: opts.diff_video_output,
                    include_audio: opts.include_audio.unwrap_or(true),
                    start_time: opts.start_time,
                    end_time: opts.end_time,
                    sample_fps: opts.sample_fps,
                };

                // Run blocking FFmpeg diff operations on a dedicated thread pool
                // to avoid starving the tokio async executor
                let result = tokio::task::spawn_blocking(move || {
                    let mut result = diff_media(&source_a, &source_b, DiffCategory::Video)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))?;

                    match diff_video_content(&source_a, &source_b, &video_opts) {
                        Ok(video_diff) => {
                            result.content =
                                Some(neko_engine_kernel::contracts::media::ContentDiff::Video(
                                    video_diff,
                                ));
                        }
                        Err(e) => {
                            tracing::warn!("Video content diff failed: {}", e);
                        }
                    }

                    Ok::<_, ApiError>(result)
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "videos".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::VIDEOS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::VIDEOS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> VideoController {
        let services = ServiceFactory::new().create_with_gpu(None);
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());
        VideoController::new(services.video_service, resource_registry, stream_registry)
    }

    #[tokio::test]
    async fn test_video_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller.handle("probe", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_keyframes_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("keyframes", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_waveform_missing_source() {
        let controller = create_test_controller();

        let result = controller.handle("waveform", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_controller_extract_missing_source() {
        let controller = create_test_controller();

        let result = controller.handle("extract", None, Value::Null, None).await;

        assert!(result.is_err());
    }
}
