//! Timeline Diff - Structural and optional content comparison of two .nkv project files
//!
//! Parses two JVI project files and produces a structural diff covering:
//! - Project metadata (name, resolution, fps)
//! - Track-level changes (added/removed/modified)
//! - Element-level changes with property comparison
//!
//! When `include_content_diff` is enabled, elements with changed media sources
//! are additionally compared at the content level (pixel/waveform/frame SSIM).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::audio_diff::{diff_audio_content, AudioContentDiff};
use crate::error::{MediaError as Error, Result};
use crate::image_diff::{diff_image_content, ImageContentDiff};
use crate::jvi::{JviElement, JviTrack, ProjectData};
use crate::video_diff::{diff_video_content, VideoContentDiff, VideoDiffOptions};

// =============================================================================
// Types (aligned with diff.proto / EngineTimelineContentDiff)
// =============================================================================

/// Change type for timeline structural diff
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimelineChangeType {
    Added,
    Removed,
    Modified,
    Moved,
    Unchanged,
}

/// A single property change
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyChange {
    pub property: String,
    pub previous: serde_json::Value,
    pub current: serde_json::Value,
}

/// Element-level change
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementChange {
    pub element_id: String,
    pub element_name: String,
    pub element_type: String,
    pub change_type: TimelineChangeType,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub property_changes: Vec<PropertyChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

/// Track-level change
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackChange {
    pub track_id: String,
    pub track_name: String,
    pub track_type: String,
    pub change_type: TimelineChangeType,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub property_changes: Vec<PropertyChange>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub element_changes: Vec<ElementChange>,
}

/// Summary statistics
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDiffSummary {
    pub tracks_added: u32,
    pub tracks_removed: u32,
    pub tracks_modified: u32,
    pub elements_added: u32,
    pub elements_removed: u32,
    pub elements_modified: u32,
    pub media_source_changes: u32,
}

/// Project metadata snapshot
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineProjectMeta {
    pub name: String,
    pub resolution_width: u32,
    pub resolution_height: u32,
    pub fps: f64,
}

/// Options for timeline diff
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDiffOptions {
    /// When true, run content-level diff (SSIM/PSNR/waveform) on elements
    /// whose media source changed. Default: false (structural diff only).
    #[serde(default)]
    pub include_content_diff: bool,

    /// Base directory for resolving relative media paths in the JVI file.
    /// If None, paths are resolved relative to the JVI file's parent directory.
    #[serde(default)]
    pub base_dir: Option<String>,
}

/// Content diff result for a single element whose media source changed
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementContentDiff {
    /// Element ID this diff belongs to
    pub element_id: String,
    /// Element type (media / audio)
    pub element_type: String,
    /// Current media source path
    pub current_src: String,
    /// Previous media source path
    pub previous_src: String,
    /// Content diff result (tagged enum)
    #[serde(flatten)]
    pub content: ElementContentDiffResult,
}

/// Tagged content diff result per media type
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "contentType")]
pub enum ElementContentDiffResult {
    /// Image pixel-level comparison
    Image { diff: ImageContentDiff },
    /// Audio waveform comparison
    Audio { diff: AudioContentDiff },
    /// Video frame-level comparison
    Video { diff: VideoContentDiff },
    /// Content diff failed or source files not found
    Error { message: String },
}

/// Timeline content diff result (aligned with EngineTimelineContentDiff)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineContentDiff {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_project: Option<TimelineProjectMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_project: Option<TimelineProjectMeta>,
    pub track_changes: Vec<TrackChange>,
    pub summary: TimelineDiffSummary,
    pub duration_current: f64,
    pub duration_previous: f64,
    /// Per-element content diffs (only populated when include_content_diff=true)
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub element_content_diffs: Vec<ElementContentDiff>,
}

// =============================================================================
// Public API
// =============================================================================

/// Compare two .nkv project files and produce a structural diff (no content diff).
pub fn diff_timeline_content<P: AsRef<Path>>(
    source_a: P,
    source_b: P,
) -> Result<TimelineContentDiff> {
    diff_timeline_content_with_options(source_a, source_b, &TimelineDiffOptions::default())
}

