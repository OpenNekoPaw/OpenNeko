## Context

`neko-preview` is the retained owner for authorized, read-only format preview. Its current Extension registers media and document custom editors, uses package-owned Webview entries, and already hands document evidence to Agent through `neko.agent.sendContext`. The retained Rust Engine deliberately removed Model, Scene, viewport, camera, and model-preview groups. At the same time, creators need to inspect common 3D assets and stage a useful camera and light projection before using those assets as references for AI video work.

The new capability crosses Preview Extension, Preview Webview, shared context types, and Agent ingestion. It also introduces Three.js and must protect Webview CSP, local file authorization, GPU lifecycle, multi-panel isolation, payload size, and the pruned Engine boundary. It does not justify a new product package because it only renders existing standard formats, does not author source files, and does not define a durable model or scene artifact.

### Five-layer analysis

- **Responsibility:** Preview Extension owns Custom Editor lifecycle, source authorization, recoverable UI-state projection, capture materialization, and Agent command delivery. The model Webview owns Three.js rendering and temporary staging. Agent owns context interpretation, provider capability validation, and generation. Assets continues to own asset import and identity; Engine continues to own retained media computation only.
- **Dependency:** `neko-preview` depends on shared host/resource and UI contracts. Three.js is a dependency of `@neko/preview-webview` only. Agent consumes a minimal shared context DTO and never imports Preview or Three.js. No retained package depends on removed Scene/Model Engine DTOs.
- **Interface:** Extension and Webview communicate through a versioned, identity-bearing Model Preview protocol. The Extension supplies a stable source `ResourceRef` plus exact projected URI mapping; the Webview returns staging snapshots and bounded captures. Preview and Agent communicate through one `model-preview` `AgentContextPayload`.
- **Extension:** Additional standard formats require an explicit code-owned allowlist and format adapter with dependency enumeration tests. There is no runtime loader registry or custom format contribution point. New durable authoring, multi-model scenes, or provider-native 3D inputs require a later OpenSpec.
- **Testing:** Pure source parsers and protocol guards use deterministic tests; Webview rendering logic is behind a Three runtime port for jsdom tests; Extension tests cover authorization and disposal; shared/Agent tests poison the removed `model-scene` path; one synthetic-workspace Extension Development Host scenario proves real Webview load, staging, capture, and Agent delivery.

## Goals / Non-Goals

**Goals:**

- Preview GLB, glTF, OBJ, STL, and PLY sources in a dedicated, lazy-loaded Webview entry.
- Authorize only the primary source and format-declared local companion resources.
- Provide temporary node transforms, multiple camera presets, light-rig staging, model facts, and bounded captures without modifying source bytes.
- Isolate mutable state, messages, cancellation, authorization, and GPU resources per open panel.
- Deliver stable source, preview-image, and semantic staging evidence to Agent through one canonical context.
- Prove that removed Rust Engine Model/Scene groups and legacy Agent `model-scene` context cannot participate.

**Non-Goals:**

- Defining `.nkm`, `.neko3d`, sidecar, scene, shot, or other project formats.
- Saving model, material, skeleton, animation, camera, or light edits into source files.
- General geometry modeling, rigging, animation authoring, keyframes, multi-model scene composition, or final rendering.
- Supporting FBX, VRM, USD/USDZ, Collada, proprietary DCC formats, or runtime loader registration in the initial change.
- Restoring Engine `models`, `model-preview`, `scenes`, `viewport`, or `cameras` actions or adding an Extension-host renderer.
- Selecting AI providers, converting the context into provider parameters, or submitting video generation from Preview.

## Decisions

### Keep the capability inside neko-preview

The feature is a standard-format read-only projection with temporary send-time staging, so `neko-preview` remains the owning package. A new `neko-model` or `neko-3d` product would introduce a second activation, manifest, release, host adapter, and product lifecycle without owning a durable artifact. A separate browser package would also add build and contract indirection before there is a second real consumer.

The code remains internally modular:

```text
packages/neko-preview/
  packages/extension/src/providers/model/
    modelPreviewContract.ts
    ModelPreviewProvider.ts
    modelPreviewSource.ts
    modelAgentContext.ts
  packages/webview/
    model.html
    src/model/
      main.tsx
      ModelViewer.tsx
      threeRuntime.ts
      modelStagingStore.ts
      components/
```

`ModelPreviewProvider` is the only lifecycle class. `modelPreviewSource` and `modelAgentContext` are small boundary modules unless implementation evidence demonstrates independent lifecycle or multiple implementations.

