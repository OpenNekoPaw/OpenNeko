//! Architecture dependency guardrails for GPU export support.

use std::fs;
use std::path::{Path, PathBuf};

fn packages_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("engine-gpu has a parent packages directory")
        .to_path_buf()
}

fn workspace_manifest() -> PathBuf {
    packages_dir()
        .parent()
        .expect("packages directory has a workspace root")
        .join("Cargo.toml")
}

#[test]
fn thin_export_renderer_crate_is_not_a_workspace_member() {
    let packages_dir = packages_dir();
    assert!(
        !packages_dir.join("engine-export-renderer").exists(),
        "thin export renderer support belongs in engine-gpu::export_support"
    );

    let manifest = fs::read_to_string(workspace_manifest())
        .unwrap_or_else(|err| panic!("failed to read workspace manifest: {}", err));
    assert!(
        !manifest.contains("\"packages/engine-export-renderer\""),
        "workspace must not list packages/engine-export-renderer"
    );
}

#[test]
fn engine_gpu_manifest_keeps_export_support_below_kernel_and_host() {
    let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "neko-engine-export-renderer",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on `{}`",
            manifest_path.display(),
            forbidden
        );
    }
}

#[test]
fn export_support_source_avoids_kernel_orchestration_modules() {
    let source_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/export_support.rs");
    let source = fs::read_to_string(&source_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", source_path.display(), err));

    for forbidden in [
        "neko_engine_kernel",
        "neko_engine_export_renderer",
        "crate::services",
        "crate::export",
        "crate::preview",
        "crate::domain",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
    ] {
        assert!(
            !source.contains(forbidden),
            "{} must not contain forbidden export support dependency pattern `{}`",
            source_path.display(),
            forbidden
        );
    }
}
