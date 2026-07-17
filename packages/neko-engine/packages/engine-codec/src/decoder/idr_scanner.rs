//! IDR Frame Scanner
//!
//! Scans video files to identify true IDR (Instantaneous Decoder Refresh) frames.
//!
//! ## IDR vs Non-IDR I-frames
//!
//! FFmpeg's `is_key()` marks all I-frames, but not all I-frames are IDR frames.
//! IDR frames are special because they:
//! - Clear the reference picture buffer
//! - Allow random access without decoding previous frames
//!
//! ## NAL Unit Types
//!
//! - **H.264 (AVC)**: NAL type 5 = IDR slice
//! - **H.265 (HEVC)**: NAL type 19 = IDR_W_RADL, type 20 = IDR_N_LP

use std::path::Path;

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::input;
use ffmpeg_next::media::Type;

use crate::error::{Error, Result};

/// Information about a keyframe in the source video
#[derive(Debug, Clone)]
pub struct KeyframeInfo {
    /// Source file path
    pub source_path: String,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Frame index in the source video
    pub frame_index: u64,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Whether this is a true IDR frame
    pub is_idr: bool,
    /// NAL unit type (for debugging)
    pub nal_type: u8,
    /// Presentation timestamp (pts)
    pub pts: i64,
}

/// Video codec type for NAL parsing and keyframe detection strategy
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodecType {
    /// H.264/AVC — IDR detection via NAL type 5
    H264,
    /// H.265/HEVC — IDR detection via NAL type 19/20
    H265,
    /// Intra-only codec (ProRes, MJPEG, DNxHD, etc.) — every frame is a keyframe
    IntraOnly,
    /// Other inter-frame codec (VP9, AV1, etc.) — use is_key() fallback
    Other,
}

impl VideoCodecType {
    /// Detect codec type from FFmpeg codec ID
    pub fn from_codec_id(id: ffmpeg::codec::Id) -> Self {
        match id {
            ffmpeg::codec::Id::H264 => VideoCodecType::H264,
            ffmpeg::codec::Id::HEVC => VideoCodecType::H265,
            // Intra-only codecs: every frame is independently decodable
            ffmpeg::codec::Id::PRORES
            | ffmpeg::codec::Id::MJPEG
            | ffmpeg::codec::Id::DNXHD
            | ffmpeg::codec::Id::RAWVIDEO
            | ffmpeg::codec::Id::HUFFYUV
            | ffmpeg::codec::Id::FFV1 => VideoCodecType::IntraOnly,
            _ => VideoCodecType::Other,
        }
    }
}

/// IDR Frame Scanner
///
/// Scans a video file to identify all IDR frames by parsing NAL unit headers.
pub struct IdrScanner {
    path: String,
    codec_type: VideoCodecType,
    time_base: f64,
    width: u32,
    height: u32,
    duration: f64,
}

impl IdrScanner {
    /// Create a new scanner for the given video file
    pub fn new(path: impl Into<String>) -> Result<Self> {
        let path = path.into();

        if !Path::new(&path).exists() {
            return Err(Error::FileNotFound(path));
        }

        let input_ctx = input(&path)?;

        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let codec_params = stream.parameters();
        let codec_id = codec_params.id();
        let codec_type = VideoCodecType::from_codec_id(codec_id);

        let time_base = stream.time_base();
        let time_base_f64 = time_base.numerator() as f64 / time_base.denominator() as f64;

        let context = ffmpeg::codec::context::Context::from_parameters(codec_params)?;
        let decoder = context.decoder().video()?;

        let width = decoder.width();
        let height = decoder.height();

        let duration = if stream.duration() > 0 {
            stream.duration() as f64 * time_base_f64
        } else {
            input_ctx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        };

        Ok(Self {
            path,
            codec_type,
            time_base: time_base_f64,
            width,
            height,
            duration,
        })
    }

    /// Get the video codec type
    pub fn codec_type(&self) -> VideoCodecType {
        self.codec_type
    }

    /// Get video duration in seconds
    pub fn duration(&self) -> f64 {
        self.duration
    }

    /// Scan for all IDR frames in the video
    ///
    /// Returns a list of KeyframeInfo sorted by timestamp.
    ///
    /// - H.264/H.265: only true IDR frames (NAL unit parsing)
    /// - Intra-only codecs (ProRes, MJPEG, etc.): returns empty list (every frame is seekable)
    /// - Other codecs (VP9, AV1, etc.): uses FFmpeg `is_key()` as fallback
    pub fn scan_idr_frames(&self) -> Result<Vec<KeyframeInfo>> {
        // Intra-only codecs: every frame is independently decodable,
        // returning all frames is meaningless. Return empty — caller
        // can seek to any position directly.
        if self.codec_type == VideoCodecType::IntraOnly {
            return Ok(Vec::new());
        }

        let mut input_ctx = input(&self.path)?;

        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let stream_index = stream.index();
        let mut keyframes = Vec::new();
        let mut frame_index: u64 = 0;

        for (stream, packet) in input_ctx.packets() {
            if stream.index() != stream_index {
                continue;
            }

            let is_key = packet.is_key();
            let pts = packet.pts().unwrap_or(0);
            let timestamp = pts as f64 * self.time_base;

            // Check if this is a true IDR frame
            let (is_idr, nal_type) = if is_key {
                self.check_idr_frame(&packet)
            } else {
                (false, 0)
            };

            if is_idr {
                keyframes.push(KeyframeInfo {
                    source_path: self.path.clone(),
                    timestamp,
                    frame_index,
                    width: self.width,
                    height: self.height,
                    is_idr: true,
                    nal_type,
                    pts,
                });
            }

            frame_index += 1;
        }

        // Sort by timestamp (should already be sorted, but ensure it)
        keyframes.sort_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

        Ok(keyframes)
    }

