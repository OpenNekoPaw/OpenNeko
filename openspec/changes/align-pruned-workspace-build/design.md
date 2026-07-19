## Context

The worktree contains a deliberate large deletion of non-core products and the Rust Engine. Retained Webviews already expose package-owned host adapters and have no production dependency on Workbench Core, while Agent/TUI retain deleted Market references and root scripts still name removed products. Retained media callers continue to depend on `neko.engine.ensureFrameServer`, `EngineClient`, authorized file access, Range/seek, decoder reuse, GPU processing, and stream transport.

The earlier TypeScript direct-FFmpeg replacement is superseded. It can provide basic probe, capture, and proxy operations, but its process-per-action lifecycle does not preserve the retained Rust Engine's long-lived decoder, stream, GPU, and N-API behavior. The canonical implementation is therefore a smaller Rust media Engine rather than a parallel TypeScript runtime.

The retained product audit also found that Dashboard primarily duplicates project creation, Agent task/Skill views, and runtime status while hard-coding removed Story, Audio, Model, Puppet, and Sketch workflows. Dashboard nevertheless owns activation of the host-neutral Entity runtime currently consumed by Assets and Canvas. Tools separately retains a Device view manifest after its provider implementation and Engine Device runtime were removed, which exposes an empty VS Code view with no registered data provider. Cut retains a narrow left rail whose export action duplicates the timeline header, whose timeline-control visibility action can hide its own recovery surface, and whose remaining package/property actions belong with the other editor controls.

### Five-layer analysis

- **Responsibility:** Cargo owns the native dependency closure; the Rust media Kernel owns codec/audio/video/image/timeline/GPU computation; Host API/HTTP own action and binary transport; CLI and N-API are host adapters; the TypeScript extension owns VS Code lifecycle and authorization projection only. Assets owns the retained VS Code Entity composition because it already owns Entity Browser and asset binding; `@neko/entity/host-vscode` remains the implementation boundary.
- **Dependency:** retained native hosts depend inward on Host API/HTTP, Kernel, runtime-media, codec/audio/GPU, and engine-types. No retained crate depends on Scene/Puppet/ML/Device runtimes or their renderers.
- **Interface:** retained callers keep the established command, Entity facade, HTTP/WS, file-token, and `EngineClient` boundaries, narrowed to real retained capabilities. Removed groups and Dashboard/Device entry points are absent from manifests, registries, and clients.
- **Extension:** new media behavior extends existing service/controller/action contracts. It does not reintroduce product runtimes or feature-package-local FFmpeg wrappers.
- **Testing:** Cargo metadata proves the native closure; Kernel/Host/N-API/CLI tests prove producer behavior; Assets/Canvas Entity tests prove the migrated canonical path; manifest tests prove Dashboard and Device absence; client and consumer tests prove retained media paths; Range/seek/stream fixtures prove loading behavior.

### Close retained strict-extension contract drift

The strict Agent/Engine extension graph compiles shared Agent, Platform, Content, and local-metadata consumers together, so it is the authoritative feedback loop for contract drift that package-local transpilation can miss. The repair keeps public contracts unchanged and updates each consumer at its owning boundary:

- Pi permission resolution relies on the preceding confirmation discriminant instead of retaining an unreachable boolean comparison.
- ProjectQuality orchestration validates each result envelope, explicitly projects optional success data, and emits the media-quality evidence issue shape rather than the unrelated QA remediation issue type.
- LLM parameter projection keeps the returned option view readonly while using a package-local mutable builder during construction.
- Generated-output adoption requests UTF-8 directory entries and removes a media-kind branch already excluded by the generated-asset discriminant.
- Semantic document extraction converts its supported PDF/EPUB/DOCX source set into the canonical `DocumentFormat` boundary before document access.
- Workspace identity recovery captures the immutable action before asynchronous callbacks so discriminated-union narrowing remains valid.
- Local metadata maps its internal `rebuilding` state to the public search freshness value `building` at the projection boundary.

These are compile-time and deterministic unit-test paths. They do not require provider credentials, browser/Webview automation, or a VS Code Development Host.

