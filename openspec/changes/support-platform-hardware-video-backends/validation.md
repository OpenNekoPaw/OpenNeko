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
strategy and Linux build closure are not yet pushed. Task 4.4 remains open until
the focused commits are pushed and the replacement GitHub Actions run passes.