    /// Check if a packet contains an IDR frame by parsing NAL unit header
    fn check_idr_frame(&self, packet: &ffmpeg::Packet) -> (bool, u8) {
        let data = match packet.data() {
            Some(d) if !d.is_empty() => d,
            _ => return (false, 0),
        };

        match self.codec_type {
            VideoCodecType::H264 => self.check_h264_idr(data),
            VideoCodecType::H265 => self.check_h265_idr(data),
            VideoCodecType::IntraOnly => {
                // Intra-only codecs: every frame is a keyframe, handled in scan_idr_frames
                (false, 0)
            }
            VideoCodecType::Other => {
                // Fallback: trust is_key() for unknown codecs (VP9, AV1, etc.)
                (packet.is_key(), 0)
            }
        }
    }

    /// Check for H.264 IDR frame (NAL type 5)
    fn check_h264_idr(&self, data: &[u8]) -> (bool, u8) {
        // Try Annex B format first (start codes)
        for nal_data in self.iter_annex_b_nals(data) {
            if !nal_data.is_empty() {
                let nal_type = nal_data[0] & 0x1F;
                if nal_type == 5 {
                    return (true, nal_type);
                }
            }
        }

        // Try AVCC format (4-byte length prefix, used in MP4 containers)
        for nal_data in self.iter_avcc_nals(data, 4) {
            if !nal_data.is_empty() {
                let nal_type = nal_data[0] & 0x1F;
                if nal_type == 5 {
                    return (true, nal_type);
                }
            }
        }

        (false, 0)
    }

    /// Check for H.265 IDR frame (NAL type 19 = IDR_W_RADL, 20 = IDR_N_LP)
    fn check_h265_idr(&self, data: &[u8]) -> (bool, u8) {
        // Try Annex B format first
        for nal_data in self.iter_annex_b_nals(data) {
            if !nal_data.is_empty() {
                let nal_type = (nal_data[0] >> 1) & 0x3F;
                if nal_type == 19 || nal_type == 20 {
                    return (true, nal_type);
                }
            }
        }

        // Try HVCC format (4-byte length prefix)
        for nal_data in self.iter_avcc_nals(data, 4) {
            if !nal_data.is_empty() {
                let nal_type = (nal_data[0] >> 1) & 0x3F;
                if nal_type == 19 || nal_type == 20 {
                    return (true, nal_type);
                }
            }
        }

        (false, 0)
    }