## Goals / Non-Goals

**Goals:**

- Preserve Rust FFmpeg, decoder pool, GPU, Range, stream, CLI, and N-API media capabilities required by retained products.
- Delete Scene, Puppet, Model, ML, Device, Live, and panoramic capability ownership from every layer.
- Delete the Dashboard product surface while preserving Entity capabilities under Assets ownership.
- Delete stale Device views, commands, localization, clients, and shared types from retained TypeScript surfaces.
- Remove Cut's redundant left rail and keep one continuously reachable timeline control surface for package, property visibility, and export actions.
- Keep a single Rust/N-API Engine implementation and remove the TypeScript process/server replacement.
- Make frozen installation, native builds, retained extension builds, and packaging succeed with the pruned dependency graph.
- Preserve fail-visible security and lifecycle behavior for authorized paths, tokens, streams, cancellation, and native failures.

**Non-Goals:**

- Preserve compatibility aliases or dormant feature flags for removed Engine groups.
- Retain Bevy ECS, glTF, ONNX Runtime, device capture, MOC3, Scene viewport, Puppet, or model-preview code without a retained media caller.
- Move Engine FFmpeg logic into Cut, Assets, Canvas, Preview, or Agent.
- Rewrite working media/codec/GPU algorithms merely to reduce line count.

## Decisions

### Remove Workbench Core and Market Core

Current production code has no import, manifest dependency, or TypeScript alias for `@neko/workbench-core`; only stale exports and quality metadata remain. Retained feature packages continue to expose their actual host-adapter entry points. Market remains a removed product domain, and marketplace-only Agent/TUI behavior stays removed.

### Remove Dashboard and move Entity composition to Assets

Dashboard is removed as a product rather than reduced to a second home surface. Its workflow catalog advertises removed products, while projects, Agent tasks, Skills, and Engine status already have retained owning surfaces. Dashboard Webview, project/workflow/status readers, task and Skill aggregation, commands, Activity Bar contribution, package, build target, and release metadata are deleted.

Entity is not Dashboard state. The host-neutral implementation already lives in `@neko/entity/host-vscode`, and Assets already exposes Entity Browser and binding operations. Assets becomes the VS Code composition root for the Entity metadata binding, runtime registry, facade commands, source projection needed by retained callers, and Entity Inspector. Canvas and Agent continue through shared Entity contracts/commands rather than importing Assets internals. No compatibility Dashboard extension or fallback command path remains.

Cut's Dashboard-only task source and command are removed because no retained consumer aggregates them. Agent-owned task projection remains inside Agent; Dashboard-named neutral DTO cleanup is limited to references that no longer have a retained caller and may be renamed separately if a broader public-contract migration is justified.

### Remove stale Device contributions

Device capture/enumeration has no retained runtime or product caller. Tools therefore removes the `neko-devices` container, `neko.devices` view, all `neko.devices.*` commands and menus, Device/Live localization, and removed file-type metadata that exists only for deleted products. Shared/client Device exports and quality metadata are removed vertically. The view is not hidden or left empty because that would preserve a false supported surface.

### Close residual removed-product contracts in two data-safe stages

A post-implementation audit found that the release set and Rust dependency closure are pruned, but retained TypeScript packages still advertise removed product owners through extension IDs, client re-exports, tool/API contracts, file-icon contributions, generated Scene Proto surfaces, quality ownership, and stale architecture text. Those surfaces have no user-data ownership and are deleted first, with a repository guard that distinguishes the retained Preview `model-preview` and Canvas narrative `scene` semantics from removed `neko-model`, `neko-puppet`, Engine Scene, and Dashboard product paths.

The same audit found `.nka`/`.nks`/`.nkm`/`.nkp` codecs, Canvas project preview labels/readers, native character export parsing, and Cut `scene3d`/`puppet` timeline elements still have executable consumers. Removing them changes whether existing local project data can be opened, previewed, or exported, so they are not treated as metadata cleanup. Before deletion, the change must define one fail-visible data strategy: migrate the valuable source facts to a retained format, preserve a bounded import-only reader with an explicit removal condition, or reject the format without modifying the file. No default registry, compatibility extension, successful no-op, or Engine fallback may keep the removed product path alive.

