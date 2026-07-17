//! Subtitle Extractor - Extract subtitles from media files
//!
//! Extracts embedded subtitle streams and converts them to a common format.

use crate::error::{MediaError as Error, Result};
use ffmpeg_next as ffmpeg;
use std::path::Path;
use std::sync::Once;

static FFMPEG_INIT: Once = Once::new();

fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}

/// Subtitle cue data
#[derive(Debug, Clone)]
pub struct SubtitleCue {
    /// Unique identifier
    pub id: String,
    /// Start time in seconds
    pub start_time: f64,
    /// End time in seconds
    pub end_time: f64,
    /// Subtitle text
    pub text: String,
}

/// Extracted subtitle track
#[derive(Debug, Clone)]
pub struct ExtractedSubtitleTrack {
    /// Stream index
    pub stream_index: usize,
    /// Language code
    pub language: Option<String>,
    /// Track title
    pub title: Option<String>,
    /// Is default track
    pub is_default: bool,
    /// Subtitle cues
    pub cues: Vec<SubtitleCue>,
}

/// Extract all subtitle tracks from a media file
///
/// # Arguments
/// * `path` - Path to the media file
///
/// # Returns
/// * Vector of extracted subtitle tracks
pub fn extract_subtitles<P: AsRef<Path>>(path: P) -> Result<Vec<ExtractedSubtitleTrack>> {
    init_ffmpeg();

    let path = path.as_ref();
    if !path.exists() {
        return Err(Error::FileNotFound(path.display().to_string()));
    }

    let mut input = ffmpeg::format::input(&path)
        .map_err(|e| Error::Ffmpeg(format!("Failed to open file: {}", e)))?;

    let mut tracks = Vec::new();

    // Find all subtitle streams
    let subtitle_streams: Vec<_> = input
        .streams()
        .filter(|s| s.parameters().medium() == ffmpeg::media::Type::Subtitle)
        .map(|s| {
            let metadata = s.metadata();
            let language = metadata.get("language").map(|s| s.to_string());
            let title = metadata.get("title").map(|s| s.to_string());
            let disposition = s.disposition();
            let is_default = disposition.contains(ffmpeg::format::stream::Disposition::DEFAULT);

            (s.index(), language, title, is_default)
        })
        .collect();

    // Extract each subtitle stream
    for (stream_index, language, title, is_default) in subtitle_streams {
        let stream = input.stream(stream_index).unwrap();

        // Create decoder for this stream
        let context = match ffmpeg::codec::context::Context::from_parameters(stream.parameters()) {
            Ok(ctx) => ctx,
            Err(_) => continue,
        };

        let mut decoder = match context.decoder().subtitle() {
            Ok(dec) => dec,
            Err(_) => continue,
        };

        let time_base = stream.time_base();
        let time_base_f64 = time_base.numerator() as f64 / time_base.denominator() as f64;

        let mut cues = Vec::new();
        let mut cue_index = 0;

        // Read packets and decode subtitles
        for (stream, packet) in input.packets() {
            if stream.index() != stream_index {
                continue;
            }

            let mut subtitle = ffmpeg::subtitle::Subtitle::new();

            match decoder.decode(&packet, &mut subtitle) {
                Ok(true) => {
                    // Calculate timing
                    let pts = packet.pts().unwrap_or(0);
                    let start_time = pts as f64 * time_base_f64;
                    let duration = packet.duration() as f64 * time_base_f64;
                    let end_time = start_time + duration;

                    // Extract text from subtitle rects
                    let mut text = String::new();
                    for rect in subtitle.rects() {
                        match rect {
                            ffmpeg::subtitle::Rect::Text(t) => {
                                if !text.is_empty() {
                                    text.push('\n');
                                }
                                text.push_str(t.get());
                            }
                            ffmpeg::subtitle::Rect::Ass(a) => {
                                // Parse ASS format and extract text
                                let ass_text = a.get();
                                let parsed = parse_ass_text(ass_text);
                                if !text.is_empty() {
                                    text.push('\n');
                                }
                                text.push_str(&parsed);
                            }
                            _ => {}
                        }
                    }

                    if !text.is_empty() {
                        cues.push(SubtitleCue {
                            id: format!("cue_{}", cue_index),
                            start_time,
                            end_time,
                            text,
                        });
                        cue_index += 1;
                    }
                }
                Ok(false) => {}
                Err(_) => continue,
            }
        }

        tracks.push(ExtractedSubtitleTrack {
            stream_index,
            language,
            title,
            is_default,
            cues,
        });

        // Reset input for next stream
        input = ffmpeg::format::input(&path)
            .map_err(|e| Error::Ffmpeg(format!("Failed to reopen file: {}", e)))?;
    }

    Ok(tracks)
}

/// Parse ASS subtitle text and extract plain text
fn parse_ass_text(ass_text: &str) -> String {
    // ASS format: Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    // We want to extract the Text part and remove formatting tags

    // Find the text part (after the 9th comma)
    let parts: Vec<&str> = ass_text.splitn(10, ',').collect();
    let text = if parts.len() >= 10 {
        parts[9]
    } else {
        ass_text
    };

    // Remove ASS formatting tags like {\b1}, {\i1}, {\pos(x,y)}, etc.
    let mut result = String::new();
    let mut in_tag = false;

    for c in text.chars() {
        match c {
            '{' => in_tag = true,
            '}' => in_tag = false,
            '\\' if !in_tag => {
                // Handle \N (newline) and \n (soft newline)
                continue;
            }
            'N' | 'n' if !in_tag && result.ends_with('\\') => {
                result.pop(); // Remove the backslash
                result.push('\n');
            }
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ass_text() {
        let ass = "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello World";
        let result = parse_ass_text(ass);
        assert_eq!(result, "Hello World");
    }

    #[test]
    fn test_parse_ass_text_with_tags() {
        let ass = "Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}Bold{\\b0} text";
        let result = parse_ass_text(ass);
        assert_eq!(result, "Bold text");
    }
}
