//! Runtime-media architecture dependency guardrails.

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(root: &Path) -> Vec<PathBuf> {
    if root.is_file() {
        return if root.extension().is_some_and(|ext| ext == "rs") {
            vec![root.to_path_buf()]
        } else {
            Vec::new()
        };
    }

    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(path) = pending.pop() {
        let entries = fs::read_dir(&path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", path.display(), err));
        for entry in entries {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                files.push(path);
            }
        }
    }

    files
}

fn packages_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("runtime-media has a parent packages directory")
        .to_path_buf()
}

#[test]
fn runtime_media_manifest_avoids_kernel_host_gpu_and_renderer_crates() {
    let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "neko-engine-gpu",
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
        "engine-export-renderer",
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
fn runtime_media_sources_avoid_kernel_host_gpu_renderer_orchestration_imports() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let forbidden = [
        "neko_engine_kernel",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
        "neko_engine_gpu",
        "neko_engine_scene_renderer",
        "neko_engine_puppet_renderer",
        "neko_engine_panoramic_renderer",
        "neko_engine_export_renderer",
        "crate::services",
        "crate::export",
        "crate::preview",
    ];

    for file in rust_files(&src_dir) {
        if file
            .file_name()
            .is_some_and(|name| name == "architecture_tests.rs")
        {
            continue;
        }
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must not contain forbidden runtime-media dependency pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

#[test]
fn engine_kernel_no_longer_owns_media_or_jvi_helpers() {
    let kernel_src = packages_dir().join("engine-kernel/src");
    for forbidden_dir in ["media_service", "jvi"] {
        let path = kernel_src.join(forbidden_dir);
        assert!(
            !path.exists(),
            "{} must remain in runtime-media ownership",
            path.display()
        );
    }
}