### Close second-pass orphaned Live, Audio, Tracking, and Market surfaces

A second producer/consumer audit applies the same five-layer boundary to contracts that survived the package deletion:

- **Responsibility:** no retained package owns `neko.assets.promoteRecording`, the `neko-live`/`neko-audio` recording producer contract, or the tracking service contract. Their command, service, public types, and tests are deleted together. Retained Engine/Cut/Preview audio processing remains media behavior and is not a deleted Audio-product surface.
- **Dependency:** Canvas delegation retains only destinations with a real consumer. Removed Sketch and Puppet targets are deleted; retained Preview/model-file and Cut/audio-file routes remain because they resolve to current packages rather than removed product owners. The `live` Entity asset-requirement source is deleted because no producer exists.
- **Interface:** Market installation receipts are not exposed through `LocalMetadataRepositories`; removing the repository code does not drop an existing SQLite table or mutate its bytes. Global `auth` and `market` configuration sections remain preservation-only until an explicit user-config migration defines whether to remove or transform them, and are tracked as bounded debt rather than active product capability.
- **Extension:** legacy project manifests may still contain `sourceKind: market`; Assets keeps only the fail-visible reader/rejection path so it can report `removed-market-source`. It does not provide a creation API, installation lookup, fallback, or Market activation path. Current PI/provider OAuth credentials remain Agent-owned authentication and are distinct from the removed Auth product configuration.
- **Testing:** absence guards reject reintroduction of no-owner files and discriminants; focused contract tests prove legacy Market manifest rejection; metadata/config tests prove cleanup neither creates an active Market path nor silently deletes preserved settings or database bytes.

Stable documentation and examples must use the retained ownership vocabulary. Historical documents may name removed products when they are explicitly marked historical; current architecture, package READMEs, comments, and fixtures must not present them as supported domains.

### Consolidate Cut workbench controls

Cut removes its package-specific left rail from both the editor and host-adapter projection. The shared creative shell omits the rail container when no rail is supplied, so removal does not leave an empty border or reserved column. Timeline controls stay continuously visible; the obsolete `mainPanelToolsVisible` state and self-hiding action are deleted rather than made unreachable.

The existing timeline export button remains the canonical export entry. Package and property-panel visibility actions move into the same timeline header control layer. Property visibility keeps explicit `aria-controls` and pressed/expanded state so the direct control remains accessible and accurately projects the right dock.

### Retain one pruned Rust Engine

The extension ID `neko.neko-engine`, command names, N-API bridge, embedded loopback Host HTTP server, and `EngineClient` transport remain shared contracts. Rust is retained because media Range, `avformat_seek_file`, decoder pooling, GPU composition, continuous playback, and WebSocket transport are real retained capabilities.

The TypeScript Engine files that spawn FFmpeg and implement a second HTTP server are removed. The TypeScript extension remains a thin composition root around the native N-API host. There is no runtime fallback between implementations.

### Retained native dependency closure

The intended Cargo graph is:

```text
extension.ts -> host-napi -> host-http -> host-api -> engine-kernel
                         \                         -> runtime-media
host-cli -----------------+                       -> engine-codec
                                                  -> engine-audio
                                                  -> engine-gpu
all retained crates ------------------------------> engine-types
```

Retained workspace members:

- `engine-types`
- `engine-codec`
- `engine-audio`
- `engine-gpu`
- `runtime-media`
- `engine-kernel`
- `host-api`
- `host-http`
- `host-cli`
- `host-napi`

Removed workspace members:

- `engine-scene-renderer`
- `engine-puppet-renderer`
- `engine-panoramic-renderer`
- `runtime-scene`
- `runtime-puppet`
- `runtime-device`
- `runtime-ml`

Dependencies used only by removed capabilities, including Bevy ECS, glTF, ONNX Runtime, ndarray, rustfft, and device-only capture stacks, are removed when no retained media code requires them.

