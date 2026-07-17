//! Shared utilities for controllers

use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use crate::registry::ResourceRegistry;
use neko_engine_kernel::contracts::services::IStreamPlayback;
use neko_engine_types::project_context::{ProjectContext, ResolvedPath};
use neko_engine_types::{ActionResponse, FileSourceRef, LoopRegion, ResourceId, StreamId};
use serde::Deserialize;
use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;

/// Simple base64 encoding (no external dependency)
pub fn base64_encode(data: &[u8]) -> String {
    let mut buf = Vec::new();
    {
        let mut encoder = Base64Encoder::new(&mut buf);
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap();
    }
    String::from_utf8(buf).unwrap()
}

/// Simple base64 encoder
struct Base64Encoder<W: Write> {
    writer: W,
    buffer: [u8; 3],
    buffer_len: usize,
}

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

impl<W: Write> Base64Encoder<W> {
    fn new(writer: W) -> Self {
        Self {
            writer,
            buffer: [0; 3],
            buffer_len: 0,
        }
    }

    fn finish(mut self) -> std::io::Result<()> {
        if self.buffer_len > 0 {
            let mut out = [b'='; 4];
            out[0] = BASE64_CHARS[(self.buffer[0] >> 2) as usize];
            if self.buffer_len == 1 {
                out[1] = BASE64_CHARS[((self.buffer[0] & 0x03) << 4) as usize];
            } else {
                out[1] =
                    BASE64_CHARS[(((self.buffer[0] & 0x03) << 4) | (self.buffer[1] >> 4)) as usize];
                out[2] = BASE64_CHARS[((self.buffer[1] & 0x0f) << 2) as usize];
            }
            self.writer.write_all(&out)?;
        }
        Ok(())
    }
}

impl<W: Write> Write for Base64Encoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut written = 0;
        for &byte in buf {
            self.buffer[self.buffer_len] = byte;
            self.buffer_len += 1;
            if self.buffer_len == 3 {
                let out = [
                    BASE64_CHARS[(self.buffer[0] >> 2) as usize],
                    BASE64_CHARS[(((self.buffer[0] & 0x03) << 4) | (self.buffer[1] >> 4)) as usize],
                    BASE64_CHARS[(((self.buffer[1] & 0x0f) << 2) | (self.buffer[2] >> 6)) as usize],
                    BASE64_CHARS[(self.buffer[2] & 0x3f) as usize],
                ];
                self.writer.write_all(&out)?;
                self.buffer_len = 0;
            }
            written += 1;
        }
        Ok(written)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.writer.flush()
    }
}

/// Simple base64 decoding (no external dependency)
pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let input = input.trim_end_matches('=');
    let mut output = Vec::with_capacity(input.len() * 3 / 4);

    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for ch in input.bytes() {
        let val = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'\n' | b'\r' | b' ' | b'\t' => continue,
            _ => return Err(format!("Invalid base64 character: {}", ch as char)),
        };

        buf = (buf << 6) | val as u32;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }

    Ok(output)
}

/// Resolve resource: either by ID or by source path (self-healing)
///
/// Returns (ResourceId, file_path) — the ResourceId for API responses,
/// and the real file path for passing to Service layer.
///
/// Resolution strategy:
/// 1. If `id` is provided, try to resolve from registry → returns (id, path)
/// 2. If `source` is provided, register it → returns (new_id, path)
/// 3. Otherwise, return error
pub async fn resolve_resource(
    registry: &ResourceRegistry,
    id: Option<&str>,
    source: Option<&str>,
) -> ApiResult<(ResourceId, PathBuf)> {
    // Step 1: Try to resolve by ID
    if let Some(id_str) = id {
        let resource_id = ResourceId::from_string(id_str.to_string());
        if let Some(handle) = registry.resolve(&resource_id).await {
            return Ok((resource_id, handle.source_path));
        }
    }

    // Step 2: Fall back to source path (self-healing)
    if let Some(source_path) = source {
        let path = PathBuf::from(source_path);
        let resource_id = registry.register(&path).await;
        return Ok((resource_id, path));
    }

    // Step 3: Neither ID nor source
    Err(ApiError::InvalidRequest(
        "Either resource_id or source path required".to_string(),
    ))
}

/// Resolve a token/path source reference into a local file path.
pub fn resolve_file_source_ref(
    files: &FileAccessRegistry,
    source_ref: Option<&FileSourceRef>,
    fallback_source: Option<&str>,
    label: &str,
) -> ApiResult<PathBuf> {
    if let Some(source_ref) = source_ref {
        if let Some(token) = source_ref.token.as_deref() {
            return files
                .lookup_token(token)?
                .ok_or_else(|| ApiError::NotFound(format!("{label} file token not found")));
        }
        if let Some(path) = source_ref.path.as_deref() {
            return Ok(PathBuf::from(path));
        }
        if let Some(asset_id) = source_ref.asset_id.as_deref() {
            return Err(ApiError::InvalidRequest(format!(
                "{label} asset source refs are not supported yet: {asset_id}"
            )));
        }
    }

    fallback_source.map(PathBuf::from).ok_or_else(|| {
        ApiError::InvalidRequest(format!("{label} source path or sourceRef required"))
    })
}