/// Compare two .nkv project files with configurable options.
///
/// When `options.include_content_diff` is true, elements whose media source
/// changed will be compared at the content level (SSIM/PSNR/waveform).
pub fn diff_timeline_content_with_options<P: AsRef<Path>>(
    source_a: P,
    source_b: P,
    options: &TimelineDiffOptions,
) -> Result<TimelineContentDiff> {
    let path_a = source_a.as_ref();
    let path_b = source_b.as_ref();

    let text_a = std::fs::read_to_string(path_a)?;
    let text_b = std::fs::read_to_string(path_b)?;

    let project_a: ProjectData = serde_json::from_str(&text_a)
        .map_err(|e| Error::Other(format!("Invalid JVI {}: {}", path_a.display(), e)))?;
    let project_b: ProjectData = serde_json::from_str(&text_b)
        .map_err(|e| Error::Other(format!("Invalid JVI {}: {}", path_b.display(), e)))?;

    let track_changes = diff_tracks(&project_a.tracks, &project_b.tracks);
    let summary = build_summary(&track_changes);

    // Optionally run content-level diffs on elements with changed media sources
    let element_content_diffs = if options.include_content_diff {
        let base_dir = options
            .base_dir
            .as_deref()
            .map(Path::new)
            .or_else(|| path_a.parent());
        run_element_content_diffs(&track_changes, base_dir)
    } else {
        Vec::new()
    };

    Ok(TimelineContentDiff {
        current_project: Some(TimelineProjectMeta {
            name: project_a.name.clone(),
            resolution_width: project_a.resolution.width,
            resolution_height: project_a.resolution.height,
            fps: project_a.fps,
        }),
        previous_project: Some(TimelineProjectMeta {
            name: project_b.name.clone(),
            resolution_width: project_b.resolution.width,
            resolution_height: project_b.resolution.height,
            fps: project_b.fps,
        }),
        track_changes,
        summary,
        duration_current: calc_duration(&project_a.tracks),
        duration_previous: calc_duration(&project_b.tracks),
        element_content_diffs,
    })
}

// =============================================================================
// Element Content Diff (Stage 2: on-demand content comparison)
// =============================================================================

/// Run content-level diffs on elements whose media source changed.
fn run_element_content_diffs(
    track_changes: &[TrackChange],
    base_dir: Option<&Path>,
) -> Vec<ElementContentDiff> {
    let mut results = Vec::new();

    for tc in track_changes {
        for ec in &tc.element_changes {
            let (curr_src, prev_src) = match (&ec.src, &ec.previous_src) {
                (Some(curr), Some(prev)) => (curr.clone(), prev.clone()),
                _ => continue,
            };

            // Resolve paths relative to base_dir
            let curr_path = resolve_media_path(&curr_src, base_dir);
            let prev_path = resolve_media_path(&prev_src, base_dir);

            let content = if !curr_path.exists() || !prev_path.exists() {
                let missing = if !curr_path.exists() {
                    curr_path.display().to_string()
                } else {
                    prev_path.display().to_string()
                };
                ElementContentDiffResult::Error {
                    message: format!("Source file not found: {}", missing),
                }
            } else {
                run_single_content_diff(&ec.element_type, &curr_path, &prev_path)
            };

            results.push(ElementContentDiff {
                element_id: ec.element_id.clone(),
                element_type: ec.element_type.clone(),
                current_src: curr_src,
                previous_src: prev_src,
                content,
            });
        }
    }

    results
}

/// Run content diff for a single element based on its type.
fn run_single_content_diff(
    element_type: &str,
    curr_path: &Path,
    prev_path: &Path,
) -> ElementContentDiffResult {
    match element_type {
        "audio" => {
            let sa = curr_path.to_string_lossy();
            let sb = prev_path.to_string_lossy();
            match diff_audio_content(&sa, &sb) {
                Ok(diff) => ElementContentDiffResult::Audio { diff },
                Err(e) => ElementContentDiffResult::Error {
                    message: format!("Audio diff failed: {}", e),
                },
            }
        }
        "media" => {
            // Determine if image or video by extension
            let ext = curr_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tiff"
            ) {
                match diff_image_content(curr_path, prev_path) {
                    Ok(diff) => ElementContentDiffResult::Image { diff },
                    Err(e) => ElementContentDiffResult::Error {
                        message: format!("Image diff failed: {}", e),
                    },
                }
            } else {
                match diff_video_content(curr_path, prev_path, &VideoDiffOptions::default()) {
                    Ok(diff) => ElementContentDiffResult::Video { diff },
                    Err(e) => ElementContentDiffResult::Error {
                        message: format!("Video diff failed: {}", e),
                    },
                }
            }
        }
        _ => ElementContentDiffResult::Error {
            message: format!(
                "Unsupported element type for content diff: {}",
                element_type
            ),
        },
    }
}

