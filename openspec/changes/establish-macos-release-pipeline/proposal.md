## Why

OpenNeko has a verified Apple Silicon Forge package and a tag-triggered release workflow, but the
current workflow requires paid Apple credentials that the open-source preview channel does not own.
macOS is the only native package target, so the current distribution path must produce one clearly
labelled, checksummed DMG without misrepresenting it as notarized.

## What Changes

- Add a tag-triggered macOS Apple Silicon release workflow that validates the source revision before
  creating any public artifact.
- Define an exact stable `v<semver>` tag from the `main` history as the release-version authority;
  the local Desktop manifest version does not gate a release.
- Project the tag-derived version only into the ephemeral release checkout so Forge writes the same
  version into the application and DMG without persisting a local source change.
- Build the canonical macOS DMG with Electron Forge on a native Apple Silicon runner.
- Keep the application explicitly ad-hoc signed, verify the DMG and deterministic SHA-256 output,
  and require exact artifact-path validation without Apple credentials.
- Publish only the verified DMG and checksum manifest to a GitHub prerelease whose notes state that
  the build is not Developer ID signed or notarized and may require Gatekeeper's “Open Anyway”.
- Keep local development and preview packages ad-hoc signed through the same Forge trust mode.
- Keep Windows and Linux test-only; neither platform is permitted to create or publish a Desktop
  release artifact.

## Capabilities

### New Capabilities

- `macos-desktop-release`: Defines version authority, native ad-hoc DMG validation, distributable
  closure, preview disclosure, and GitHub prerelease publication for macOS Apple Silicon.

### Modified Capabilities

None.

## Impact

- `.github/workflows/`: tag-triggered preview release graph with release-specific write permission.
- `apps/neko-desktop`: the Application composition root continues to own only Forge packaging,
  Electron signing/fuses, and release metadata; no domain behavior moves into the app.
- `scripts/`: repository-owned release metadata, artifact, checksum, and workflow-shape validation.
- Root/Desktop README and architecture release documentation.
- No package-owned business contract, renderer/preload IPC, user data, project format, or runtime
  success path changes.