### Retained media surface

The initial supported groups are derived from retained callers:

- `nodes`, `tasks`
- `files`, `previews`
- `videos`, `audios`, `images`
- `timelines`, `streams`
- `effects`, `color-correction`

`documents`, `plugins`, and `canvas` remain only if an inventory identifies a retained media caller and their implementation does not own removed product behavior.

The following groups are removed from `engine-types`, Kernel services, Host API, HTTP routes, CLI/N-API, and `EngineClient`: `models`, `model-preview`, `scenes`, `puppets`, `viewport`, `live-compositor`, `cameras`, `midi`, and `gamepad`.

### Audio processing excludes device capture

Retained audio covers file decode, seek, resample, PCM, waveform, loudness/silence, mixdown, and playback stream behavior. Microphone capture and device enumeration belong to the removed Device capability; `cpal` and related code are removed unless a retained media test proves they are required.

### Preserve authorized on-demand loading

The Rust Host HTTP file-token path remains the canonical binary access boundary for media codec, seek, stream, proxy, and export workloads. It serves bounded HTTP Range responses using file seek and streaming, and rejects sources outside authorized roots. Codec paths retain FFmpeg seek and decoder-pool behavior; high-frequency media frames and PCM do not transit the Extension Host.

PDF, EPUB, DOCX, and CBZ preview transport is not a media Engine capability. The Preview Extension owns one Node loopback service: PDF and CBZ use streamed Range responses, DOCX uses a bounded whole-file response, and EPUB uses a directory-style endpoint backed by bounded archive-entry reads from `@neko/content/document/node`. Browser-safe document exports never expose `node:fs`; paths remain behind panel-scoped opaque tokens. The Node adapter rejects traversal, out-of-file ranges, oversized Range allocations, and oversized expanded entries before returning bytes. Document providers do not start or fall back to the Rust Engine.

### Align distribution metadata from one retained set

Generic workspace globs discover existing TypeScript projects. `scripts/package-groups.json` owns the retained extension set of Engine, Tools, Preview, Assets, Agent, Cut, and Canvas, while native Engine scripts explicitly build/package the pruned Cargo workspace, CLI, N-API binary, FFmpeg dependencies, and VS Code extension.

Each generated directory has one build owner. In the root Turbo `build` graph, `@neko/preview-webview#build` owns the Preview Vite output and `neko-preview#build` runs only after it to compile the Extension and assemble the VSIX tree. The standalone `neko-preview#compile` path remains self-contained for `vscode:prepublish`, release compilation, and functional fixtures.

Root shell orchestration represents Turbo filters as Bash arrays so an empty optional package group cannot trip `set -e` and shell word-splitting cannot merge filters. `Debug Dev (All)` opens `${env:HOME}/Git/neko-test`, the explicitly designated synthetic workspace. Functional cases create isolated run directories under its `.neko/.functional/` subtree and never use ordinary development workspaces as evidence.

Native Engine compilation has one build owner at `neko-engine#build`. Its package script runs the CLI release build before the N-API release build, so Cargo registry and target locks are not contended by sibling Turbo tasks. The Turbo task does not depend on the host-specific `build:native` tasks; those commands remain direct package entry points for packaging and focused development. Turbo caching is disabled for the native workflow because its platform-specific Cargo and N-API outputs are not represented by the task's `dist/**` output; Cargo's `target` directory remains the rebuild cache. The N-API wrapper performs a visible Cargo metadata preflight before invoking `@napi-rs/cli`, so registry updates and lock waits cannot be hidden behind the CLI's captured metadata subprocess.

### Reject removed project formats without modifying user files

The retained distribution supports `.nkv` and `.nkc` as editable project formats. `.nka`, `.nks`, `.nkm`, and `.nkp` are removed-product formats and are not registered in the default project codec registry, Canvas project inference, project preview, picker, or delegated editor routes. A retained caller that attempts to load or save one of these paths receives an explicit unsupported-format diagnostic before any write. The original file remains untouched; there is no implicit conversion, empty-document fallback, or import-only success path in this change.

