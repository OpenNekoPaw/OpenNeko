## Verification Summary

Risk classification: L4 release/install packaging.

The deterministic packaging boundary is covered locally. Real Linux ELF production and final OpenNeko VSIX size remain Merge Gate evidence because the local host is macOS.

## Root-Cause Evidence

- Published `OpenNeko-linux-x64-0.0.2.vsix` contains unversioned, major-version, and fully versioned FFmpeg names as equal-size regular files. The duplicate aliases add approximately 362 MB after extraction.
- The published Linux N-API binary requests FFmpeg 6 names such as `libavcodec.so.60`, while the packaged BtbN runtime exposes FFmpeg 8 names such as `libavcodec.so.62`.
- The published macOS N-API binary requests `libavdevice.62.dylib`, but `avdevice` was absent from the shared runtime-closure configuration and the VSIX.

## Passing Local Checks

- `node --test packages/neko-engine/scripts/bundle-ffmpeg.test.js`: 7 passed; covers real symlink materialization, missing/ambiguous aliases, SONAME mismatch, native dependency mismatch, omitted archive libraries, and transitive dependency mismatch.
- `pnpm --dir packages/neko-engine run test:scripts`: 34 passed plus Rust Media Engine dependency closure validation.
- `pnpm check:test-orchestration`: 66 passed plus test-ownership and coverage-owner audits.
- `openspec validate deduplicate-linux-ffmpeg-runtime-closure --strict`: passed.
- Focused Prettier check, `node --check packages/neko-engine/scripts/bundle-ffmpeg.js`, and `git diff --check`: passed.

## Repository Gate

`pnpm ci:local` was run and stopped in `format:check` on 21 unrelated files already modified elsewhere in the worktree. The reported files are outside this change; no unrelated formatting was rewritten.

## Required Merge Gate Evidence

Before the next release tag, the Linux matrix job must prove all of the following on the produced artifact:

- `host-napi` is compiled with `FFMPEG_DIR` pointing to the configured workspace SDK, sourced from the checksum-verified BtbN development artifact on Linux.
- The N-API binary and all bundled FFmpeg libraries request only FFmpeg SONAMEs present in the package.
- The Engine payload contains exactly seven FFmpeg runtime entities, including `avdevice`, with no unversioned or fully versioned duplicate aliases.
- The composed Linux OpenNeko VSIX installs and activates on a supported Linux VS Code host, and its compressed size reflects removal of the duplicate closure.

## Separate Release Blocker

The installed macOS `0.0.2` artifact contains the native Engine and FFmpeg binaries, but `dist/features/neko-engine/dist/extension.js` loads `@neko-engine/host-napi` as a bare package while the composed VSIX stores it at `packages/host-napi/` without a resolvable `node_modules` package path. This independent native module routing defect must be fixed and verified in an Extension Development Host before another release.