/// Resolve a media path relative to a base directory.
fn resolve_media_path(src: &str, base_dir: Option<&Path>) -> std::path::PathBuf {
    let path = Path::new(src);
    if path.is_absolute() {
        path.to_path_buf()
    } else if let Some(base) = base_dir {
        base.join(path)
    } else {
        path.to_path_buf()
    }
}

// =============================================================================
// Track Diff
// =============================================================================

fn diff_tracks(current: &[JviTrack], previous: &[JviTrack]) -> Vec<TrackChange> {
    let mut changes = Vec::new();
    let current_map: HashMap<&str, &JviTrack> =
        current.iter().map(|t| (t.id.as_str(), t)).collect();
    let previous_map: HashMap<&str, &JviTrack> =
        previous.iter().map(|t| (t.id.as_str(), t)).collect();

    // Removed tracks
    for prev in previous {
        if !current_map.contains_key(prev.id.as_str()) {
            changes.push(TrackChange {
                track_id: prev.id.clone(),
                track_name: prev.name.clone(),
                track_type: prev.track_type.clone(),
                change_type: TimelineChangeType::Removed,
                property_changes: Vec::new(),
                element_changes: elements_as_changes(&prev.elements, TimelineChangeType::Removed),
            });
        }
    }

    // Added or modified tracks
    for curr in current {
        match previous_map.get(curr.id.as_str()) {
            None => {
                changes.push(TrackChange {
                    track_id: curr.id.clone(),
                    track_name: curr.name.clone(),
                    track_type: curr.track_type.clone(),
                    change_type: TimelineChangeType::Added,
                    property_changes: Vec::new(),
                    element_changes: elements_as_changes(&curr.elements, TimelineChangeType::Added),
                });
            }
            Some(prev) => {
                let prop_changes = diff_track_props(curr, prev);
                let elem_changes = diff_elements(&curr.elements, &prev.elements);

                if !prop_changes.is_empty() || !elem_changes.is_empty() {
                    changes.push(TrackChange {
                        track_id: curr.id.clone(),
                        track_name: curr.name.clone(),
                        track_type: curr.track_type.clone(),
                        change_type: TimelineChangeType::Modified,
                        property_changes: prop_changes,
                        element_changes: elem_changes,
                    });
                }
            }
        }
    }

    changes
}

fn diff_track_props(current: &JviTrack, previous: &JviTrack) -> Vec<PropertyChange> {
    let mut changes = Vec::new();

    if current.name != previous.name {
        changes.push(PropertyChange {
            property: "name".to_string(),
            previous: previous.name.clone().into(),
            current: current.name.clone().into(),
        });
    }
    if current.track_type != previous.track_type {
        changes.push(PropertyChange {
            property: "type".to_string(),
            previous: previous.track_type.clone().into(),
            current: current.track_type.clone().into(),
        });
    }
    if current.muted != previous.muted {
        changes.push(PropertyChange {
            property: "muted".to_string(),
            previous: previous.muted.into(),
            current: current.muted.into(),
        });
    }
    if current.locked != previous.locked {
        changes.push(PropertyChange {
            property: "locked".to_string(),
            previous: previous.locked.into(),
            current: current.locked.into(),
        });
    }
    if current.hidden != previous.hidden {
        changes.push(PropertyChange {
            property: "hidden".to_string(),
            previous: previous.hidden.into(),
            current: current.hidden.into(),
        });
    }

    changes
}

// =============================================================================
// Element Diff
// =============================================================================

fn diff_elements(current: &[JviElement], previous: &[JviElement]) -> Vec<ElementChange> {
    let mut changes = Vec::new();
    let current_map: HashMap<&str, &JviElement> =
        current.iter().map(|e| (element_id(e), e)).collect();
    let previous_map: HashMap<&str, &JviElement> =
        previous.iter().map(|e| (element_id(e), e)).collect();

    // Removed
    for prev in previous {
        if !current_map.contains_key(element_id(prev)) {
            changes.push(make_element_change(
                prev,
                TimelineChangeType::Removed,
                Vec::new(),
                None,
            ));
        }
    }

    // Added or modified
    for curr in current {
        match previous_map.get(element_id(curr)) {
            None => {
                changes.push(make_element_change(
                    curr,
                    TimelineChangeType::Added,
                    Vec::new(),
                    None,
                ));
            }
            Some(prev) => {
                let prop_changes = diff_element_props(curr, prev);
                if !prop_changes.is_empty() {
                    let prev_src = element_src(prev);
                    let curr_src = element_src(curr);
                    let previous_src = if curr_src != prev_src { prev_src } else { None };
                    changes.push(make_element_change(
                        curr,
                        TimelineChangeType::Modified,
                        prop_changes,
                        previous_src,
                    ));
                }
            }
        }
    }

    changes
}

