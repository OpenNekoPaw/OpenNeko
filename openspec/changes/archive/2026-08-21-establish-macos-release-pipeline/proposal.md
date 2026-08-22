## Why

OpenNeko already has a verified Apple Silicon Forge DMG path, but GitHub Actions currently builds
and uploads native Desktop artifacts and tag pushes automatically create prereleases. Repository
owners want native release bytes to come only from an explicitly operated local Apple Silicon host,
and public versions to use ordinary GitHub Release metadata without a prerelease label.

The DMG remains ad-hoc signed and unnotarized. Removing GitHub's prerelease flag must not hide that
trust fact or imply Developer ID/notarization qualification.

## What Changes

- Remove the tag-triggered GitHub release workflow and prohibit GitHub Actions from running Forge
  package/make or uploading Desktop native artifacts.
- Keep deterministic source, typecheck, test, OpenSpec, dependency, and repository-quality checks in
  GitHub Actions; move native package evidence out of Manual/Merge Gate and retain it as an explicit
  local release/qualification responsibility.
- Keep an exact stable `v<semver>` tag from `main` as the public release-version authority.
- Build and verify the canonical ad-hoc-signed Apple Silicon DMG only on an explicitly operated local
  Apple Silicon host.
- Publish the verified DMG and checksum manifest as an ordinary GitHub Release, never with a
  prerelease flag, while retaining the unnotarized installation warning.
- Normalize already-published `v0.1.4` through `v0.1.8` releases to ordinary releases and make the
  newest version the repository's Latest release.
- Keep Windows and Linux test-only; neither platform may create or publish a Desktop release
  artifact.

## Capabilities

### New Capabilities

- `macos-desktop-release`: Defines local native build ownership, stable tag/version authority,
  ad-hoc DMG validation, exact artifact closure, trust disclosure, and ordinary GitHub Release
  publication for macOS Apple Silicon.

### Modified Capabilities

None.

## Impact

- `.github/workflows/`: source/test validation only; no native Desktop build, artifact upload, tag
  release trigger, or GitHub-side publication.
- `apps/neko-desktop`: the Application composition root continues to own Forge packaging, Electron
  signing/fuses, and release metadata; no domain behavior moves into the app.
- `scripts/`: repository-owned release metadata, artifact, checksum, and workflow-shape validation.
- Root/Desktop README, roadmap, and architecture release/quality documentation.
- Existing GitHub Release metadata for `v0.1.4` through `v0.1.8`.
- No package-owned business contract, renderer/preload IPC, user data, project format, or runtime
  success path changes.