    /// Iterate over NAL units in Annex B format (start code separated)
    fn iter_annex_b_nals<'a>(&self, data: &'a [u8]) -> Vec<&'a [u8]> {
        let mut nals = Vec::new();
        let mut i = 0;

        while i < data.len() {
            // Find start code
            let (start, sc_len) = if i + 3 < data.len()
                && data[i] == 0
                && data[i + 1] == 0
                && data[i + 2] == 0
                && data[i + 3] == 1
            {
                (i + 4, 4)
            } else if i + 2 < data.len() && data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
                (i + 3, 3)
            } else {
                i += 1;
                continue;
            };

            if sc_len == 0 {
                break;
            }

            // Find next start code or end of data
            let mut end = start;
            while end < data.len() {
                if end + 3 < data.len()
                    && data[end] == 0
                    && data[end + 1] == 0
                    && (data[end + 2] == 1
                        || (data[end + 2] == 0 && end + 3 < data.len() && data[end + 3] == 1))
                {
                    break;
                }
                end += 1;
            }

            if start < end {
                nals.push(&data[start..end]);
            }
            i = end;
        }

        nals
    }

    /// Iterate over NAL units in AVCC/HVCC format (length-prefixed)
    fn iter_avcc_nals<'a>(&self, data: &'a [u8], length_size: usize) -> Vec<&'a [u8]> {
        let mut nals = Vec::new();
        let mut offset = 0;

        while offset + length_size <= data.len() {
            let nal_len = match length_size {
                4 => u32::from_be_bytes([
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                ]) as usize,
                2 => u16::from_be_bytes([data[offset], data[offset + 1]]) as usize,
                1 => data[offset] as usize,
                _ => break,
            };

            offset += length_size;

            if nal_len == 0 || offset + nal_len > data.len() {
                break;
            }

            nals.push(&data[offset..offset + nal_len]);
            offset += nal_len;
        }

        nals
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_codec_type_detection() {
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::H264),
            VideoCodecType::H264
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::HEVC),
            VideoCodecType::H265
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::PRORES),
            VideoCodecType::IntraOnly
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::MJPEG),
            VideoCodecType::IntraOnly
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::DNXHD),
            VideoCodecType::IntraOnly
        );
        assert_eq!(
            VideoCodecType::from_codec_id(ffmpeg::codec::Id::VP9),
            VideoCodecType::Other
        );
    }

    fn make_scanner(codec: VideoCodecType) -> IdrScanner {
        IdrScanner {
            path: String::new(),
            codec_type: codec,
            time_base: 1.0 / 30.0,
            width: 1920,
            height: 1080,
            duration: 10.0,
        }
    }

    #[test]
    fn test_h264_annex_b_idr() {
        let scanner = make_scanner(VideoCodecType::H264);

        // Annex B: 4-byte start code + IDR NAL (type 5)
        let idr_data = vec![0x00, 0x00, 0x00, 0x01, 0x65];
        let (is_idr, nal_type) = scanner.check_h264_idr(&idr_data);
        assert!(is_idr);
        assert_eq!(nal_type, 5);

        // Annex B: 3-byte start code + non-IDR (type 1)
        let non_idr = vec![0x00, 0x00, 0x01, 0x41];
        let (is_idr, _) = scanner.check_h264_idr(&non_idr);
        assert!(!is_idr);
    }

    #[test]
    fn test_h264_avcc_multi_nal() {
        let scanner = make_scanner(VideoCodecType::H264);

        // AVCC: SPS (type 7) + PPS (type 8) + IDR (type 5)
        // Each NAL prefixed with 4-byte big-endian length
        let mut data = Vec::new();
        // SPS: length=2, nal_header=0x67 (type 7)
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x67, 0x00]);
        // PPS: length=2, nal_header=0x68 (type 8)
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x68, 0x00]);
        // IDR: length=2, nal_header=0x65 (type 5)
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x65, 0x00]);

        let (is_idr, nal_type) = scanner.check_h264_idr(&data);
        assert!(is_idr);
        assert_eq!(nal_type, 5);
    }

    #[test]
    fn test_h264_avcc_no_idr() {
        let scanner = make_scanner(VideoCodecType::H264);

        // AVCC: only non-IDR slice (type 1)
        let data = vec![0x00, 0x00, 0x00, 0x02, 0x41, 0x00];
        let (is_idr, _) = scanner.check_h264_idr(&data);
        assert!(!is_idr);
    }

    #[test]
    fn test_h265_annex_b_idr() {
        let scanner = make_scanner(VideoCodecType::H265);

        // IDR_W_RADL (type 19): nal_header = (19 << 1) = 0x26
        let idr_data = vec![0x00, 0x00, 0x00, 0x01, 0x26, 0x01];
        let (is_idr, nal_type) = scanner.check_h265_idr(&idr_data);
        assert!(is_idr);
        assert_eq!(nal_type, 19);

        // IDR_N_LP (type 20): nal_header = (20 << 1) = 0x28
        let idr_nlp = vec![0x00, 0x00, 0x00, 0x01, 0x28, 0x01];
        let (is_idr, nal_type) = scanner.check_h265_idr(&idr_nlp);
        assert!(is_idr);
        assert_eq!(nal_type, 20);
    }

    #[test]
    fn test_h265_hvcc_multi_nal() {
        let scanner = make_scanner(VideoCodecType::H265);

        // HVCC: VPS (type 32, header=0x40) + SPS (type 33, header=0x42) + IDR_W_RADL (type 19, header=0x26)
        let mut data = Vec::new();
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x40, 0x01]); // VPS
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x42, 0x01]); // SPS
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x26, 0x01]); // IDR

        let (is_idr, nal_type) = scanner.check_h265_idr(&data);
        assert!(is_idr);
        assert_eq!(nal_type, 19);
    }

    #[test]
    fn test_iter_annex_b_nals() {
        let scanner = make_scanner(VideoCodecType::H264);

        // Two NAL units with 4-byte start codes
        let data = vec![
            0x00, 0x00, 0x00, 0x01, 0x67, 0xAA, // SPS
            0x00, 0x00, 0x00, 0x01, 0x65, 0xBB, // IDR
        ];
        let nals = scanner.iter_annex_b_nals(&data);
        assert_eq!(nals.len(), 2);
        assert_eq!(nals[0][0] & 0x1F, 7); // SPS
        assert_eq!(nals[1][0] & 0x1F, 5); // IDR
    }

    #[test]
    fn test_iter_avcc_nals() {
        let scanner = make_scanner(VideoCodecType::H264);

        let mut data = Vec::new();
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x03, 0x67, 0xAA, 0xBB]); // len=3
        data.extend_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x65, 0xCC]); // len=2

        let nals = scanner.iter_avcc_nals(&data, 4);
        assert_eq!(nals.len(), 2);
        assert_eq!(nals[0].len(), 3);
        assert_eq!(nals[1].len(), 2);
    }
}
