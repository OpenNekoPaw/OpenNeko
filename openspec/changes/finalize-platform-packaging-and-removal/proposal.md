## Why

GitHub Release currently exposes the product as an extension pack plus seven separately installable VSIX files. That distribution leaks internal package boundaries to users and does not provide one offline-installable OpenNeko product artifact per supported platform.

## What Changes

- **BREAKING** Replace the public extension-pack and per-feature VSIX release contract with exactly one installable `OpenNeko-<platform>-<version>.vsix` for each supported platform.
- Keep Engine, Tools, Preview, Assets, Agent, Cut, and Canvas as owning source packages, but treat their packaged extension payloads as build-only inputs to the OpenNeko application composition root.
- Add a composed Extension Host lifecycle and scoped resource/storage contexts so embedded feature entry points run inside the single installed OpenNeko extension without copying domain implementations into the application.
- Replace internal extension discovery with an explicit in-process feature API registry while retaining VS Code discovery only for external extensions such as Git.
- Merge retained VS Code contribution and localization manifests deterministically, failing on incompatible collisions or missing payloads.
- Change Merge Gate and Release packaging to upload only the two canonical platform artifacts; Release continues to validate the tag source and publishes a checksum manifest.
- Remove the pure extension-pack installation path and prevent individual feature VSIX files from entering public release artifacts.

## Capabilities

### New Capabilities

- `single-vsix-distribution`: Defines the single installable OpenNeko VSIX contract, embedded feature composition, supported-platform artifact names, and fail-visible packaging validation.

### Modified Capabilities

None. The relevant packaging requirements are still active change artifacts rather than stable specs; this change supersedes their multi-VSIX distribution assumptions through one canonical capability.

## Impact

- Affected application and packaging owners: `apps/neko-vscode`, `scripts/package-groups.json`, CI/Release workflows, release validators, and orchestration tests.
- Affected feature integration boundary: the shared VS Code extension API registry and retained feature callers that currently discover other Neko extensions by marketplace extension ID.
- User impact: one platform-specific VSIX is downloaded and installed; individual Neko feature extensions are no longer public installation units.
- Release/install risk: L4. Acceptance requires deterministic package-content checks plus installation and activation evidence on supported real VS Code hosts; browser-only validation is insufficient.
