//! Preview sidecar metadata read/write helpers.

use crate::error::Result;
use crate::image_analysis::{PanoramaCoverageAngle, PanoramaViewState, PreviewProjectionType};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAssetSidecar {
    pub projection_type: Option<PreviewProjectionType>,
    pub default_view_state: Option<PanoramaViewState>,
    pub coverage_angle: Option<PanoramaCoverageAngle>,
}

pub fn read_sidecar(path: &Path) -> Option<PreviewAssetSidecar> {
    let sidecar_path = sidecar_path(path);
    let text = fs::read_to_string(sidecar_path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_sidecar_update(
    path: &Path,
    projection_type: Option<PreviewProjectionType>,
    default_view_state: Option<PanoramaViewState>,
    coverage_angle: Option<PanoramaCoverageAngle>,
) -> Result<PreviewAssetSidecar> {
    let mut sidecar = read_sidecar(path).unwrap_or_default();
    if projection_type.is_some() {
        sidecar.projection_type = projection_type;
    }
    if default_view_state.is_some() {
        sidecar.default_view_state = default_view_state;
    }
    if let Some(coverage_angle) = coverage_angle {
        sidecar.coverage_angle = Some(coverage_angle.normalized());
    }
    let sidecar_path = sidecar_path(path);
    let body = serde_json::to_vec_pretty(&sidecar)?;
    fs::write(sidecar_path, body)?;
    Ok(sidecar)
}

pub fn sidecar_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("preview-asset");
    path.with_file_name(format!("{file_name}.nkmeta.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image_analysis::{
        default_panorama_view_state, PanoramaCoverageAngle, PreviewProjectionType,
    };
    use tempfile::tempdir;

    #[test]
    fn writes_and_reads_sidecar_update() {
        let dir = tempdir().expect("tempdir");
        let image_path = dir.path().join("preview.png");
        std::fs::write(&image_path, b"placeholder").expect("write source");

        write_sidecar_update(
            &image_path,
            Some(PreviewProjectionType::Flat),
            Some(default_panorama_view_state()),
            Some(PanoramaCoverageAngle {
                horizontal_deg: 720.0,
                vertical_deg: 65.0,
            }),
        )
        .expect("write sidecar");
        let sidecar = read_sidecar(&image_path).expect("read sidecar");

        assert_eq!(sidecar.projection_type, Some(PreviewProjectionType::Flat));
        assert_eq!(
            sidecar.default_view_state.map(|state| state.fov_deg),
            Some(75.0)
        );
        assert_eq!(
            sidecar.coverage_angle,
            Some(PanoramaCoverageAngle {
                horizontal_deg: 360.0,
                vertical_deg: 65.0,
            })
        );
    }
}
