//! Media Probe - Extract metadata from media files
//!
//! Uses FFmpeg to probe media files and extract:
//! - Video stream info (codec, resolution, fps, duration)
//! - Audio stream info (codec, sample rate, channels)
//! - Subtitle stream info
//! - Container-level metadata tags (title, artist, album, etc.)
//! - Embedded cover art (attached pictures)

use crate::error::{MediaError as Error, Result};
use ffmpeg_next as ffmpeg;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Once, OnceLock, RwLock};
use std::time::{Instant, SystemTime};

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg (thread-safe, called once)
fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

/// Subtitle stream information
#[derive(Debug, Clone)]
pub struct SubtitleStream {
    /// Stream index
    pub index: usize,
    /// Codec name (subrip, ass, webvtt, etc.)
    pub codec: String,
    /// Language code (eng, chi, etc.)
    pub language: Option<String>,
    /// Stream title
    pub title: Option<String>,
    /// Is default stream
    pub is_default: bool,
    /// Is forced stream
    pub is_forced: bool,
}

/// Embedded cover art data
#[derive(Debug, Clone)]
pub struct CoverArt {
    /// MIME type (image/jpeg, image/png, etc.)
    pub mime_type: String,
    /// Raw image bytes
    pub data: Vec<u8>,
}

/// Media file information
#[derive(Debug, Clone)]
pub struct MediaInfo {
    /// Duration in seconds
    pub duration: f64,
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Video codec name
    pub codec: String,
    /// Container format
    pub format: String,
    /// Video bitrate (bps)
    pub bitrate: Option<u64>,
    /// Has audio stream
    pub has_audio: bool,
    /// Audio codec name
    pub audio_codec: Option<String>,
    /// Audio sample rate
    pub audio_sample_rate: Option<u32>,
    /// Audio channels
    pub audio_channels: Option<u32>,
    /// Audio bitrate (bps)
    pub audio_bitrate: Option<u64>,
    /// Has subtitle streams
    pub has_subtitles: bool,
    /// Subtitle stream info
    pub subtitle_streams: Vec<SubtitleStream>,
    /// Container-level metadata tags (title, artist, album, etc.)
    pub metadata: HashMap<String, String>,
    /// Embedded cover art
    pub cover_art: Option<CoverArt>,
}

impl Default for MediaInfo {
    fn default() -> Self {
        Self {
            duration: 0.0,
            width: 0,
            height: 0,
            fps: 0.0,
            codec: "unknown".to_string(),
            format: "unknown".to_string(),
            bitrate: None,
            has_audio: false,
            audio_codec: None,
            audio_sample_rate: None,
            audio_channels: None,
            audio_bitrate: None,
            has_subtitles: false,
            subtitle_streams: Vec::new(),
            metadata: HashMap::new(),
            cover_art: None,
        }
    }
}