Assets keeps generic character/entity export, but native `.nkp` puppet export is removed. If a requested character export depends on an `.nkp` native binding, the export fails before creating an output file and identifies the unsupported binding. It does not silently omit the binding, choose an optional Live2D representation, or mutate the source.

Cut supports media, audio, text, shape, subtitle, and effect timeline behavior. `scene3d` and `puppet` tracks/elements are removed from the editable TypeScript and Proto contracts. The JSON NKV validator rejects these legacy discriminants before the parsed value can become `ProjectData`; save validation rejects the same values. This preserves old `.nkv` bytes while ensuring removed Engine render paths cannot participate or report success.

### Replace removed inter-extension routes with retained owners

Fountain parsing is host-neutral text analysis owned by `@neko/content`. Canvas and Agent read the source file and build their scene/character projection through that retained parser; they do not discover or activate a Story extension. Entity character lookup uses the retained Entity facade owned by Assets.

Market-specific shader discovery, package-status checks, and Model-node installation UI are removed because no retained package owns installation state. Retained local assets continue through Assets-owned indexes and paths. Agent plugin transfer advertises only Canvas, Cut, and Explorer targets; Sketch and Model command plans are absent.

The retained Agent is configured through its local provider configuration and PI credential services. The removed Auth extension's SSO messages, account UI, catalog cache, session subscription, and account-gateway credential resolver are deleted together. Selecting a removed account-owned provider is not represented as an available configuration and cannot fall back to an optional extension.

## Risks / Trade-offs

- [Kernel currently imports removed runtimes directly] -> shrink `KernelServices`, facade construction, service modules, Cargo dependencies, and tests together; do not retain placeholder services.
- [Host/API/client surfaces expose many removed groups] -> remove groups vertically and add absence/UnknownAction tests so stale callers cannot report success.
- [Native packaging is larger and more complex than TypeScript FFmpeg] -> keep only the media closure and platform FFmpeg/GPU assets, then verify CLI/N-API packaging on supported targets.
- [Some generic-looking code may secretly depend on Scene or Device types] -> trace producers and consumers before deletion; retain code only when a real media caller and dependency direction are demonstrated.
- [Dashboard currently activates Entity services used by retained products] -> migrate composition and path-level tests to Assets before deleting Dashboard; do not add a Dashboard compatibility extension or duplicate Entity owner.
- [Dashboard task DTO names remain in retained Agent internals] -> remove unconsumed Dashboard aggregators now and record neutral contract renaming separately if required; do not combine a broad task protocol rewrite with the product-surface deletion.
- [Worktree already contains partial TypeScript Engine work] -> remove it as superseded implementation, not as a fallback; preserve unrelated workspace-pruning edits.

## Migration Plan

1. Update OpenSpec to the pruned Rust media design and remove the TypeScript Engine implementation path.
2. Restore only the retained Rust crates and TypeScript extension wrapper from the pre-prune source state.
3. Remove forbidden Cargo members/dependencies, then shrink Kernel services and public contracts until the retained native workspace compiles.
4. Shrink Host API/HTTP, CLI, N-API, `EngineClient`, and retained consumers to the media action catalog.
5. Move Entity VS Code composition and Inspector into Assets, then delete Dashboard and its distribution metadata.
6. Remove Device contributions and remaining Device TypeScript/quality surfaces.
7. Consolidate Cut controls into the timeline header and remove its left rail and obsolete visibility state.
8. Align native setup/package scripts, release metadata, VS Code manifests, and lockfiles.
9. Run Cargo, N-API, CLI, Range/seek/stream, TypeScript consumer, Entity/manifest, OpenSpec, and repository quality gates.

Rollback is a source-control rollback of this pruning change. There is no TypeScript Engine runtime fallback. Media sources and project facts are not migrated; rebuildable caches may be regenerated.

## Open Questions

None for the initial boundary. Optional platform hardware acceleration remains a codec/GPU concern and must not reintroduce removed product runtimes.
