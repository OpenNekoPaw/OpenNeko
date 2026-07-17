//! Timeline project info types for timelines:probe response

use serde::{Deserialize, Serialize};

/// Timeline project info returned by timelines:probe
///
/// Contains metadata about a .nkv project file without rendering anything.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineProjectInfo {
    /// Project name
    pub name: String,
    /// JVI format version
    pub version: String,
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Total duration in seconds (calculated from elements)
    pub duration: f64,
    /// Number of tracks
    pub track_count: usize,
    /// Total number of elements across all tracks
    pub element_count: usize,
    /// Media files referenced by the timeline
    pub media_references: Vec<MediaReference>,
}

/// A media file referenced by the timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaReference {
    /// Element ID that references this media
    pub element_id: String,
    /// Resolved file path
    pub path: String,
    /// Whether the file exists on disk
    pub exists: bool,
    /// Media type: "video", "audio", "image", "text"
    pub media_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeline_project_info_serialization() {
        let info = TimelineProjectInfo {
            name: "test".to_string(),
            version: "1.0".to_string(),
            width: 1920,
            height: 1080,
            fps: 30.0,
            duration: 10.0,
            track_count: 2,
            element_count: 5,
            media_references: vec![MediaReference {
                element_id: "elem-1".to_string(),
                path: "/path/to/video.mp4".to_string(),
                exists: true,
                media_type: "video".to_string(),
            }],
        };

        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["name"], "test");
        assert_eq!(json["trackCount"], 2);
        assert_eq!(json["elementCount"], 5);
        assert_eq!(json["mediaReferences"][0]["elementId"], "elem-1");
    }
}
