//! AudioController - handles audios:* actions

use crate::controllers::utils::{handle_stream_control, resolve_file_source_ref, resolve_resource};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_engine_kernel::contracts::domain::{
    AudioOutputFormat, AudioRenderEffectConfig, StreamConfig,
};
use neko_engine_kernel::contracts::media::{
    diff_audio_content_with_options, diff_media, AudioDiffOptions, DiffCategory,
};
use neko_engine_kernel::contracts::services::IAudioService;
use neko_engine_types::registry;
use neko_engine_types::{ActionResponse, FileSourceRef, ResourceId, SUPPORTED_AUDIO_EFFECT_TYPES};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Controller for audio-related actions
pub struct AudioController {
    audio_service: Arc<dyn IAudioService>,
    resource_registry: Arc<ResourceRegistry>,
    stream_registry: Arc<StreamRegistry>,
    file_access_registry: Option<Arc<FileAccessRegistry>>,
}

impl AudioController {
    /// Create a new AudioController
    pub fn new(
        audio_service: Arc<dyn IAudioService>,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            audio_service,
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
    ) -> ApiResult<(ResourceId, std::path::PathBuf)> {
        if let (Some(files), Some(source_ref)) = (&self.file_access_registry, source_ref) {
            let file_path = resolve_file_source_ref(files, Some(source_ref), source, label)?;
            let resource_id = self.resource_registry.register(&file_path).await;
            return Ok((resource_id, file_path));
        }
        resolve_resource(&self.resource_registry, resource_id, source).await
    }
}

/// Options for audios:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeOptions {
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
}

/// Options for audios:waveform
#[derive(Debug, Deserialize, Default)]
struct WaveformRequestOptions {
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
}

/// Options for audios:transcode
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TranscodeRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Output file path
    output: Option<String>,
    /// Force codec (overrides output extension inference)
    codec: Option<String>,
    /// Output format alias. Kept compatible with callers that use format
    /// instead of codec.
    format: Option<String>,
    /// Target bitrate in bps
    bitrate: Option<u64>,
    /// Target sample rate
    sample_rate: Option<u32>,
    /// Target channels
    channels: Option<u16>,
    /// Trim start time in seconds
    start_time: Option<f64>,
    /// Trim end time in seconds
    end_time: Option<f64>,
    /// Optional canonical effect chain.
    effects: Option<Value>,
}

/// Options for audios:segment
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SegmentRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Segment start time in seconds
    start: Option<f64>,
    /// Segment duration in seconds
    duration: Option<f64>,
    /// Output format / codec (wav, mp3, flac, aac, opus)
    format: Option<String>,
    /// Target sample rate
    sample_rate: Option<u32>,
    /// Target channels
    channels: Option<u16>,
}

/// Options for audios:stream
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

/// Options for audios:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AudioDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
    /// Start time in seconds for range-based diff
    #[serde(default)]
    start_time: Option<f64>,
    /// End time in seconds for range-based diff
    #[serde(default)]
    end_time: Option<f64>,
}

/// Options for audios:analyze_loudness
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AnalyzeLoudnessOptions {
    /// Source file path (audio or video)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Target LUFS for recommended gain calculation (default: -14.0)
    target_lufs: Option<f64>,
}

/// Options for audios:detect_silence
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DetectSilenceOptions {
    /// Source file path (audio or video)
    source: Option<String>,
    #[serde(default)]
    source_ref: Option<FileSourceRef>,
    /// Silence threshold in dBFS (default: -40.0)
    threshold_dbfs: Option<f64>,
    /// Minimum silence duration in seconds (default: 0.5)
    min_duration: Option<f64>,
}

/// Options for audios:mixdown
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MixdownRequestOptions {
    /// Full mixdown config.
    config: Option<Value>,
    /// Timeline time to mix at (default: 0.0)
    time: Option<f64>,
}

