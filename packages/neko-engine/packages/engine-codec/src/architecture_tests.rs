//! Architecture dependency guardrails for codec extraction.

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(root: &Path) -> Vec<PathBuf> {
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

#[test]
fn codec_manifest_does_not_depend_on_kernel_or_host_crates() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest_path = manifest_dir.join("Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "engine-gpu",
        "engine-audio",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on orchestration crate `{}`",
            manifest_path.display(),
            forbidden
        );
    }
}

#[test]
fn codec_sources_do_not_import_kernel_or_orchestration_modules() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let source_root = manifest_dir.join("src");
    let forbidden = [
        "neko_engine_kernel",
        "crate::services",
        "crate::export",
        "crate::preview",
        "crate::domain",
        "crate::gpu",
        "GpuContext",
        "GpuCompositor",
        "GpuLayer",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
    ];

    for file in rust_files(&source_root) {
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
                "{} must not contain forbidden dependency pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}
