## Why

OpenNeko has a verified Apple Silicon Forge package but no formal release workflow, version/tag
authority, Developer ID signing, notarization, distributable checksum, or GitHub Release boundary.
macOS is now the only native package and release target, so that single path must fail visibly unless
all release evidence is complete.

## What Changes

- Add a tag-triggered macOS Apple Silicon release workflow that validates the source revision before
  creating any public artifact.
- Define an exact stable `v<semver>` tag from the `main` history as the release-version authority;
  the local Desktop manifest version does not gate a release.
- Project the tag-derived version only into the ephemeral release checkout so Forge writes the same
  version into the application and ZIP without persisting a local source change.
- Build the canonical macOS ZIP with Electron Forge on a native Apple Silicon runner.
- Require Developer ID signing, hardened runtime, Apple notarization, stapling, Gatekeeper
  assessment, deterministic SHA-256 output, and exact artifact-path validation.
- Publish only the verified ZIP and checksum manifest to a GitHub Release; missing credentials,
  signature, notarization, artifact, or tag-version projection fails the workflow.
- Keep local development packages ad-hoc signed and isolated from the release configuration.
- Keep Windows and Linux test-only; neither platform is permitted to create or publish a Desktop
  release artifact.

## Capabilities

### New Capabilities

- `macos-desktop-release`: Defines version authority, native build/sign/notarize validation,
  distributable closure, and GitHub Release publication for the sole macOS Apple Silicon target.

### Modified Capabilities

None.

## Impact

- `.github/workflows/`: new tag-triggered release graph and release-specific permissions/secrets.
- `apps/neko-desktop`: the Application composition root continues to own only Forge packaging,
  Electron signing/fuses, and release metadata; no domain behavior moves into the app.
- `scripts/`: repository-owned release metadata, artifact, checksum, and workflow-shape validation.
- Root/Desktop README and architecture release documentation.
- No package-owned business contract, renderer/preload IPC, user data, project format, or runtime
  success path changes.