/// Options for audios:mix_stream
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MixStreamOptions {
    /// Full mixdown config (tracks, master effects, master volume, sample rate, channels)
    config: Option<Value>,
    /// Session ID for the stream
    session_id: Option<String>,
    /// Sub-action: "start" (default) | "update"
    action: Option<String>,
    /// Stream ID (required for "update" sub-action)
    stream_id: Option<String>,
}

/// Options for audios:mix_export
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MixExportOptions {
    /// Full mixdown config
    config: Option<Value>,
    /// Output file path
    output: Option<String>,
    /// Output format: wav, mp3, flac, aac, opus (default: wav)
    format: Option<String>,
    /// Target bitrate in bps (for lossy codecs)
    bitrate: Option<u64>,
}

fn parse_audio_output_format(format: Option<&str>) -> Option<AudioOutputFormat> {
    format.map(|value| match value.to_lowercase().as_str() {
        "aac" | "m4a" => AudioOutputFormat::Aac,
        "mp3" => AudioOutputFormat::Mp3,
        "opus" | "ogg" => AudioOutputFormat::Opus,
        "flac" => AudioOutputFormat::Flac,
        "pcm" | "wav" => AudioOutputFormat::Pcm,
        _ => AudioOutputFormat::Aac,
    })
}

fn normalize_audio_effect_type(effect_type: &str) -> Option<&'static str> {
    SUPPORTED_AUDIO_EFFECT_TYPES
        .iter()
        .copied()
        .find(|supported| *supported == effect_type)
}

fn normalize_audio_effects(effects: Option<Value>) -> ApiResult<Vec<AudioRenderEffectConfig>> {
    let items = match effects {
        None => return Ok(Vec::new()),
        Some(Value::Array(items)) => items,
        Some(_) => {
            return Err(ApiError::InvalidRequest(
                "effects must be an array".to_string(),
            ));
        }
    };

    let mut normalized = Vec::with_capacity(items.len());
    for (index, item) in items.into_iter().enumerate() {
        let Value::Object(mut map) = item else {
            return Err(ApiError::InvalidRequest(format!(
                "effects[{}] must be an object",
                index
            )));
        };

        let raw_type = map
            .remove("effectType")
            .and_then(|value| value.as_str().map(str::to_string))
            .ok_or_else(|| {
                ApiError::InvalidRequest(format!("effects[{}].effectType is required", index))
            })?;

        let effect_type = normalize_audio_effect_type(&raw_type).ok_or_else(|| {
            ApiError::InvalidRequest(format!(
                "unsupported audio effect type for transcode: {}",
                raw_type
            ))
        })?;

        let id = map
            .remove("id")
            .and_then(|value| value.as_str().map(str::to_string))
            .ok_or_else(|| {
                ApiError::InvalidRequest(format!("effects[{}].id is required", index))
            })?;
        let enabled = map
            .remove("enabled")
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        let params = map
            .remove("params")
            .unwrap_or_else(|| Value::Object(Map::new()));

        normalized.push(AudioRenderEffectConfig {
            id,
            effect_type: effect_type.to_string(),
            enabled,
            params,
        });
    }

    Ok(normalized)
}

fn build_time_range(
    start_time: Option<f64>,
    end_time: Option<f64>,
) -> ApiResult<Option<(f64, f64)>> {
    match (start_time, end_time) {
        (None, None) => Ok(None),
        (Some(start), Some(end))
            if start.is_finite() && end.is_finite() && start >= 0.0 && end > start =>
        {
            Ok(Some((start, end)))
        }
        (Some(start), None) if start.is_finite() && start >= 0.0 => {
            Ok(Some((start, f64::INFINITY)))
        }
        _ => Err(ApiError::InvalidRequest(
            "startTime/endTime require startTime >= 0 and endTime > startTime".to_string(),
        )),
    }
}

fn mix_export_response(output: &str, warnings: Vec<String>) -> Value {
    serde_json::json!({
        "output": output,
        "status": "complete",
        "warnings": warnings,
    })
}