/// Resolve a source path using an optional ProjectContext.
///
/// When `context` is provided, paths are resolved through it (variable expansion,
/// relative path resolution, etc.). When absent, the source is treated as an
/// absolute path (backward compatible with existing callers).
#[allow(dead_code)]
pub fn resolve_source_with_context(
    source: &str,
    context: Option<&ProjectContext>,
) -> ApiResult<PathBuf> {
    if let Some(ctx) = context {
        match ctx.resolve(source) {
            Ok(ResolvedPath::Local(p)) => Ok(p),
            Ok(ResolvedPath::Remote(url)) => Err(ApiError::InvalidRequest(format!(
                "Remote URLs are not directly supported as source: {url}"
            ))),
            Err(e) => Err(ApiError::InvalidRequest(e.to_string())),
        }
    } else {
        Ok(PathBuf::from(source))
    }
}

/// Shared options for stream control actions (stop/pause/resume/speed/seek/loop)
///
/// Used by VideoController, AudioController, and TimelineController to avoid
/// duplicating the same struct definition in each controller.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StreamControlOptions {
    /// Stream ID (required for all control actions)
    pub stream_id: Option<String>,
    /// Playback speed multiplier (for speed action)
    pub speed: Option<f64>,
    /// Seek time in seconds (for seek action)
    pub time: Option<f64>,
    /// Loop in-point in seconds (for loop action)
    pub in_point: Option<f64>,
    /// Loop out-point in seconds (for loop action)
    pub out_point: Option<f64>,
    /// Clear loop region (for loop action)
    #[serde(default)]
    pub clear: bool,
    /// Base directory for resolving relative media paths (for applyOperation)
    pub base_dir: Option<String>,
}

/// Handle stream control actions (stop/pause/resume/speed/seek/loop) for any service
/// that implements `IStreamPlayback`.
///
/// This eliminates duplicated stream control handler logic across
/// VideoController, AudioController, and TimelineController.
pub async fn handle_stream_control<S: IStreamPlayback + ?Sized>(
    playback: &S,
    action: &str,
    options: Value,
    group_name: &str,
) -> ApiResult<ActionResponse> {
    let opts: StreamControlOptions = serde_json::from_value(options).unwrap_or_default();

    let stream_id_str = opts.stream_id.ok_or_else(|| {
        ApiError::InvalidRequest(format!("stream_id required for {}:{}", group_name, action))
    })?;
    let stream_id = StreamId::from_string(stream_id_str);

    match action {
        "stop" => {
            playback.stop_stream(&stream_id).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "status": "stopped",
            });
            Ok(ActionResponse::ok("", response))
        }
        "pause" => {
            playback.pause(&stream_id).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "status": "paused",
            });
            Ok(ActionResponse::ok("", response))
        }
        "resume" => {
            playback.resume(&stream_id).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "status": "active",
            });
            Ok(ActionResponse::ok("", response))
        }
        "speed" => {
            let speed = opts.speed.unwrap_or(1.0);
            playback.set_speed(&stream_id, speed).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "speed": speed,
            });
            Ok(ActionResponse::ok("", response))
        }
        "seek" => {
            let time = opts.time.ok_or_else(|| {
                ApiError::InvalidRequest(format!("time required for {}:seek", group_name))
            })?;
            playback.seek(&stream_id, time).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "time": time,
            });
            Ok(ActionResponse::ok("", response))
        }
        "loop" => {
            let region = if opts.clear {
                None
            } else {
                match (opts.in_point, opts.out_point) {
                    (Some(in_pt), Some(out_pt)) => Some(LoopRegion::new(in_pt, out_pt)),
                    _ => {
                        return Err(ApiError::InvalidRequest(format!(
                            "in_point and out_point required for {}:loop (or set clear=true)",
                            group_name
                        )));
                    }
                }
            };
            playback.set_loop(&stream_id, region.clone()).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "loop": region.map(|r| serde_json::json!({
                    "inPoint": r.in_point,
                    "outPoint": r.out_point,
                })),
            });
            Ok(ActionResponse::ok("", response))
        }
        _ => Err(ApiError::UnknownAction {
            group: group_name.to_string(),
            action: action.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode_basic() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hello!"), "SGVsbG8h");
        assert_eq!(base64_encode(b""), "");
    }

    #[test]
    fn test_base64_encode_binary() {
        assert_eq!(base64_encode(&[0, 1, 2, 3]), "AAECAw==");
        assert_eq!(base64_encode(&[255, 254, 253]), "//79");
    }

    #[test]
    fn test_base64_encode_padding() {
        // 1 byte → 4 chars with ==
        assert_eq!(base64_encode(&[0]), "AA==");
        // 2 bytes → 4 chars with =
        assert_eq!(base64_encode(&[0, 0]), "AAA=");
        // 3 bytes → 4 chars no padding
        assert_eq!(base64_encode(&[0, 0, 0]), "AAAA");
    }
}
