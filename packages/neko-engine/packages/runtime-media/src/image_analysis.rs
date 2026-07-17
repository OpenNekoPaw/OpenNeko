//! CPU-only preview image analysis.
//!
//! This module owns metadata and heuristic projection detection that does not
//! require GPU resources.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;

const GPANO_METADATA_PREFIX_BYTES: usize = 256 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionType {
    Flat,
    Equirectangular,
    Cylindrical,
    Cubemap,
    Fisheye,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewProjectionConfidence {
    Explicit,
    Manual,
    TrustedFilename,
    Heuristic,
    None,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewToneMapping {
    None,
    Aces,
    Reinhard,
    Filmic,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PanoramaViewMode {
    Sphere,
    Flat,
    LittlePlanet,
    Cylindrical,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PanoramaCoverageAngle {
    pub horizontal_deg: f64,
    pub vertical_deg: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PanoramaViewState {
    pub mode: PanoramaViewMode,
    pub yaw_deg: f64,
    pub pitch_deg: f64,
    pub roll_deg: f64,
    pub fov_deg: f64,
    pub exposure: f64,
    pub tone_mapping: PreviewToneMapping,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewProjectionMetadata {
    #[serde(rename = "type")]
    pub projection_type: PreviewProjectionType,
    pub confidence: PreviewProjectionConfidence,
    pub source: String,
    pub requires_confirmation: Option<bool>,
    pub cropped_area_pixels: Option<PreviewDimensions>,
    pub full_pano_pixels: Option<PreviewDimensions>,
    pub coverage_angle: Option<PanoramaCoverageAngle>,
}

#[derive(Clone, Debug, Default)]
pub struct ProjectionInferenceInput {
    pub sidecar_projection: Option<PreviewProjectionType>,
    pub sidecar_coverage_angle: Option<PanoramaCoverageAngle>,
    pub expected_projection: Option<PreviewProjectionType>,
    pub explicit_open: bool,
}

impl PanoramaCoverageAngle {
    pub fn full() -> Self {
        Self {
            horizontal_deg: 360.0,
            vertical_deg: 180.0,
        }
    }

    pub fn normalized(self) -> Self {
        Self {
            horizontal_deg: normalize_coverage_component(self.horizontal_deg, 360.0),
            vertical_deg: normalize_coverage_component(self.vertical_deg, 180.0),
        }
    }
}

pub fn default_panorama_view_state() -> PanoramaViewState {
    PanoramaViewState {
        mode: PanoramaViewMode::Sphere,
        yaw_deg: 0.0,
        pitch_deg: 0.0,
        roll_deg: 0.0,
        fov_deg: 75.0,
        exposure: 0.0,
        tone_mapping: PreviewToneMapping::Aces,
    }
}

pub fn manual_projection_metadata(
    projection_type: PreviewProjectionType,
) -> (PreviewProjectionType, PreviewProjectionConfidence, String) {
    (
        projection_type,
        PreviewProjectionConfidence::Manual,
        "manual".to_string(),
    )
}

pub fn infer_projection(
    path: &Path,
    input: &ProjectionInferenceInput,
) -> PreviewProjectionMetadata {
    if let Some((projection_type, confidence, source)) = input
        .sidecar_projection
        .clone()
        .map(manual_projection_metadata)
    {
        return PreviewProjectionMetadata {
            projection_type,
            confidence,
            source,
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: probe_dimensions(path),
            coverage_angle: input
                .sidecar_coverage_angle
                .clone()
                .map(PanoramaCoverageAngle::normalized),
        };
    }

    if let Some(expected) = &input.expected_projection {
        return PreviewProjectionMetadata {
            projection_type: expected.clone(),
            confidence: PreviewProjectionConfidence::Explicit,
            source: "manual".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: None,
            coverage_angle: Some(PanoramaCoverageAngle::full()),
        };
    }

    let dimensions = probe_dimensions(path);
    let gpano_coverage = parse_gpano_coverage(path);
    if gpano_coverage.is_some() || contains_gpano_metadata(path) {
        return PreviewProjectionMetadata {
            projection_type: PreviewProjectionType::Equirectangular,
            confidence: PreviewProjectionConfidence::Explicit,
            source: "metadata".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: dimensions,
            coverage_angle: gpano_coverage.or_else(|| Some(PanoramaCoverageAngle::full())),
        };
    }

    let extension = normalized_extension(path);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_deref(), Some("hdr") | Some("exr"))
        || file_name.contains("_360")
        || file_name.contains("_pano")
        || file_name.contains("_equirect")
    {
        return PreviewProjectionMetadata {
            projection_type: PreviewProjectionType::Equirectangular,
            confidence: PreviewProjectionConfidence::TrustedFilename,
            source: "filename".to_string(),
            requires_confirmation: Some(false),
            cropped_area_pixels: None,
            full_pano_pixels: dimensions,
            coverage_angle: Some(PanoramaCoverageAngle::full()),
        };
    }

    if let Some(dimensions) = dimensions {
        if is_near_equirectangular_aspect(dimensions.width, dimensions.height) {
            return PreviewProjectionMetadata {
                projection_type: PreviewProjectionType::Equirectangular,
                confidence: PreviewProjectionConfidence::Heuristic,
                source: "aspect-ratio".to_string(),
                requires_confirmation: Some(!input.explicit_open),
                cropped_area_pixels: None,
                full_pano_pixels: Some(dimensions),
                coverage_angle: Some(PanoramaCoverageAngle::full()),
            };
        }
    }

    PreviewProjectionMetadata {
        projection_type: PreviewProjectionType::Flat,
        confidence: PreviewProjectionConfidence::None,
        source: "unknown".to_string(),
        requires_confirmation: Some(false),
        cropped_area_pixels: None,
        full_pano_pixels: None,
        coverage_angle: None,
    }
}

pub fn parse_gpano_coverage(path: &Path) -> Option<PanoramaCoverageAngle> {
    let text = read_gpano_prefix_text(path)?;
    if !contains_gpano_metadata_text(&text) {
        return None;
    }

    let full_width = extract_gpano_number(&text, "fullpanowidthpixels");
    let cropped_width = extract_gpano_number(&text, "croppedareaimagewidthpixels");
    let full_height = extract_gpano_number(&text, "fullpanoheightpixels");
    let cropped_height = extract_gpano_number(&text, "croppedareaimageheightpixels");

    let horizontal_deg = match (cropped_width, full_width) {
        (Some(cropped), Some(full)) if full > 0.0 => (cropped / full) * 360.0,
        _ => 360.0,
    };
    let vertical_deg = match (cropped_height, full_height) {
        (Some(cropped), Some(full)) if full > 0.0 => (cropped / full) * 180.0,
        _ => 180.0,
    };

    Some(
        PanoramaCoverageAngle {
            horizontal_deg,
            vertical_deg,
        }
        .normalized(),
    )
}

pub fn contains_gpano_metadata(path: &Path) -> bool {
    read_gpano_prefix_text(path).is_some_and(|text| contains_gpano_metadata_text(&text))
}

pub fn probe_dimensions(path: &Path) -> Option<PreviewDimensions> {
    image::image_dimensions(path)
        .ok()
        .map(|(width, height)| PreviewDimensions { width, height })
}

fn read_gpano_prefix_text(path: &Path) -> Option<String> {
    let extension = normalized_extension(path)?;
    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return None;
    }
    let Ok(file) = fs::File::open(path) else {
        return None;
    };
    let mut bytes = Vec::with_capacity(GPANO_METADATA_PREFIX_BYTES);
    if file
        .take(GPANO_METADATA_PREFIX_BYTES as u64)
        .read_to_end(&mut bytes)
        .is_err()
    {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes).to_ascii_lowercase())
}

fn contains_gpano_metadata_text(text: &str) -> bool {
    text.contains("gpano")
        && (text.contains("equirectangular")
            || text.contains("usepanoramaviewer=\"true\"")
            || text.contains("usepanoramaviewer>true")
            || text.contains("fullpanowidthpixels")
            || text.contains("croppedareaimagewidthpixels"))
}

fn extract_gpano_number(text: &str, field: &str) -> Option<f64> {
    extract_gpano_attr_number(text, field).or_else(|| extract_gpano_element_number(text, field))
}

fn extract_gpano_attr_number(text: &str, field: &str) -> Option<f64> {
    let field_index = text.find(field)?;
    let after_field = &text[field_index + field.len()..];
    let equals_index = after_field.find('=')?;
    let after_equals = after_field[equals_index + 1..].trim_start();
    let quote = after_equals.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let after_quote = &after_equals[quote.len_utf8()..];
    let end_index = after_quote.find(quote)?;
    after_quote[..end_index].trim().parse::<f64>().ok()
}

fn extract_gpano_element_number(text: &str, field: &str) -> Option<f64> {
    let field_index = text.find(field)?;
    let after_field = &text[field_index + field.len()..];
    let open_end_index = after_field.find('>')?;
    let after_open = &after_field[open_end_index + 1..];
    let close_index = after_open.find('<')?;
    after_open[..close_index].trim().parse::<f64>().ok()
}

fn is_near_equirectangular_aspect(width: u32, height: u32) -> bool {
    if height == 0 {
        return false;
    }
    let ratio = width as f64 / height as f64;
    (ratio - 2.0).abs() <= 0.02
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn normalize_coverage_component(value: f64, max: f64) -> f64 {
    if value > 0.0 && value.is_finite() {
        value.min(max)
    } else {
        max
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use tempfile::tempdir;

    #[test]
    fn detects_gpano_metadata_marker() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("ordinary.jpg");
        std::fs::write(
            &image_path,
            b"<x:xmpmeta><GPano:ProjectionType>equirectangular</GPano:ProjectionType><GPano:FullPanoWidthPixels>4000</GPano:FullPanoWidthPixels></x:xmpmeta>",
        )
        .expect("write metadata marker");

        assert!(contains_gpano_metadata(&image_path));
    }

    #[test]
    fn parses_gpano_cropped_area_coverage() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("cropped.jpg");
        std::fs::write(
            &image_path,
            br#"<x:xmpmeta><rdf:Description
              GPano:ProjectionType="equirectangular"
              GPano:FullPanoWidthPixels="4000"
              GPano:CroppedAreaImageWidthPixels="2000"
              GPano:FullPanoHeightPixels="2000"
              GPano:CroppedAreaImageHeightPixels="1000" /></x:xmpmeta>"#,
        )
        .expect("write gpano metadata");

        assert_eq!(
            parse_gpano_coverage(&image_path),
            Some(PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 90.0,
            })
        );

        let projection = infer_projection(
            &image_path,
            &ProjectionInferenceInput {
                explicit_open: false,
                ..ProjectionInferenceInput::default()
            },
        );
        assert_eq!(
            projection.coverage_angle,
            Some(PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 90.0,
            })
        );
    }

    #[test]
    fn normalizes_invalid_coverage_values() {
        assert_eq!(
            (PanoramaCoverageAngle {
                horizontal_deg: f64::NAN,
                vertical_deg: -10.0,
            })
            .normalized(),
            PanoramaCoverageAngle::full()
        );
        assert_eq!(
            (PanoramaCoverageAngle {
                horizontal_deg: 720.0,
                vertical_deg: 270.0,
            })
            .normalized(),
            PanoramaCoverageAngle::full()
        );
        assert_eq!(
            (PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 65.0,
            })
            .normalized(),
            PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 65.0,
            }
        );
    }

    #[test]
    fn infers_heuristic_projection_from_two_to_one_aspect() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("wide.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");

        let projection = infer_projection(
            &image_path,
            &ProjectionInferenceInput {
                explicit_open: false,
                ..ProjectionInferenceInput::default()
            },
        );

        assert_eq!(
            projection.projection_type,
            PreviewProjectionType::Equirectangular
        );
        assert_eq!(
            projection.confidence,
            PreviewProjectionConfidence::Heuristic
        );
        assert_eq!(projection.requires_confirmation, Some(true));
        assert_eq!(
            projection.coverage_angle,
            Some(PanoramaCoverageAngle::full())
        );
    }

    #[test]
    fn sidecar_projection_carries_manual_coverage() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("manual.png");
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(8, 4, Rgb([10, 10, 10]));
        image.save(&image_path).expect("save image");

        let projection = infer_projection(
            &image_path,
            &ProjectionInferenceInput {
                sidecar_projection: Some(PreviewProjectionType::Cylindrical),
                sidecar_coverage_angle: Some(PanoramaCoverageAngle {
                    horizontal_deg: 180.0,
                    vertical_deg: 65.0,
                }),
                explicit_open: false,
                ..ProjectionInferenceInput::default()
            },
        );

        assert_eq!(
            projection.projection_type,
            PreviewProjectionType::Cylindrical
        );
        assert_eq!(projection.confidence, PreviewProjectionConfidence::Manual);
        assert_eq!(
            projection.coverage_angle,
            Some(PanoramaCoverageAngle {
                horizontal_deg: 180.0,
                vertical_deg: 65.0,
            })
        );
    }
}
