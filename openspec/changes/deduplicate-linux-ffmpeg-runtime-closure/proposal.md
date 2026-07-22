## Why

Linux release packaging currently dereferences every FFmpeg shared-library alias and copies each alias as a complete binary. Although runtime closure materialization now retains one SONAME entity per configured library, the Engine VSIX still includes the build-only `deps/ffmpeg` SDK, where the archive aliases remain materialized as complete files. The composed OpenNeko VSIX therefore remains several times larger than the macOS artifact.

## What Changes

- Define the Linux FFmpeg runtime closure as one materialized file per required library, named by its ELF `SONAME`-compatible major-version alias.
- Reject missing or ambiguous major-version aliases instead of silently producing an incomplete or duplicated closure.
- Reject native binaries or bundled FFmpeg libraries whose FFmpeg `DT_NEEDED` names are absent from the materialized closure.
- Build release N-API binaries against the configured platform FFmpeg development source, including the verified BtbN artifact on Linux, instead of an unrelated system FFmpeg version.
- Include `avdevice` in the canonical cross-platform runtime closure because both supported N-API binaries link it directly.
- Add a deterministic packaging regression test that uses real filesystem symlinks and proves aliases are not materialized as duplicate files.
- Exclude the build-only FFmpeg SDK from the Engine VSIX and reject any `deps/` payload that reaches the final OpenNeko staging boundary.
- Preserve the existing `$ORIGIN` loader contract and platform-specific Engine VSIX ownership.

## Capabilities

### New Capabilities

- `linux-ffmpeg-runtime-closure`: Defines the canonical, deduplicated Linux FFmpeg shared-library closure and its fail-visible packaging validation.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-engine/scripts/bundle-ffmpeg.js`, Engine VSIX inclusion rules, final OpenNeko payload validation, their regression tests, and the CI/Release platform build setup.
- Reduces the Linux Engine and composed OpenNeko VSIX payload without changing N-API, Rust, Extension, Webview, or release artifact naming contracts.
- Release/install risk remains L4 because an incorrect runtime filename can prevent the packaged native Engine from loading.