impl Controller for AudioController {
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
                        "audios:probe",
                    )
                    .await?;

                let path = file_path.as_path();
                let media_info = self.audio_service.probe(path).await?;

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
            "transcode" => {
                let opts: TranscodeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "audios:transcode",
                    )
                    .await?;

                let output_path = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "output path required for audios:transcode".to_string(),
                    )
                })?;

                // Build AudioTranscodeOptions from request
                use neko_engine_kernel::contracts::domain::AudioTranscodeOptions;

                let requested_format = opts.codec.as_deref().or(opts.format.as_deref());
                let format = parse_audio_output_format(requested_format);
                let effects = normalize_audio_effects(opts.effects)?;
                let time_range = build_time_range(opts.start_time, opts.end_time)?;

                let transcode_opts = AudioTranscodeOptions {
                    time_range,
                    format,
                    bitrate: opts.bitrate,
                    sample_rate: opts.sample_rate,
                    channels: opts.channels,
                    effects,
                };

                self.audio_service
                    .transcode(&file_path, Path::new(&output_path), transcode_opts)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output_path,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "segment" => {
                let opts: SegmentRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "audios:segment",
                    )
                    .await?;

                let start = opts.start.unwrap_or(0.0);
                let duration = opts.duration.ok_or_else(|| {
                    ApiError::InvalidRequest("duration required for audios:segment".to_string())
                })?;
                if !start.is_finite() || start < 0.0 || !duration.is_finite() || duration <= 0.0 {
                    return Err(ApiError::InvalidRequest(
                        "start must be >= 0 and duration must be > 0 for audios:segment"
                            .to_string(),
                    ));
                }

                use base64::Engine;
                use neko_engine_kernel::contracts::domain::{
                    AudioOutputFormat, AudioTranscodeOptions,
                };
                let requested_format = opts.format.unwrap_or_else(|| "wav".to_string());
                let format = match requested_format.to_lowercase().as_str() {
                    "aac" | "m4a" => AudioOutputFormat::Aac,
                    "mp3" => AudioOutputFormat::Mp3,
                    "opus" | "ogg" => AudioOutputFormat::Opus,
                    "flac" => AudioOutputFormat::Flac,
                    "pcm" | "wav" => AudioOutputFormat::Pcm,
                    _ => AudioOutputFormat::Pcm,
                };
                let extension = match format {
                    AudioOutputFormat::Aac => "aac",
                    AudioOutputFormat::Mp3 => "mp3",
                    AudioOutputFormat::Opus => "opus",
                    AudioOutputFormat::Flac => "flac",
                    AudioOutputFormat::Pcm => "wav",
                };
                let temp_dir = tempfile::tempdir()
                    .map_err(|e| ApiError::Internal(format!("failed to create temp dir: {}", e)))?;
                let output_path = temp_dir.path().join(format!("segment.{}", extension));

                let transcode_opts = AudioTranscodeOptions {
                    time_range: Some((start, start + duration)),
                    sample_rate: opts.sample_rate,
                    channels: opts.channels,
                    format: Some(format),
                    ..Default::default()
                };

                self.audio_service
                    .transcode(&file_path, &output_path, transcode_opts)
                    .await?;
                let bytes = tokio::fs::read(&output_path).await.map_err(|e| {
                    ApiError::Internal(format!("failed to read audio segment: {}", e))
                })?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "format": extension,
                    "start": start,
                    "duration": duration,
                    "size": bytes.len(),
                    "data": base64::engine::general_purpose::STANDARD.encode(&bytes),
                });

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
                        "audios:stream",
                    )
                    .await?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let (stream_id, rx) = self
                    .audio_service
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
                        "audios:waveform",
                    )
                    .await?;

                let waveform = self.audio_service.generate_waveform(&file_path).await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "waveform": serde_json::to_value(&waveform)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "stop" | "pause" | "resume" | "speed" | "seek" | "loop" => {
                handle_stream_control(self.audio_service.as_ref(), action, options, "audios").await
            }
            "diff" => {
                let opts: AudioDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for audios:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for audios:diff".to_string())
                })?;

                let audio_opts = AudioDiffOptions {
                    start_time: opts.start_time,
                    end_time: opts.end_time,
                };

                // Run blocking diff on a dedicated thread pool
                // to avoid starving the tokio async executor
                let result = tokio::task::spawn_blocking(move || {
                    let mut result = diff_media(&source_a, &source_b, DiffCategory::Audio)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))?;

                    match diff_audio_content_with_options(&source_a, &source_b, &audio_opts) {
                        Ok(audio_diff) => {
                            result.content =
                                Some(neko_engine_kernel::contracts::media::ContentDiff::Audio(
                                    audio_diff,
                                ));
                        }
                        Err(e) => {
                            tracing::warn!("Audio content diff failed: {}", e);
                        }
                    }

                    Ok::<_, ApiError>(result)
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            "analyze_loudness" => {
                let opts: AnalyzeLoudnessOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "audios:analyze_loudness",
                    )
                    .await?;

                let target_lufs = opts.target_lufs.unwrap_or(-14.0);

                let analysis = self
                    .audio_service
                    .analyze_loudness(&file_path, target_lufs)
                    .await?;

                let mut response = serde_json::to_value(&analysis)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(res_id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            "detect_silence" => {
                let opts: DetectSilenceOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = self
                    .resolve_media_resource(
                        resource_id,
                        opts.source.as_deref(),
                        opts.source_ref.as_ref(),
                        "audios:detect_silence",
                    )
                    .await?;

                let threshold_dbfs = opts.threshold_dbfs.unwrap_or(-40.0);
                let min_duration = opts.min_duration.unwrap_or(0.5);

                let analysis = self
                    .audio_service
                    .detect_silence(&file_path, threshold_dbfs, min_duration)
                    .await?;

                let mut response = serde_json::to_value(&analysis)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(res_id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            "mixdown" => {
                let opts: MixdownRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let time = opts.time.unwrap_or(0.0);

                use base64::Engine;
                use neko_engine_kernel::contracts::audio::{AudioMixdown, MixdownConfig};

                let config_value = opts.config.ok_or_else(|| {
                    ApiError::InvalidRequest("config required for audios:mixdown".to_string())
                })?;
                let config: MixdownConfig = serde_json::from_value(config_value)
                    .map_err(|e| ApiError::InvalidRequest(format!("invalid config: {}", e)))?;
                let mut warnings = Vec::new();

                let sample_rate = config.sample_rate;
                let channels = config.channels;
                let mut mixer = AudioMixdown::new(config);
                warnings.extend(mixer.take_warnings());
                mixer.initialize()?;

                let buf = mixer.mix_buffer(time)?;
                let s16_bytes = AudioMixdown::to_s16_bytes(&buf);
                mixer.close();

                let response = serde_json::json!({
                    "sampleRate": sample_rate,
                    "channels": channels,
                    "samples": buf.samples,
                    "timestamp": buf.timestamp,
                    "warnings": warnings,
                    "dataBase64": base64::engine::general_purpose::STANDARD.encode(&s16_bytes),
                });

                Ok(ActionResponse::ok("", response))
            }
            "mix_stream" => {
                let opts: MixStreamOptions = serde_json::from_value(options).unwrap_or_default();

                let sub_action = opts.action.as_deref().unwrap_or("start");

                match sub_action {
                    "update" => {
                        let stream_id_str = opts.stream_id.ok_or_else(|| {
                            ApiError::InvalidRequest(
                                "streamId required for mix_stream update".to_string(),
                            )
                        })?;
                        let config_value = opts.config.ok_or_else(|| {
                            ApiError::InvalidRequest(
                                "config required for mix_stream update".to_string(),
                            )
                        })?;

                        let config: neko_engine_kernel::contracts::audio::MixdownConfig =
                            serde_json::from_value(config_value).map_err(|e| {
                                ApiError::InvalidRequest(format!("invalid config: {}", e))
                            })?;

                        let stream_id = neko_engine_types::StreamId::from_string(stream_id_str);
                        let warnings = self
                            .audio_service
                            .update_mixdown(&stream_id, config)
                            .await?;

                        let response = serde_json::json!({
                            "streamId": stream_id.as_str(),
                            "status": "updated",
                            "warnings": warnings,
                        });

                        Ok(ActionResponse::ok("", response))
                    }
                    _ => {
                        // "start" (default)
                        let config_value = opts.config.ok_or_else(|| {
                            ApiError::InvalidRequest(
                                "config required for audios:mix_stream".to_string(),
                            )
                        })?;

                        let config: neko_engine_kernel::contracts::audio::MixdownConfig =
                            serde_json::from_value(config_value).map_err(|e| {
                                ApiError::InvalidRequest(format!("invalid config: {}", e))
                            })?;

                        let session_id =
                            opts.session_id.unwrap_or_else(|| "mix-default".to_string());

                        let (stream_id, rx) = self
                            .audio_service
                            .start_mix_stream(config, &session_id)
                            .await?;

                        let cancel_token = CancellationToken::new();
                        self.stream_registry
                            .register_external_stream(
                                stream_id.clone(),
                                &session_id,
                                "mix",
                                StreamConfig::default(),
                                rx,
                                cancel_token,
                            )
                            .await;

                        let response = serde_json::json!({
                            "streamId": stream_id.as_str(),
                            "status": "active",
                        });

                        Ok(ActionResponse::ok("", response))
                    }
                }
            }
            "mix_export" => {
                let opts: MixExportOptions = serde_json::from_value(options).unwrap_or_default();

                let config_value = opts.config.ok_or_else(|| {
                    ApiError::InvalidRequest("config required for audios:mix_export".to_string())
                })?;
                let output_path = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "output path required for audios:mix_export".to_string(),
                    )
                })?;

                let config: neko_engine_kernel::contracts::audio::MixdownConfig =
                    serde_json::from_value(config_value)
                        .map_err(|e| ApiError::InvalidRequest(format!("invalid config: {}", e)))?;

                let format_str = opts.format.unwrap_or_else(|| "wav".to_string());
                let bitrate = opts.bitrate;
                let output = output_path.clone();

                let (_total_duration, warnings) = tokio::task::spawn_blocking(move || {
                    use neko_engine_kernel::contracts::audio::AudioMixdown;
                    use neko_engine_kernel::contracts::audio::{
                        AudioCodec as InternalAudioCodec, AudioEncoder, AudioEncoderConfig,
                        FfmpegAudioEncoder,
                    };
                    use std::fs::File;
                    use std::io::Write;

                    let sample_rate = config.sample_rate;
                    let channels = config.channels;

                    let mut mixdown = AudioMixdown::new(config);
                    let warnings = mixdown.take_warnings();
                    for warning in &warnings {
                        tracing::warn!("Mix export warning: {}", warning);
                    }
                    mixdown.initialize()?;

                    let total_duration = mixdown.total_duration();
                    let buf_duration = mixdown.buffer_size() as f64 / sample_rate as f64;

                    let codec = match format_str.to_lowercase().as_str() {
                        "mp3" => InternalAudioCodec::Mp3,
                        "flac" => InternalAudioCodec::Flac,
                        "aac" | "m4a" => InternalAudioCodec::Aac,
                        "opus" | "ogg" => InternalAudioCodec::Opus,
                        _ => InternalAudioCodec::Pcm,
                    };

                    let mut enc_config = AudioEncoderConfig::new(sample_rate, channels, codec);
                    if let Some(br) = bitrate {
                        enc_config = enc_config.with_bitrate(br);
                    }

                    let mut encoder = FfmpegAudioEncoder::new();
                    encoder.open(&enc_config)?;

                    let mut output_file = File::create(&output).map_err(|e| {
                        neko_engine_kernel::error::Error::Other(format!(
                            "Failed to create output file: {}",
                            e
                        ))
                    })?;

                    let mut current_time = 0.0;
                    while current_time < total_duration {
                        let buf = mixdown.mix_buffer(current_time)?;
                        let pcm_bytes: &[u8] = bytemuck::cast_slice(&buf.data);

                        let packets = encoder.encode_frame(pcm_bytes, buf.samples)?;
                        for packet in packets {
                            output_file.write_all(&packet.data).map_err(|e| {
                                neko_engine_kernel::error::Error::Other(format!(
                                    "Failed to write output: {}",
                                    e
                                ))
                            })?;
                        }

                        current_time += buf_duration;
                    }

                    let remaining = encoder.flush()?;
                    for packet in remaining {
                        output_file.write_all(&packet.data).map_err(|e| {
                            neko_engine_kernel::error::Error::Other(format!(
                                "Failed to write output: {}",
                                e
                            ))
                        })?;
                    }

                    output_file.flush().map_err(|e| {
                        neko_engine_kernel::error::Error::Other(format!(
                            "Failed to flush output: {}",
                            e
                        ))
                    })?;

                    mixdown.close();
                    Ok::<_, neko_engine_kernel::error::Error>((total_duration, warnings))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Mix export task failed: {}", e)))??;

                let response = mix_export_response(&output_path, warnings);

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "audios".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::AUDIOS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::AUDIOS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> AudioController {
        let services = ServiceFactory::new().create_with_gpu(None);
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());
        AudioController::new(services.audio_service, resource_registry, stream_registry)
    }

    #[tokio::test]
    async fn test_audio_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller.handle("probe", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_waveform_missing_source() {
        let controller = create_test_controller();

        let result = controller.handle("waveform", None, Value::Null, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_transcode_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("transcode", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_transcode_missing_output() {
        let controller = create_test_controller();

        let opts = serde_json::json!({ "source": "/some/file.mp3" });
        let result = controller.handle("transcode", None, opts, None).await;

        // Should fail because output path is missing
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_canonical_transcode_effect() {
        let effects = normalize_audio_effects(Some(serde_json::json!([
            {
                "id": "eq-1",
                "effectType": "parametric-eq",
                "params": { "bands": [] }
            }
        ])))
        .unwrap();

        assert_eq!(effects.len(), 1);
        assert_eq!(effects[0].id, "eq-1");
        assert_eq!(effects[0].effect_type, "parametric-eq");
        assert!(effects[0].enabled);
    }

    #[test]
    fn test_normalize_transcode_effect_requires_canonical_shape() {
        let result = normalize_audio_effects(Some(serde_json::json!([
            { "type": "spectral-cleanup", "params": {} }
        ])));

        assert!(result.is_err());
    }

    #[test]
    fn test_build_time_range_validates_trim() {
        assert_eq!(
            build_time_range(Some(1.0), Some(2.0)).unwrap(),
            Some((1.0, 2.0))
        );
        assert!(build_time_range(Some(2.0), Some(1.0)).is_err());
    }

    #[test]
    fn test_mix_export_response_includes_warnings() {
        let response = mix_export_response(
            "/tmp/out.wav",
            vec!["Unsupported audio effect 'noise-reduction' skipped".to_string()],
        );

        assert_eq!(response["output"], "/tmp/out.wav");
        assert_eq!(response["status"], "complete");
        assert_eq!(response["warnings"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_audio_controller_segment_missing_duration() {
        let controller = create_test_controller();

        let opts = serde_json::json!({ "source": "/some/file.wav", "start": 0.0 });
        let result = controller.handle("segment", None, opts, None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_analyze_loudness_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("analyze_loudness", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_detect_silence_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("detect_silence", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_mixdown_accepts_empty_config() {
        let controller = create_test_controller();
        let opts = serde_json::json!({
            "config": {
                "tracks": [],
                "masterEffects": [],
                "masterVolume": 1.0,
                "sampleRate": 48000,
                "channels": 2
            },
            "time": 0.0
        });

        let response = controller
            .handle("mixdown", None, opts, None)
            .await
            .unwrap();
        let data = response.data.unwrap();

        assert_eq!(data["sampleRate"], 48000);
        assert_eq!(data["channels"], 2);
        assert!(data["warnings"].as_array().unwrap().is_empty());
        assert!(!data["dataBase64"].as_str().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_audio_controller_mixdown_missing_config_fails() {
        let controller = create_test_controller();
        let opts = serde_json::json!({
            "tracks": [],
            "sampleRate": 44100,
            "channels": 1,
            "time": 0.0
        });

        let error = controller
            .handle("mixdown", None, opts, None)
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("config required for audios:mixdown"));
    }

    #[tokio::test]
    async fn test_audio_controller_mixdown_config_warning_for_unsupported_effect() {
        let controller = create_test_controller();
        let opts = serde_json::json!({
            "config": {
                "tracks": [
                    {
                        "id": "track-1",
                        "effectChain": [
                            {
                                "id": "fx-1",
                                "effectType": "noise-reduction",
                                "enabled": true,
                                "params": {}
                            }
                        ],
                        "elements": []
                    }
                ],
                "masterEffects": [],
                "masterVolume": 1.0,
                "sampleRate": 48000,
                "channels": 2
            },
            "time": 0.0
        });

        let response = controller
            .handle("mixdown", None, opts, None)
            .await
            .unwrap();
        let data = response.data.unwrap();
        let warnings = data["warnings"].as_array().unwrap();

        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].as_str().unwrap().contains("noise-reduction"));
    }

    #[tokio::test]
    async fn test_audio_controller_mix_stream_update_replaces_config() {
        let controller = create_test_controller();
        let start_opts = serde_json::json!({
            "action": "start",
            "sessionId": "mix-test-update",
            "config": {
                "tracks": [],
                "masterEffects": [],
                "masterVolume": 1.0,
                "sampleRate": 48000,
                "channels": 2
            }
        });
        let start_response = controller
            .handle("mix_stream", None, start_opts, None)
            .await;
        let start_data = start_response.unwrap().data.unwrap();
        let stream_id = start_data["streamId"].as_str().unwrap().to_string();

        let opts = serde_json::json!({
            "action": "update",
            "streamId": stream_id,
            "config": {
                "tracks": [],
                "masterEffects": [
                    {
                        "id": "master-noise",
                        "effectType": "noise-reduction",
                        "enabled": true,
                        "params": {}
                    }
                ],
                "masterVolume": 0.75,
                "sampleRate": 44100,
                "channels": 1
            }
        });

        let response = controller
            .handle("mix_stream", None, opts, None)
            .await
            .unwrap();

        let data = response.data.unwrap();
        assert_eq!(data["streamId"], stream_id);
        assert_eq!(data["status"], "updated");
        let warnings = data["warnings"].as_array().unwrap();
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].as_str().unwrap().contains("noise-reduction"));

        controller
            .handle(
                "stop",
                None,
                serde_json::json!({ "streamId": stream_id }),
                None,
            )
            .await
            .unwrap();
    }

    #[test]
    fn test_audio_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"probe"));
        assert!(actions.contains(&"transcode"));
        assert!(actions.contains(&"segment"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"waveform"));
        assert!(actions.contains(&"diff"));
        assert!(actions.contains(&"stop"));
        assert!(actions.contains(&"pause"));
        assert!(actions.contains(&"resume"));
        assert!(actions.contains(&"speed"));
        assert!(actions.contains(&"seek"));
        assert!(actions.contains(&"loop"));
        assert!(actions.contains(&"analyze_loudness"));
        assert!(actions.contains(&"detect_silence"));
        assert!(actions.contains(&"mixdown"));
        assert!(actions.contains(&"mix_stream"));
        assert!(actions.contains(&"mix_export"));
        assert_eq!(actions.len(), 17);
    }
}
