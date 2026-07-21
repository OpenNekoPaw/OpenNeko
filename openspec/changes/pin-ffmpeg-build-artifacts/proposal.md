## Why

The Engine previously delegated some FFmpeg development-library installation to external package-manager paths whose mutable upstream artifacts were not owned by the repository. Windows support has since been deferred; the remaining supported BtbN consumer is Linux x64.

## What Changes

- Make `neko-engine` the single owner of FFmpeg build-artifact identity for every supported BtbN target, currently Linux x64: immutable BtbN release tag, exact archive filename, and SHA256.
- Verify every repository-managed BtbN archive before extraction or packaging, and fail visibly on missing or mismatched integrity metadata.
- Remove deferred Windows FFmpeg descriptors and acquisition paths from the current packaging contract.
- Add focused tests proving mutable release aliases and unverified or mismatched archives cannot enter the canonical packaging path.

## Capabilities

### New Capabilities

- `verified-ffmpeg-build-artifacts`: Defines deterministic, checksum-verified FFmpeg dependency acquisition for Engine native builds and platform packaging.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-engine/scripts/` package configuration, download/bundle helpers, and package-owned tests.
- Keeps CI and Release dependent only on Engine-owned descriptors for supported targets.
- Removes Windows FFmpeg acquisition from the current release path; restoring it belongs to the later Windows qualification change.