/// Probe media file and extract metadata
///
/// # Arguments
/// * `path` - Path to the media file
///
/// # Returns
/// * `MediaInfo` containing all extracted metadata
pub fn probe_media_info<P: AsRef<Path>>(path: P) -> Result<MediaInfo> {
    init_ffmpeg();

    let path = path.as_ref();
    if !path.exists() {
        return Err(Error::FileNotFound(path.display().to_string()));
    }

    let input = ffmpeg::format::input(&path)
        .map_err(|e| Error::Ffmpeg(format!("Failed to open file: {}", e)))?;

    let mut info = MediaInfo {
        format: input.format().name().to_string(),
        ..Default::default()
    };

    // Container-level duration (AVFormatContext): can be wrong for improperly
    // finalized recordings, MPEG-TS live captures, or files with edit lists.
    let container_duration = if input.duration() > 0 {
        input.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
    } else {
        0.0
    };
    info.duration = container_duration;

    // Find video stream
    if let Some(stream) = input.streams().best(ffmpeg::media::Type::Video) {
        let codec_params = stream.parameters();

        // Get codec name
        let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };
        if let Some(codec) = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id)) {
            info.codec = codec.name().to_string();
        }

        // Get video dimensions
        info.width = unsafe { (*codec_params.as_ptr()).width as u32 };
        info.height = unsafe { (*codec_params.as_ptr()).height as u32 };

        // Get frame rate
        let frame_rate = stream.avg_frame_rate();
        if frame_rate.denominator() != 0 {
            info.fps = frame_rate.numerator() as f64 / frame_rate.denominator() as f64;
        }

        // Get bitrate
        let bit_rate = unsafe { (*codec_params.as_ptr()).bit_rate };
        if bit_rate > 0 {
            info.bitrate = Some(bit_rate as u64);
        }

        // Prefer stream-level duration (from trak/mdhd in MP4, more reliable than
        // container duration which can be wrong for live recordings / edit lists).
        if stream.duration() > 0 {
            let tb = stream.time_base();
            let stream_duration =
                stream.duration() as f64 * tb.numerator() as f64 / tb.denominator() as f64;
            if stream_duration > 0.0 {
                info.duration = stream_duration;
            }
        }
    }

    // Find audio stream
    if let Some(stream) = input.streams().best(ffmpeg::media::Type::Audio) {
        info.has_audio = true;
        let codec_params = stream.parameters();

        // Get audio codec name
        let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };
        if let Some(codec) = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id)) {
            info.audio_codec = Some(codec.name().to_string());
        }

        // Get audio parameters
        unsafe {
            let params = codec_params.as_ptr();
            info.audio_sample_rate = Some((*params).sample_rate as u32);

            // Get channel count from ch_layout
            let ch_layout = &(*params).ch_layout;
            info.audio_channels = Some(ch_layout.nb_channels as u32);

            let bit_rate = (*params).bit_rate;
            if bit_rate > 0 {
                info.audio_bitrate = Some(bit_rate as u64);
            }
        }
    }

    // Find subtitle streams
    for stream in input.streams() {
        if stream.parameters().medium() == ffmpeg::media::Type::Subtitle {
            let codec_params = stream.parameters();
            let codec_id = unsafe { (*codec_params.as_ptr()).codec_id };

            let codec_name = ffmpeg::codec::decoder::find(ffmpeg::codec::Id::from(codec_id))
                .map(|c| c.name().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            // Get metadata
            let metadata = stream.metadata();
            let language = metadata.get("language").map(|s| s.to_string());
            let title = metadata.get("title").map(|s| s.to_string());

            // Check disposition flags
            let disposition = stream.disposition();
            let is_default = disposition.contains(ffmpeg::format::stream::Disposition::DEFAULT);
            let is_forced = disposition.contains(ffmpeg::format::stream::Disposition::FORCED);

            info.subtitle_streams.push(SubtitleStream {
                index: stream.index(),
                codec: codec_name,
                language,
                title,
                is_default,
                is_forced,
            });
        }
    }

    info.has_subtitles = !info.subtitle_streams.is_empty();

    // Extract container-level metadata tags
    // FFmpeg normalizes ID3v2/Vorbis/APE/WMA tags to common keys:
    // title, artist, album, genre, date, track, composer, album_artist, comment
    for (key, value) in input.metadata().iter() {
        info.metadata.insert(key.to_lowercase(), value.to_string());
    }

    // Also check audio stream metadata (some formats store tags at stream level)
    if let Some(stream) = input.streams().best(ffmpeg::media::Type::Audio) {
        for (key, value) in stream.metadata().iter() {
            let k = key.to_lowercase();
            // Don't overwrite container-level tags
            info.metadata.entry(k).or_insert_with(|| value.to_string());
        }
    }

    // Extract embedded cover art (ATTACHED_PIC disposition)
    for stream in input.streams() {
        let disposition = stream.disposition();
        if disposition.contains(ffmpeg::format::stream::Disposition::ATTACHED_PIC) {
            // The attached_pic is stored directly on the AVStream struct
            unsafe {
                let av_stream = stream.as_ptr();
                let pkt = &(*av_stream).attached_pic;
                if !pkt.data.is_null() && pkt.size > 0 {
                    let data = std::slice::from_raw_parts(pkt.data, pkt.size as usize).to_vec();

                    // Detect MIME type from magic bytes
                    let mime_type = if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
                        "image/jpeg"
                    } else if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                        "image/png"
                    } else if data.starts_with(b"RIFF")
                        && data.len() > 12
                        && &data[8..12] == b"WEBP"
                    {
                        "image/webp"
                    } else {
                        "image/jpeg" // fallback
                    };

                    info.cover_art = Some(CoverArt {
                        mime_type: mime_type.to_string(),
                        data,
                    });
                    break; // Use first cover art found
                }
            }
        }
    }

    Ok(info)
}