fn diff_element_props(current: &JviElement, previous: &JviElement) -> Vec<PropertyChange> {
    let mut changes = Vec::new();

    // Compare common properties via JSON serialization for simplicity
    let curr_json = serde_json::to_value(current).unwrap_or_default();
    let prev_json = serde_json::to_value(previous).unwrap_or_default();

    // Properties to compare (skip id, type, name — those are identity fields)
    let props = [
        "src",
        "duration",
        "startTime",
        "trimStart",
        "trimEnd",
        "content",
        "fontSize",
        "fontFamily",
        "color",
        "backgroundColor",
        "textAlign",
        "fontWeight",
        "fontStyle",
        "muted",
        "hidden",
        "locked",
        "opacity",
        "blendMode",
        "transform",
    ];

    if let (Some(curr_obj), Some(prev_obj)) = (curr_json.as_object(), prev_json.as_object()) {
        for prop in &props {
            let cv = curr_obj.get(*prop);
            let pv = prev_obj.get(*prop);
            if cv != pv {
                changes.push(PropertyChange {
                    property: prop.to_string(),
                    previous: pv.cloned().unwrap_or(serde_json::Value::Null),
                    current: cv.cloned().unwrap_or(serde_json::Value::Null),
                });
            }
        }
    }

    changes
}

// =============================================================================
// Helpers
// =============================================================================

fn element_id(el: &JviElement) -> &str {
    match el {
        JviElement::Media(e) => &e.id,
        JviElement::Audio(e) => &e.id,
        JviElement::Text(e) => &e.id,
        JviElement::Shape(e) => &e.id,
        JviElement::Subtitle(e) => &e.id,
    }
}

fn element_name(el: &JviElement) -> &str {
    match el {
        JviElement::Media(e) => {
            if e.name.is_empty() {
                "media"
            } else {
                &e.name
            }
        }
        JviElement::Audio(e) => {
            if e.name.is_empty() {
                "audio"
            } else {
                &e.name
            }
        }
        JviElement::Text(e) => {
            if e.name.is_empty() {
                "text"
            } else {
                &e.name
            }
        }
        JviElement::Shape(e) => {
            if e.name.is_empty() {
                "shape"
            } else {
                &e.name
            }
        }
        JviElement::Subtitle(e) => {
            if e.name.is_empty() {
                "subtitle"
            } else {
                &e.name
            }
        }
    }
}

fn element_type_str(el: &JviElement) -> &str {
    match el {
        JviElement::Media(_) => "media",
        JviElement::Audio(_) => "audio",
        JviElement::Text(_) => "text",
        JviElement::Shape(_) => "shape",
        JviElement::Subtitle(_) => "subtitle",
    }
}

fn element_src(el: &JviElement) -> Option<String> {
    match el {
        JviElement::Media(e) => Some(e.src.clone()),
        JviElement::Audio(e) => Some(e.src.clone()),
        _ => None,
    }
}

fn element_start_time(el: &JviElement) -> f64 {
    match el {
        JviElement::Media(e) => e.start_time,
        JviElement::Audio(e) => e.start_time,
        JviElement::Text(e) => e.start_time,
        JviElement::Shape(e) => e.start_time,
        JviElement::Subtitle(e) => e.start_time,
    }
}

fn element_duration(el: &JviElement) -> f64 {
    match el {
        JviElement::Media(e) => e.duration,
        JviElement::Audio(e) => e.duration,
        JviElement::Text(e) => e.duration,
        JviElement::Shape(e) => e.duration,
        JviElement::Subtitle(e) => e.duration,
    }
}

fn make_element_change(
    el: &JviElement,
    change_type: TimelineChangeType,
    property_changes: Vec<PropertyChange>,
    previous_src: Option<String>,
) -> ElementChange {
    ElementChange {
        element_id: element_id(el).to_string(),
        element_name: element_name(el).to_string(),
        element_type: element_type_str(el).to_string(),
        change_type,
        property_changes,
        src: element_src(el),
        previous_src,
        start_time: Some(element_start_time(el)),
        duration: Some(element_duration(el)),
    }
}

fn elements_as_changes(
    elements: &[JviElement],
    change_type: TimelineChangeType,
) -> Vec<ElementChange> {
    elements
        .iter()
        .map(|el| make_element_change(el, change_type, Vec::new(), None))
        .collect()
}

