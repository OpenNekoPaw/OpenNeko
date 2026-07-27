## Validation

Date: 2026-07-27

### Root cause

The previous Node media path treated VideoToolbox as a platform-neutral hardware
backend. Ubuntu CI therefore reached macOS-only FFmpeg arguments while running
portable Cut adapter tests. The replacement selects one complete target-owned
decode, filter, and encode strategy:

- `darwin-arm64`: VideoToolbox, `scale_vt`, and `h264_videotoolbox`.
- `linux-x64`: VAAPI, `tonemap_vaapi`/`scale_vaapi`, and `h264_vaapi`.
- unsupported hosts, including the current Windows boundary: fail visibly
  without a CPU or another hardware-backend fallback.

Windows is not in `OPENNEKO_PLATFORM_TARGETS`. Adding it requires a separately
qualified QSV, AMF, NVENC, or other device-compatible closure; D3D11VA decode
alone is not accepted as a complete backend.

### Focused tests

- `pnpm --filter @neko/media exec vitest run`: 7 files, 51 tests passed.
- `pnpm --dir packages/neko-cut exec vitest run
packages/extension/src/services/NodeFfmpegCutMediaAdapter.test.ts`: 19 tests
  passed.
- `pnpm --dir packages/neko-preview exec vitest run`: 14 tests passed.
- `node --test scripts/test-orchestration/media-runtime-closure.test.mjs
scripts/test-orchestration/native-build-dependencies.test.mjs`: 11 tests
  passed.

The command-planning tests assert the exact VideoToolbox and VAAPI paths and
poison `libx264`, CPU scale, CPU tone mapping, and hidden backend retries.
Portable cache and corruption tests inject their intended backend instead of
depending on the test runner platform.

### Linux runtime build

FFmpeg 8.1.2 was built inside an amd64 Linux container using the repository
build script and the pinned source checksum. Runtime qualification confirmed:

- hardware accelerators: `vaapi`, `drm`;
- encoder: `h264_vaapi`;
- filters: `scale_vaapi`, `tonemap_vaapi`;
- descriptor schema: `openneko.media-runtime.v2`;
- dynamic runtime libraries: `libva.so.2`, `libva-drm.so.2`, `libdrm.so.2`,
  `libm.so.6`, and `libc.so.6`.

The installed FFmpeg filter help also confirmed the used FFmpeg 8.1.2 options:

- `scale_vaapi`: `format`, `out_color_matrix`, `out_color_primaries`,
  `out_color_transfer`, and `out_range`;
- `tonemap_vaapi`: `format`, `matrix`, `primaries`, and `transfer`.

This proves the Linux build and descriptor closure. A real VAAPI operation was
not run because the container host exposes no qualified Linux GPU device or
driver. Device execution remains the explicit platform smoke-test risk.

### Repository gates

- `CI=1 pnpm test`: 28 of 28 Turbo tasks passed.
- `CI=1 pnpm ci:local`: passed, including format, lint, build, all 28 repository
  test tasks, unused/dependency checks, repository quality, 92 orchestration
  tests, 68 strict OpenSpec items, and local VS Code configuration tests.
- `pnpm build`: 8 build tasks passed.
- `pnpm check`: passed with no dependency violations.
- `pnpm check:legacy-debt`: passed.
- `pnpm check:quality`: passed.
- `pnpm exec openspec validate support-platform-hardware-video-backends
--strict`: passed.
- `git diff --check`: passed before the validation record update and is rerun
  before commit.

### Remote CI

PR #12 at `8be49b259bbbc9ba4e2da9e7ed19d6904b95621b` failed in TypeScript Tests
because Ubuntu could not spawn the macOS-only VideoToolbox path. The platform
strategy and Linux build closure were pushed through
`a17e59c4353e56567f2128d50e4233579035bf2e`.

GitHub Actions run `30278225006` passed all 11 required checks:

- TypeScript Tests passed in 6 minutes 3 seconds.
- `darwin-arm64` VSIX packaging passed in 6 minutes 27 seconds.
- `linux-x64` VSIX packaging built and qualified the VAAPI runtime, then passed
  in 7 minutes 37 seconds.
- Build & Lint, Code Quality, OpenSpec Validation, Dependency Review, both
  Local Metadata Runtime jobs, promotion validation, and the final Merge Gate
  passed.

Manual Gate was skipped as expected for a pull request event. No required check
failed or was skipped.

### Release test dependency regression

Release run
[`30279883704`](https://github.com/OpenNekoPaw/OpenNeko/actions/runs/30279883704)
failed in `Release Tests` because that job invoked `pnpm test` without first
installing FFmpeg. The Cut adapter integration suite generates real media
fixtures in `beforeAll`, so the missing workflow dependency surfaced as
`spawn ffmpeg ENOENT`. Pull-request CI already installed FFmpeg from
`scripts/act/media-runtime-packages.txt`; the Release workflow had drifted from
that shared dependency contract.

The failure was reproduced locally with an isolated `PATH` that omitted FFmpeg.
The suite failed before its 19 integration tests with the same
`spawn ffmpeg ENOENT` error. The fix keeps the real integration coverage and
adds the shared dependency installation to `release-tests`; it does not skip,
mock, or silently downgrade the media path.

Regression evidence:

- Before the workflow fix,
  `node --test scripts/test-orchestration/native-build-dependencies.test.mjs`
  failed because `release-tests` had no media dependency installation step.
- After the fix,
  `node --test scripts/test-orchestration/native-build-dependencies.test.mjs
scripts/test-orchestration/release-source.test.mjs` passed all 10 tests.
- `CI=1 pnpm ci:local` passed the complete local gate, including all 28
  repository test tasks and the workflow dependency contract.

A new remote Release verification requires the workflow fix to be merged and a
new validated tag to be created. Re-running `v0.0.5` would execute its original
tagged workflow source and cannot validate this change.
