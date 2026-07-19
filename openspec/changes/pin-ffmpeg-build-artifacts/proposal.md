## Why

Windows Engine packaging currently delegates FFmpeg development-library installation to the Chocolatey `ffmpeg-shared` package, whose fixed checksum protects a mutable Gyan download URL. When the upstream archive changed without a matching package update, the `win32-x64` package job failed before the repository-owned Engine build path could run.

## What Changes

- Make `neko-engine` the single owner of FFmpeg build-artifact identity for Linux and Windows: immutable BtbN release tag, exact archive filename, and SHA256.
- Verify every repository-managed BtbN archive before extraction or packaging, and fail visibly on missing or mismatched integrity metadata.
- Replace the Windows CI and release Chocolatey installation path with the existing repository-owned FFmpeg setup command.
- Add focused tests proving mutable release aliases and unverified or mismatched archives cannot enter the canonical packaging path.

## Capabilities

### New Capabilities

- `verified-ffmpeg-build-artifacts`: Defines deterministic, checksum-verified FFmpeg dependency acquisition for Engine native builds and platform packaging.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-engine/scripts/` package configuration, download/bundle helpers, and package-owned tests.
- Affects Windows entries in `.github/workflows/ci.yml` and `.github/workflows/release.yml`.
- Removes CI reliance on the external Chocolatey `ffmpeg-shared` installer without changing supported release targets or Engine runtime contracts.