fn build_summary(track_changes: &[TrackChange]) -> TimelineDiffSummary {
    let mut summary = TimelineDiffSummary {
        tracks_added: 0,
        tracks_removed: 0,
        tracks_modified: 0,
        elements_added: 0,
        elements_removed: 0,
        elements_modified: 0,
        media_source_changes: 0,
    };

    for tc in track_changes {
        match tc.change_type {
            TimelineChangeType::Added => summary.tracks_added += 1,
            TimelineChangeType::Removed => summary.tracks_removed += 1,
            TimelineChangeType::Modified => summary.tracks_modified += 1,
            _ => {}
        }

        for ec in &tc.element_changes {
            match ec.change_type {
                TimelineChangeType::Added => summary.elements_added += 1,
                TimelineChangeType::Removed => summary.elements_removed += 1,
                TimelineChangeType::Modified => summary.elements_modified += 1,
                _ => {}
            }
            if ec.previous_src.is_some() {
                summary.media_source_changes += 1;
            }
        }
    }

    summary
}

fn calc_duration(tracks: &[JviTrack]) -> f64 {
    let mut max_end: f64 = 0.0;
    for track in tracks {
        for el in &track.elements {
            let end = element_start_time(el) + element_duration(el);
            if end > max_end {
                max_end = end;
            }
        }
    }
    max_end
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_project(name: &str, tracks: Vec<JviTrack>) -> ProjectData {
        ProjectData {
            version: "1.0".to_string(),
            name: name.to_string(),
            resolution: crate::jvi::Resolution {
                width: 1920,
                height: 1080,
            },
            fps: 30.0,
            tracks,
            defaults: None,
        }
    }

    #[test]
    fn test_identical_projects() {
        let project = make_test_project("test", vec![]);
        let changes = diff_tracks(&project.tracks, &project.tracks);
        assert!(changes.is_empty());
    }

    #[test]
    fn test_added_track() {
        let track = JviTrack {
            id: "t1".to_string(),
            name: "Track 1".to_string(),
            track_type: "video".to_string(),
            elements: vec![],
            muted: false,
            is_main: false,
            locked: false,
            solo: false,
            hidden: false,
        };

        let changes = diff_tracks(&[track], &[]);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, TimelineChangeType::Added);
    }

    #[test]
    fn test_removed_track() {
        let track = JviTrack {
            id: "t1".to_string(),
            name: "Track 1".to_string(),
            track_type: "video".to_string(),
            elements: vec![],
            muted: false,
            is_main: false,
            locked: false,
            solo: false,
            hidden: false,
        };

        let changes = diff_tracks(&[], &[track]);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, TimelineChangeType::Removed);
    }

    #[test]
    fn test_modified_track() {
        let prev = JviTrack {
            id: "t1".to_string(),
            name: "Track 1".to_string(),
            track_type: "video".to_string(),
            elements: vec![],
            muted: false,
            is_main: false,
            locked: false,
            solo: false,
            hidden: false,
        };
        let curr = JviTrack {
            id: "t1".to_string(),
            name: "Track 1 Renamed".to_string(),
            track_type: "video".to_string(),
            elements: vec![],
            muted: true,
            is_main: false,
            locked: false,
            solo: false,
            hidden: false,
        };

        let changes = diff_tracks(&[curr], &[prev]);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].change_type, TimelineChangeType::Modified);
        assert_eq!(changes[0].property_changes.len(), 2); // name + muted
    }

    #[test]
    fn test_summary() {
        let changes = vec![
            TrackChange {
                track_id: "t1".to_string(),
                track_name: "Added".to_string(),
                track_type: "video".to_string(),
                change_type: TimelineChangeType::Added,
                property_changes: vec![],
                element_changes: vec![ElementChange {
                    element_id: "e1".to_string(),
                    element_name: "clip".to_string(),
                    element_type: "media".to_string(),
                    change_type: TimelineChangeType::Added,
                    property_changes: vec![],
                    src: Some("test.mp4".to_string()),
                    previous_src: None,
                    start_time: Some(0.0),
                    duration: Some(5.0),
                }],
            },
            TrackChange {
                track_id: "t2".to_string(),
                track_name: "Removed".to_string(),
                track_type: "audio".to_string(),
                change_type: TimelineChangeType::Removed,
                property_changes: vec![],
                element_changes: vec![],
            },
        ];

        let summary = build_summary(&changes);
        assert_eq!(summary.tracks_added, 1);
        assert_eq!(summary.tracks_removed, 1);
        assert_eq!(summary.elements_added, 1);
    }
}
