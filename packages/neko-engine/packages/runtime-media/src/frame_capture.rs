//! CPU video frame capture for thumbnails and still previews.

use std::path::Path;
use std::sync::Once;

use ffmpeg::format::Pixel;
use ffmpeg::media::Type;
use ffmpeg::software::scaling::{context::Context as ScaleContext, flag::Flags};
use ffmpeg::util::frame::video::Video;
use ffmpeg_next as ffmpeg;
use neko_engine_types::FrameFormat;

use crate::error::{MediaError as Error, Result};
use crate::jpeg_encoder::encode_rgb_to_jpeg;

static FFMPEG_INIT: Once = Once::new();

/// Options for CPU video frame capture.
#[derive(Debug, Clone)]
pub struct VideoFrameCaptureOptions {
    /// Output format. JPEG and RGBA are supported; other formats currently fall back to JPEG.
    pub format: FrameFormat,
    /// JPEG quality 1-100.
    pub quality: u32,
    /// Resize width. Defaults to source width when absent.
    pub width: Option<u32>,
    /// Resize height. Defaults to source height when absent.
    pub height: Option<u32>,
}

impl Default for VideoFrameCaptureOptions {
    fn default() -> Self {
        Self {
            format: FrameFormat::Jpeg,
            quality: 85,
            width: None,
            height: None,
        }
    }
}

/// Captured video frame bytes.
#[derive(Debug, Clone)]
pub struct CapturedVideoFrame {
    /// Encoded image bytes or raw RGBA bytes depending on `format`.
    pub data: Vec<u8>,
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
    /// Output format.
    pub format: FrameFormat,
    /// Best-effort decoded frame timestamp in seconds.
    pub timestamp: f64,
}

/// Capture a single video frame using FFmpeg software decode and scale.
pub fn capture_video_frame<P: AsRef<Path>>(
    source: P,
    time_seconds: f64,
    options: VideoFrameCaptureOptions,
) -> Result<CapturedVideoFrame> {
    init_ffmpeg();

    if !time_seconds.is_finite() || time_seconds < 0.0 {
        return Err(Error::Other(format!(
            "Invalid capture time: {}",
            time_seconds
        )));
    }

    let source = source.as_ref();
    if !source.exists() {
        return Err(Error::FileNotFound(source.display().to_string()));
    }

    let mut input = ffmpeg::format::input(source)
        .map_err(|e| Error::Ffmpeg(format!("Failed to open file: {e}")))?;
    let stream = input
        .streams()
        .best(Type::Video)
        .ok_or_else(|| Error::NotFound(format!("No video stream found in {}", source.display())))?;

    let stream_index = stream.index();
    let stream_time_base = stream.time_base();
    let decoder_context = ffmpeg::codec::context::Context::from_parameters(stream.parameters())
        .map_err(|e| Error::Ffmpeg(format!("Create decoder context: {e}")))?;
    let mut decoder = decoder_context
        .decoder()
        .video()
        .map_err(|e| Error::Ffmpeg(format!("Open video decoder: {e}")))?;

    let target_width = sanitize_dimension(options.width, decoder.width(), "width")?;
    let target_height = sanitize_dimension(options.height, decoder.height(), "height")?;
    let pixel_format = match options.format {
        FrameFormat::Rgba => Pixel::RGBA,
        _ => Pixel::RGB24,
    };

    let mut scaler = ScaleContext::get(
        decoder.format(),
        decoder.width(),
        decoder.height(),
        pixel_format,
        target_width,
        target_height,
        Flags::BILINEAR,
    )
    .map_err(|e| Error::Ffmpeg(format!("Create scaler: {e}")))?;

    if seek_near(&mut input, time_seconds)? {
        decoder.flush();
    }

    let target_timestamp = time_seconds;
    let mut last_frame: Option<CapturedVideoFrame> = None;

    for (packet_stream, packet) in input.packets() {
        if packet_stream.index() != stream_index {
            continue;
        }

        decoder
            .send_packet(&packet)
            .map_err(|e| Error::Ffmpeg(format!("Send packet: {e}")))?;

        if let Some(frame) = receive_target_frame(
            &mut decoder,
            &mut scaler,
            pixel_format,
            target_width,
            target_height,
            stream_time_base,
            target_timestamp,
            &options,
            &mut last_frame,
        )? {
            return Ok(frame);
        }
    }

    decoder
        .send_eof()
        .map_err(|e| Error::Ffmpeg(format!("Send decoder EOF: {e}")))?;
    if let Some(frame) = receive_target_frame(
        &mut decoder,
        &mut scaler,
        pixel_format,
        target_width,
        target_height,
        stream_time_base,
        target_timestamp,
        &options,
        &mut last_frame,
    )? {
        return Ok(frame);
    }

    last_frame.ok_or_else(|| Error::NotFound(format!("No frame at time {time_seconds}")))
}

fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
        ffmpeg::util::log::set_level(ffmpeg::util::log::Level::Error);
    });
}

fn sanitize_dimension(value: Option<u32>, fallback: u32, name: &str) -> Result<u32> {
    match value {
        Some(0) => Err(Error::Other(format!("Invalid capture {name}: 0"))),
        Some(value) => Ok(value),
        None => Ok(fallback),
    }
}

fn seek_near(input: &mut ffmpeg::format::context::Input, time_seconds: f64) -> Result<bool> {
    if time_seconds <= 0.0 {
        return Ok(false);
    }

    let timestamp = (time_seconds * ffmpeg::ffi::AV_TIME_BASE as f64).round() as i64;
    input
        .seek(timestamp, ..timestamp)
        .map_err(|e| Error::Ffmpeg(format!("Seek to {time_seconds}s: {e}")))?;
    Ok(true)
}

#[allow(clippy::too_many_arguments)]
fn receive_target_frame(
    decoder: &mut ffmpeg::decoder::Video,
    scaler: &mut ScaleContext,
    pixel_format: Pixel,
    width: u32,
    height: u32,
    time_base: ffmpeg::Rational,
    target_timestamp: f64,
    options: &VideoFrameCaptureOptions,
    last_frame: &mut Option<CapturedVideoFrame>,
) -> Result<Option<CapturedVideoFrame>> {
    let mut decoded = Video::empty();
    while decoder.receive_frame(&mut decoded).is_ok() {
        let decoded_timestamp = frame_timestamp_seconds(&decoded, time_base);
        let captured = convert_frame(
            &decoded,
            scaler,
            pixel_format,
            width,
            height,
            decoded_timestamp.unwrap_or(target_timestamp),
            options,
        )?;

        if decoded_timestamp.is_none_or(|timestamp| timestamp >= target_timestamp) {
            return Ok(Some(captured));
        }

        *last_frame = Some(captured);
    }

    Ok(None)
}

fn frame_timestamp_seconds(frame: &Video, time_base: ffmpeg::Rational) -> Option<f64> {
    frame.timestamp().map(|timestamp| {
        timestamp as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
    })
}

fn convert_frame(
    decoded: &Video,
    scaler: &mut ScaleContext,
    pixel_format: Pixel,
    width: u32,
    height: u32,
    timestamp: f64,
    options: &VideoFrameCaptureOptions,
) -> Result<CapturedVideoFrame> {
    let mut scaled = Video::empty();
    scaler
        .run(decoded, &mut scaled)
        .map_err(|e| Error::Ffmpeg(format!("Scale frame: {e}")))?;

    let packed = copy_packed_frame(&scaled, pixel_format, width, height)?;
    let (data, format) = match options.format {
        FrameFormat::Rgba => (packed, FrameFormat::Rgba),
        FrameFormat::Jpeg => (
            encode_rgb_to_jpeg(&packed, width, height, options.quality)?,
            FrameFormat::Jpeg,
        ),
        _ => (
            encode_rgb_to_jpeg(&packed, width, height, options.quality)?,
            FrameFormat::Jpeg,
        ),
    };

    Ok(CapturedVideoFrame {
        data,
        width,
        height,
        format,
        timestamp,
    })
}

fn copy_packed_frame(
    frame: &Video,
    pixel_format: Pixel,
    width: u32,
    height: u32,
) -> Result<Vec<u8>> {
    let bytes_per_pixel = match pixel_format {
        Pixel::RGB24 => 3,
        Pixel::RGBA => 4,
        other => {
            return Err(Error::Other(format!(
                "Unsupported packed capture pixel format: {other:?}"
            )))
        }
    };
    let row_bytes = width as usize * bytes_per_pixel;
    let stride = frame.stride(0);
    let data = frame.data(0);

    if stride < row_bytes {
        return Err(Error::Ffmpeg(format!(
            "Invalid frame stride: {stride} < {row_bytes}"
        )));
    }

    let mut packed = Vec::with_capacity(row_bytes * height as usize);
    for row in 0..height as usize {
        let offset = row * stride;
        packed.extend_from_slice(&data[offset..offset + row_bytes]);
    }

    Ok(packed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_rejects_invalid_time() {
        let result = capture_video_frame(
            "/does/not/matter.mp4",
            f64::NAN,
            VideoFrameCaptureOptions::default(),
        );

        assert!(
            matches!(result, Err(Error::Other(message)) if message.contains("Invalid capture time"))
        );
    }

    #[test]
    fn sanitize_dimension_rejects_zero() {
        let result = sanitize_dimension(Some(0), 1920, "width");

        assert!(
            matches!(result, Err(Error::Other(message)) if message.contains("Invalid capture width"))
        );
    }
}
