//! Media information types — probe response DTOs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Embedded cover art information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverArtInfo {
    /// MIME type (image/jpeg, image/png, etc.)
    pub mime_type: String,
    /// Base64-encoded image data
    pub data_base64: String,
}

/// Media file information (videos:probe / audios:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// Total duration in seconds
    pub duration: f64,
    /// Container format (mp4, mkv, etc.)
    pub format: String,
    /// File size in bytes
    pub file_size: u64,
    /// Video streams
    #[serde(default)]
    pub video_streams: Vec<VideoStreamInfo>,
    /// Audio streams
    #[serde(default)]
    pub audio_streams: Vec<AudioStreamInfo>,
    /// Subtitle streams
    #[serde(default)]
    pub subtitle_streams: Vec<SubtitleStreamInfo>,
    /// Container-level metadata tags (title, artist, album, etc.)
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
    /// Embedded cover art (base64-encoded)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_art: Option<CoverArtInfo>,
}

impl MediaInfo {
    /// Get the primary video stream (first one)
    pub fn primary_video(&self) -> Option<&VideoStreamInfo> {
        self.video_streams.first()
    }

    /// Get the primary audio stream (first one)
    pub fn primary_audio(&self) -> Option<&AudioStreamInfo> {
        self.audio_streams.first()
    }

    /// Check if media has video
    pub fn has_video(&self) -> bool {
        !self.video_streams.is_empty()
    }

    /// Check if media has audio
    pub fn has_audio(&self) -> bool {
        !self.audio_streams.is_empty()
    }
}

/// Video stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (h264, hevc, vp9, etc.)
    pub codec: String,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Pixel format
    pub pixel_format: String,
    /// Hardware acceleration used for decoding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hw_accel: Option<String>,
    /// Total frame count (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_count: Option<u64>,
    /// Color space
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    /// Color range (limited/full)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_range: Option<String>,
}

/// Audio stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (aac, mp3, opus, etc.)
    pub codec: String,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Channel layout (stereo, 5.1, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_layout: Option<String>,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

/// Subtitle stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (srt, ass, mov_text, etc.)
    pub codec: String,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Title/description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Audio file information (audios:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    /// Duration in seconds
    pub duration: f64,
    /// Codec name
    pub codec: String,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Bitrate in bps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Container format
    pub format: String,
    /// Channel layout
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_layout: Option<String>,
}

/// Image file information (images:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    /// Image width
    pub width: u32,
    /// Image height
    pub height: u32,
    /// Format (jpeg, png, webp, psd, etc.)
    pub format: String,
    /// Color space
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    /// Whether image has alpha channel
    pub has_alpha: bool,
    /// Bit depth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<u8>,
}

/// Extracted subtitle track
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedSubtitleTrack {
    /// Stream index
    pub index: usize,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Subtitle cues
    pub cues: Vec<SubtitleCue>,
}

/// Single subtitle cue
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCue {
    /// Start time in seconds
    pub start_time: f64,
    /// End time in seconds
    pub end_time: f64,
    /// Subtitle text
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_media_info(video: bool, audio: bool) -> MediaInfo {
        let mut info = MediaInfo {
            duration: 120.5,
            format: "mp4".to_string(),
            file_size: 50_000_000,
            video_streams: vec![],
            audio_streams: vec![],
            subtitle_streams: vec![],
            metadata: HashMap::new(),
            cover_art: None,
        };
        if video {
            info.video_streams.push(VideoStreamInfo {
                index: 0,
                codec: "h264".to_string(),
                width: 1920,
                height: 1080,
                fps: 30.0,
                bitrate: Some(5_000_000),
                pixel_format: "yuv420p".to_string(),
                hw_accel: None,
                frame_count: Some(3615),
                color_space: None,
                color_range: None,
            });
        }
        if audio {
            info.audio_streams.push(AudioStreamInfo {
                index: 1,
                codec: "aac".to_string(),
                sample_rate: 48000,
                channels: 2,
                bitrate: Some(128_000),
                channel_layout: Some("stereo".to_string()),
                language: Some("eng".to_string()),
            });
        }
        info
    }

    #[test]
    fn test_media_info_has_video() {
        assert!(make_media_info(true, false).has_video());
        assert!(!make_media_info(false, true).has_video());
    }

    #[test]
    fn test_media_info_has_audio() {
        assert!(make_media_info(false, true).has_audio());
        assert!(!make_media_info(true, false).has_audio());
    }

    #[test]
    fn test_media_info_primary_streams() {
        let info = make_media_info(true, true);
        let video = info.primary_video().unwrap();
        assert_eq!(video.width, 1920);
        assert_eq!(video.height, 1080);
        assert_eq!(video.fps, 30.0);

        let audio = info.primary_audio().unwrap();
        assert_eq!(audio.sample_rate, 48000);
        assert_eq!(audio.channels, 2);
    }

    #[test]
    fn test_media_info_no_primary_streams() {
        let info = make_media_info(false, false);
        assert!(info.primary_video().is_none());
        assert!(info.primary_audio().is_none());
    }

    #[test]
    fn test_media_info_serde_roundtrip() {
        let info = make_media_info(true, true);
        let json = serde_json::to_string(&info).unwrap();
        let parsed: MediaInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.duration, 120.5);
        assert_eq!(parsed.format, "mp4");
        assert_eq!(parsed.video_streams.len(), 1);
        assert_eq!(parsed.audio_streams.len(), 1);
    }
}
