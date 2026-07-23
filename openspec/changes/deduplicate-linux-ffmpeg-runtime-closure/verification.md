## Verification Summary

Risk classification: L4 release/install packaging.

The deterministic packaging boundary and a real Linux x64 release build are covered locally. The Linux build ran in a `node:24.18.0-bookworm-slim` AMD64 container on the macOS ARM64 host, using the checksum-verified configured FFmpeg development SDK and runtime archives.

## Root-Cause Evidence

- Published `OpenNeko-linux-x64-0.0.2.vsix` contains unversioned, major-version, and fully versioned FFmpeg names as equal-size regular files. The duplicate aliases add approximately 362 MB after extraction.
- The published Linux N-API binary requests FFmpeg 6 names such as `libavcodec.so.60`, while the packaged BtbN runtime exposes FFmpeg 8 names such as `libavcodec.so.62`.
- The published macOS N-API binary requests `libavdevice.62.dylib`, but `avdevice` was absent from the shared runtime-closure configuration and the VSIX.
- Published `OpenNeko-linux-x64-0.0.3.vsix` is 298,812,117 bytes. Its Engine payload still includes the complete build-only `deps/ffmpeg` SDK, accounting for approximately 187 MiB of compressed duplicate input even though the runtime `host-napi` closure itself is canonical.

## Passing Local Checks

- `node --test packages/neko-engine/scripts/bundle-ffmpeg.test.js`: 7 passed; covers real symlink materialization, missing/ambiguous aliases, SONAME mismatch, native dependency mismatch, omitted archive libraries, and transitive dependency mismatch.
- `pnpm --dir packages/neko-engine run test:scripts`: 40 passed plus Rust Media Engine dependency closure validation.
- `pnpm check:test-orchestration`: 78 passed plus test-ownership and coverage-owner audits.
- `openspec validate deduplicate-linux-ffmpeg-runtime-closure --strict`: passed.
- Focused Prettier check, `node --check packages/neko-engine/scripts/bundle-ffmpeg.js`, and `git diff --check`: passed.

## Local Linux Artifact Evidence

- The real Linux x64 N-API release build completed with the configured FFmpeg SDK; the Engine VSIX is 81,486,820 bytes (77.71 MiB), contains 23 files, and contains no `deps/` path.
- The composed `OpenNeko-linux-x64-0.0.1.vsix` is 102,433,298 bytes (97.69 MiB), contains no `deps/` path, and contains exactly the seven required FFmpeg SONAME runtime files under `packages/host-napi`.
- Relative to the published 0.0.3 Linux artifact, the locally composed artifact is 65.72% smaller (196,378,819 bytes removed). The remaining Linux/macOS size difference is platform runtime content rather than a leaked build SDK.

## Repository Gate

`pnpm check` was run and stopped in the existing unused-code inventory (including 61 unused files and existing unused exports). The reported files are outside this change; no unrelated cleanup was performed.

## Required Merge Gate Evidence

Before the next release tag, the Linux matrix job must prove all of the following on the produced artifact:

- `host-napi` is compiled with `FFMPEG_DIR` pointing to the configured workspace SDK, sourced from the checksum-verified BtbN development artifact on Linux.
- The N-API binary and all bundled FFmpeg libraries request only FFmpeg SONAMEs present in the package.
- The Engine payload contains exactly seven FFmpeg runtime entities, including `avdevice`, with no unversioned or fully versioned duplicate aliases.
- The composed Linux OpenNeko VSIX installs and activates on a supported Linux VS Code host, and its compressed size reflects removal of the duplicate closure.

## Separate Release Blocker

The installed macOS `0.0.2` artifact contains the native Engine and FFmpeg binaries, but `dist/features/neko-engine/dist/extension.js` loads `@neko-engine/host-napi` as a bare package while the composed VSIX stores it at `packages/host-napi/` without a resolvable `node_modules` package path. This independent native module routing defect must be fixed and verified in an Extension Development Host before another release.
