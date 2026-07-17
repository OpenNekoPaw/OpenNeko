## Why

The customized workspace removes non-core products but retained Cut, Canvas, Assets, Preview, Tools, and Agent media paths still require on-demand file access, FFmpeg codec support, decoder reuse, GPU media processing, and low-latency stream transport. Replacing the existing Rust runtime with a process-per-action TypeScript wrapper would preserve basic probe/transcode operations but regress retained Range, seek, decoder-pool, GPU, and streaming behavior.

## What Changes

- Define the retained product set as Engine, Tools, Preview, Assets, Agent, Cut, and Canvas, plus the TUI, VS Code pack, and required host-neutral libraries.
- Remove `@neko/workbench-core`, Market UI/Extension, and `@neko/market-core`; retained Webviews expose their package-owned host adapters directly, and retained Skill behavior moves to the PI Agent path.
- Remove the Dashboard product surface and migrate the retained Entity VS Code runtime and inspector into Assets, which already owns the Entity Browser and asset-binding workflows.
- Retain `neko-engine` as a pruned Rust media runtime with `engine-types`, codec, audio, GPU, media runtime, media Kernel, Host API/HTTP, CLI, N-API, and the TypeScript VS Code lifecycle wrapper.
- Remove Scene, Puppet, Model, ML, Device, Live, panoramic, and product-specific renderer capabilities vertically across Cargo dependencies, Kernel services, Host controllers/routes, CLI/N-API methods, TypeScript clients, tests, scripts, and public DTOs.
- Remove the stale Device Activity Bar, view, commands, menus, localization, and public TypeScript remnants from retained Tools/shared packages so a removed provider is not advertised as available.
- Simplify the retained Cut workbench by removing its left rail, keeping timeline controls continuously reachable, and moving the package and property-panel controls into the canonical timeline control bar; the existing timeline export action remains the only export entry in that surface.
- Preserve the existing `neko.engine.ensureFrameServer` and `@neko/neko-client` boundary for supported media callers, including authorized file/Range access, probe, frame capture, audio/video processing, timeline playback, stream, proxy, and export.
- Remove the in-progress TypeScript FFmpeg process/server implementation so Rust/N-API remains the only Engine implementation; removed capability groups fail visibly by absence or `UnknownAction`, never through fallback or successful no-op behavior.
- Align workspace, release, native build/package scripts, VS Code manifests, lockfiles, and quality checks with the retained Rust media dependency closure.
- **BREAKING**: Scene/Puppet/Model/ML/Device/Live Engine groups and their DTO/client surfaces are removed. No migration is required for media source files; generated proxies and caches remain rebuildable.

## Capabilities

### New Capabilities

- `pruned-workspace-build`: Defines the installable, buildable, and packageable boundary of the customized core distribution.
- `pruned-rust-media-engine`: Defines the retained Rust media runtime, dependency closure, supported action groups, authorized file transport, N-API/CLI hosts, and removed capability behavior.

### Modified Capabilities

None.

## Impact

- Workspace/distribution metadata: `pnpm-workspace.yaml`, root scripts, lockfiles, package groups, release channels, dependency checks, and `apps/neko-vscode`.
- Removed composition surfaces: `packages/neko-workbench-core`, Market packages, Dashboard, the stale Device view, Cut's redundant left rail, and stale Webview `workbench-adapter` exports.
- Retained Engine crates: `engine-types`, `engine-codec`, `engine-audio`, `engine-gpu`, `runtime-media`, `engine-kernel`, `host-api`, `host-http`, `host-cli`, and `host-napi`.
- Removed Engine crates: Scene/Puppet/panoramic renderers and Scene/Puppet/ML/Device runtimes.
- Consumers: `@neko/neko-client`, Cut, Canvas, Assets, Preview, Tools, Agent media access, Entity facades, and VS Code manifests.
