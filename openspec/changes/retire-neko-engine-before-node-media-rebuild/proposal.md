# Change: retire Neko Engine before rebuilding shared media paths

## Why

Cut already has a Node/FFmpeg media path, but Preview, Canvas, Tools, Agent,
Assets, the VS Code composition root, and release packaging still expose
`neko-engine`. Keeping those surfaces active while replacements are developed
allows tests and runtime code to pass through an unintended Engine fallback.

The migration order therefore changes from consumer-by-consumer coexistence to
removal-first, fail-closed replacement. The product must first stop composing
and advertising Engine. Missing replacement capabilities fail visibly until
their owning package is connected to the new canonical media runtime.

## What Changes

- Remove `neko-engine` from the OpenNeko product feature graph, extension
  dependencies, commands/capabilities, package groups, and release closure.
- Add a repository gate that rejects new production Engine imports, commands,
  routes, DTOs, package dependencies, and test fallback mocks.
- Freeze neutral media contracts before sharing the existing Cut Node/FFmpeg
  implementation.
- Extract one host-owned Node/FFmpeg runtime and one browser MSE/PCM client
  surface; domain packages keep narrow domain-owned ports.
- Rebuild Preview, Canvas, Tools, Agent, and Assets on those ports.
- Move Cut to the shared runtime so it does not become a second FFmpeg
  implementation.
- Remove the obsolete Engine client/protocol surface, native build/package
  machinery, and finally `packages/neko-engine`.

## Migration Policy

- No feature flag, adapter fallback, retry, dual-read, dual-write, or optional
  Engine provider is permitted.
- A missing FFmpeg executable, unsupported source, unknown descriptor, or
  unconnected domain adapter returns an explicit diagnostic.
- Tests must assert the selected adapter/handler and must run with the legacy
  Engine path poisoned or absent.
- User project data is not deleted. Derived Engine caches and native artifacts
  are rebuildable and may be removed after their owners are disconnected.

This change supersedes the Engine-retention clauses of still-present changes
such as `align-pruned-workspace-build`, `fix-native-engine-module-loading`,
`pin-ffmpeg-build-artifacts`, `deduplicate-linux-ffmpeg-runtime-closure`,
`limit-supported-platforms`, `finalize-platform-packaging-and-removal`,
`close-embedded-runtime-dependencies`, and
`redefine-openneko-lightweight-editing`. Their non-Engine decisions remain
independent; none may restore an Engine runtime, client, artifact, or fallback.

## Scope

### In scope

- Product composition and packaging removal for `neko-engine`.
- Media responsibilities currently owned by Preview, Canvas, Tools, Agent,
  Assets, and Cut.
- Shared probe, frame/thumbnail extraction, waveform, PCM decode, preview
  preparation, audio/subtitle extraction, media analysis, and export execution.
- Removal of obsolete Engine routes, clients, generated DTO consumers, native
  artifacts, tests, and documentation.
- Real VS Code Webview validation for affected preview/playback paths.

### Out of scope

- A cloud media service or remote daemon.
- Reintroducing a general render engine under a new name.
- Native color-critical HDR monitoring. HDR/10-bit remains accepted input and
  uses an explicit qualified playback or SDR proxy profile.
- Expanding Cut beyond its accepted lightweight single-video-track,
  multi-audio-track, single-subtitle-track model.

## Impact

- Affected product root: `apps/neko-vscode`.
- Affected packages: `neko-preview`, `neko-canvas`, `neko-tools`,
  `neko-agent`, `neko-assets`, `neko-cut`, `neko-client`, `neko-proto`, and
  `neko-engine`.
- Affected scripts: workspace build, package grouping, platform VSIX assembly,
  native module staging, release, quality, legacy-debt, and unused checks.
- The stable architecture documents for package boundaries, application
  composition, media runtime, wire contracts, and Webview media security must
  be updated when the implementation is accepted.