### Use a fixed code-owned format adapter table

The initial source adapters are GLB, glTF, OBJ, STL, and PLY. MTL is parsed only when an OBJ declares it. The adapter table owns extension matching, MIME expectations, text dependency enumeration, and Three.js loader selection. Unknown formats fail closed. There is no manifest schema, contribution point, registry, optional import fallback, or external Viewer dispatch.

This keeps supported behavior auditable and prevents a general plugin system from forming around a single Preview surface.

### Project exact dependencies through asWebviewUri

The Extension reuses `LocalResourceAccessService` for Webview configuration and path authorization. A model source session performs format-specific bounded parsing before load:

- GLB, STL, and PLY project only the primary source.
- glTF projects the JSON source plus relative `buffers[].uri` and `images[].uri` entries that are not embedded `data:` resources.
- OBJ projects the primary source, its declared relative MTL files, and relative texture maps declared by those MTL files.

Every accepted dependency is resolved inside an authorized root and converted with `webview.asWebviewUri()`. The Extension sends an opaque mapping from the source-relative reference to the projected URI. The Webview installs the mapping through a Three.js `LoadingManager` URL modifier. Remote URLs, absolute dependencies, traversal, missing files, unsupported schemes, and excessive dependency counts or sizes fail before renderer load.

This is preferred over opening a broad source directory, sending binary files through `postMessage`, or adding another loopback server.

### Keep Three.js entirely in the model Webview entry

`three` and `three/addons` are direct dependencies of `@neko/preview-webview`. `model.html` is an independent Vite input, so video, audio, and document entry points do not execute the model renderer. The initial path excludes Draco, Meshopt, KTX2, and worker-backed decoders; adding them requires a later dependency, CSP, asset-distribution, and security decision.

The Three runtime owns renderer creation, pixel ratio limits, resize, animation frames, loaders, scene, controls, cameras, lights, model objects, capture, and recursive disposal. React owns controls and projection only; Three objects do not enter Zustand/shared stores or cross the Webview boundary.

### Treat camera, light, and transform changes as recoverable UI staging

`ModelPreviewStagingState` is versioned and contains only serializable values:

- selected stable node path;
- temporary node transform patches;
- camera presets and active camera identity;
- one light rig containing environment and key/fill/rim or equivalent light entries;
- background and capture settings;
- monotonically increasing revision.

The state is keyed by stable source fingerprint and schema version. It can be restored through Preview-local Webview/Extension state but is not written beside the model, imported into Assets, or represented as a Scene/Engine DTO. An incompatible fingerprint or schema is rejected rather than loosely migrated.

Every message carries `sessionId`, `sourceFingerprint`, and staging `revision`. Focus or active editor state never substitutes for identity.

Camera pose projection is intent-based rather than a side effect of every staging update. The runtime applies the canonical front pose on first load, applies a preset pose when the active preset identity changes, and reframes only from an explicit reset-view action. Lighting, background, capture dimensions, node selection, and transform staging MUST preserve the live OrbitControls position, target, and distance. Field-of-view changes update the projection matrix without replacing the current orbit pose.

The model Webview owns two non-source viewport guides: a bounds-scaled ground grid positioned at the model's lowest Y bound, and a screen-space XYZ orientation indicator derived from the live camera orientation. They are renderer/UI aids only, remain outside shared staging and Agent context, default to visible, and are controlled from the package-local viewport toolbar. This avoids persisting editor chrome as model truth or adding another shared scene contract.

The scene panel projects one package-local discriminated selection with exactly three kinds: scene, camera preset, or model node. This selection decides which inspector is rendered but is not persisted as project or source truth. Camera rows are projections of the existing staging camera presets and may be duplicated, selected for editing, explicitly viewed through, renamed, or removed while at least one preset remains. Model-node rows continue to reference stable loader-derived paths and cannot be duplicated, renamed, or deleted because the source stays read-only.

Selecting a camera for editing MUST NOT move the live orbit camera. The Three runtime renders a temporary camera helper from the selected preset so its position, target, and field of view can be inspected from the current editor view. Only the explicit view-through-camera action applies that preset to the live orbit camera. The helper is package-local renderer chrome, is hidden from capture, and is disposed with the panel.

The right inspector is contextual rather than cumulative: scene selection owns model facts, lighting, background, and capture output; camera selection owns the selected preset name, position, target, field of view, and explicit camera actions; model-node selection owns temporary transform staging. This keeps unrelated controls out of each editing context and avoids introducing a second property system by continuing to compose `@neko/ui` property primitives.

