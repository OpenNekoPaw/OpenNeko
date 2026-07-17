use std::fs;
use std::path::PathBuf;

fn engine_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .expect("engine root")
        .to_path_buf()
}

#[test]
fn workspace_contains_only_media_engine_crates() {
    let manifest =
        fs::read_to_string(engine_root().join("Cargo.toml")).expect("workspace manifest");
    for retained in [
        "engine-types",
        "engine-codec",
        "engine-audio",
        "engine-gpu",
        "runtime-media",
        "engine-kernel",
        "host-api",
        "host-http",
        "host-cli",
        "host-napi",
    ] {
        assert!(manifest.contains(&format!("packages/{retained}")));
    }
    for removed in [
        "runtime-scene",
        "runtime-puppet",
        "runtime-device",
        "runtime-ml",
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
    ] {
        assert!(!manifest.contains(&format!("packages/{removed}")));
    }
}

#[test]
fn kernel_manifest_has_no_removed_capability_dependencies() {
    let manifest = fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
        .expect("kernel manifest");
    for removed in [
        "runtime-scene",
        "runtime-puppet",
        "runtime-device",
        "runtime-ml",
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
        "bevy_ecs",
        "gltf",
        "ort",
    ] {
        assert!(
            !manifest.contains(removed),
            "found removed dependency {removed}"
        );
    }
}

#[test]
fn host_router_rejects_removed_capability_groups_by_construction() {
    let router = fs::read_to_string(engine_root().join("packages/host-api/src/router.rs"))
        .expect("host router");
    for removed in [
        "groups::MODELS",
        "groups::SCENES",
        "groups::PUPPETS",
        "groups::CAMERAS",
        "groups::MIDI",
        "groups::GAMEPAD",
        "groups::VIEWPORT",
        "groups::LIVE_COMPOSITOR",
        "groups::MODEL_PREVIEW",
    ] {
        assert!(!router.contains(removed), "found removed route {removed}");
    }
}