// =============================================================================
// ProbeCache — Thread-safe cache for probe results
// =============================================================================

/// Maximum number of cached probe entries
const DEFAULT_PROBE_CACHE_MAX: usize = 256;

struct ProbeCacheEntry {
    info: MediaInfo,
    mtime: SystemTime,
    file_size: u64,
    last_used: Instant,
}

/// Thread-safe probe result cache.
///
/// Caches `MediaInfo` keyed by canonical file path. Validates cache entries
/// by checking file mtime + size — if either changed, re-probes from disk.
/// Uses simple LRU eviction when capacity is reached.
pub struct ProbeCache {
    cache: RwLock<HashMap<PathBuf, ProbeCacheEntry>>,
    max_entries: usize,
}

impl ProbeCache {
    /// Create a new probe cache with the given capacity
    pub fn new(max_entries: usize) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            max_entries,
        }
    }

    /// Probe with caching: returns cached result if file unchanged, otherwise re-probes.
    pub fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

        // Read file metadata for validation
        let file_meta =
            std::fs::metadata(path).map_err(|_| Error::FileNotFound(path.display().to_string()))?;
        let mtime = file_meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let file_size = file_meta.len();

        // Fast path: check cache with read lock
        {
            let cache = self.cache.read().unwrap();
            if let Some(entry) = cache.get(&canonical) {
                if entry.mtime == mtime && entry.file_size == file_size {
                    return Ok(entry.info.clone());
                }
            }
        }

        // Cache miss or stale — probe from disk
        let info = probe_media_info(path)?;

        // Write to cache
        {
            let mut cache = self.cache.write().unwrap();

            // Evict oldest entry if at capacity
            if cache.len() >= self.max_entries && !cache.contains_key(&canonical) {
                if let Some(oldest_key) = cache
                    .iter()
                    .min_by_key(|(_, v)| v.last_used)
                    .map(|(k, _)| k.clone())
                {
                    cache.remove(&oldest_key);
                }
            }

            cache.insert(
                canonical,
                ProbeCacheEntry {
                    info: info.clone(),
                    mtime,
                    file_size,
                    last_used: Instant::now(),
                },
            );
        }

        Ok(info)
    }

    /// Invalidate cache entry for a specific path
    pub fn invalidate(&self, path: &Path) {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let mut cache = self.cache.write().unwrap();
        cache.remove(&canonical);
    }

    /// Clear all cached entries
    pub fn clear(&self) {
        let mut cache = self.cache.write().unwrap();
        cache.clear();
    }
}

static GLOBAL_PROBE_CACHE: OnceLock<ProbeCache> = OnceLock::new();

/// Get the global probe cache singleton
pub fn global_probe_cache() -> &'static ProbeCache {
    GLOBAL_PROBE_CACHE.get_or_init(|| ProbeCache::new(DEFAULT_PROBE_CACHE_MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_info_default() {
        let info = MediaInfo::default();
        assert_eq!(info.duration, 0.0);
        assert_eq!(info.codec, "unknown");
        assert!(!info.has_audio);
    }
}