### Materialize captures as derived preview resources

The Webview produces a bounded PNG from the current untainted canvas together with the exact staging identity and capture metadata. The Extension validates the live session, size, MIME, and revision, then materializes the PNG through the existing rebuildable preview/cache resource boundary and creates a stable preview-image `ResourceRef`.

The original model remains a stable source `ResourceRef`. Neither the original binary nor an absolute file path is embedded in the Agent payload. Capture failure stops delivery because a source-only fallback would misrepresent the requested visual evidence as complete.

### Replace model-scene with one model-preview Agent context

The shared `AgentContextType` adds `model-preview` and removes the unused `model-scene` discriminator. The new `ModelPreviewContextData` contains:

- contract version;
- source `ResourceRef`, fingerprint, and standard format;
- normalized facts such as bounds and node/mesh/material/animation counts;
- staging snapshot with camera, light, selection, and temporary transform semantics;
- derived preview-image `ResourceRef` and capture metadata.

Preview builds the context through a pure package-local builder and invokes `neko.agent.sendContext`. Agent validates and presents the context, projects the preview image as multimodal evidence, keeps the binary as a referenced resource, and exposes semantic staging to reasoning. Preview does not select a provider or create a media task. Agent/media capability code must explicitly validate any downstream provider controls; lack of native 3D input never triggers binary upload or fallback.

### Preserve fail-visible behavior

Unknown formats, unsafe dependencies, stale sessions, stale revisions, failed captures, invalid contexts, unavailable Agent delivery, loader failures, and WebGL failures produce typed diagnostics visible in the originating panel. The feature does not catch these conditions and return an empty model, default screenshot, successful send, Engine fallback, or external Viewer fallback.

## Risks / Trade-offs

- [Three.js increases the Preview Webview dependency and packaged size] → isolate it behind the `model` Vite entry, inspect chunk ownership, and add bundle/build regressions proving other entries do not import the model runtime.
- [glTF and OBJ companion resources can escape the source directory or reference remote content] → enumerate dependencies in the Extension, authorize exact paths, map exact Webview URIs, reject unsafe schemes/traversal, and test poisoned fixtures.
- [Large models can exhaust browser memory or stall the Extension while dependencies are inspected] → apply bounded text parsing, dependency-count and source-size limits, cancellation, pixel-ratio limits, and visible size diagnostics; do not silently downsample source geometry.
- [jsdom cannot validate WebGL, CSP, canvas capture, or GPU disposal] → keep a fakeable Three runtime port for deterministic tests and require a real VS Code Extension Development Host functional scenario with synthetic model fixtures.
- [Preview-local transforms may be mistaken for saved model edits] → keep the editor read-only, label controls as staging, avoid dirty-document state, and document that only recoverable local UI state is stored.
- [Agent providers generally do not consume 3D binaries] → send the source as a stable reference plus derived image and semantic staging; require explicit downstream provider capability and prohibit fallback upload.
- [The retained workspace still contains stale Model/Scene TypeScript symbols] → limit this change to the `model-scene` context discriminator and new minimal contracts, while Engine/pruning guards prove no removed runtime path is restored; broader stale-contract deletion remains owned by pruning/debt work.

## Migration Plan

1. Add the new shared `model-preview` context contract and poison/remove `model-scene` acceptance before registering a producer.
2. Add the model source adapter table, exact dependency enumeration, typed Extension/Webview protocol, and panel-scoped source session tests.
3. Add the isolated `model` Vite entry and Three runtime with GLB first, then enable the remaining allowlisted adapters only after each dependency and disposal fixture passes.
4. Add read-only staging controls, recoverable state, bounded capture, and resource materialization.
5. Register the Preview custom editor and Agent context bridge, then add shared/Agent presentation and canonical-path tests.
6. Update Preview documentation, localization, manifests, build ownership, debt guards, and the synthetic VS Code functional scenario.
7. Run focused Preview and Agent validation, repository build/test/check gates, and real Extension Development Host acceptance before enabling the format selectors by default.

Rollback removes the model custom editor contribution, Webview entry, Three.js dependency, new context discriminator, and related tests. It does not migrate or delete user model files because the feature never modifies them or creates durable artifacts. Preview-local recoverable state and derived captures are rebuildable and can be discarded.

## Open Questions

None for the initial fixed-format, read-only staging boundary. Compressed glTF decoders, additional formats, persisted staging, multi-model scenes, and provider-native 3D inputs require separate proposals.
