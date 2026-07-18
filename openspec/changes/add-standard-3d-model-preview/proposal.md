## Why

OpenNeko can preview retained media and document formats, but it cannot inspect common 3D model assets or turn a selected model view into evidence for Agent-assisted video creation. A browser-only Preview capability is needed so creators can stage a standard model with temporary camera and lighting controls without restoring the removed Model/Scene Engine product or introducing another project file format.

## What Changes

- Extend `neko-preview` with a `CustomReadonlyEditorProvider` for a fixed allowlist of standard 3D source formats: GLB, glTF, OBJ, STL, and PLY; MTL is accepted only as an OBJ dependency.
- Add a dedicated model Webview entry backed by Three.js for authorized loading, model inspection, orbit navigation, node selection, temporary transforms, camera presets, light-rig staging, and bounded screenshot capture.
- Reuse the Extension Host content-access boundary to project model files and declared companion resources through panel-scoped authorization. Reject traversal, undeclared local dependencies, remote dependencies, unsupported formats, oversized resources, and stale panel identities visibly.
- Keep the source model read-only. Preview state is recoverable local UI state only; the change does not define `.nkm`, `.neko3d`, sidecar, scene, or other durable project formats.
- Add a typed Model Preview context handoff that sends the stable source `ResourceRef`, source fingerprint, normalized model facts, current staging snapshot, and bounded preview image to Agent without sending Three.js objects or routing directly to a media provider.
- **BREAKING**: Replace the unused legacy `model-scene` Agent context discriminator with the canonical `model-preview` discriminator. No persisted-data migration is required because the retained workspace has no producer for `model-scene`.
- Keep Three.js and all model loaders inside the Preview Webview. Do not restore Rust Engine `models`, `model-preview`, `scenes`, `viewport`, or `cameras` groups and do not add an alternate native or Extension-host renderer.
- Update Preview manifests, build ownership, localization, package documentation, focused tests, and the real VS Code Webview functional scenario for the new standard-format preview path.

## Capabilities

### New Capabilities

- `standard-3d-model-preview`: Defines fixed-format authorized model loading, browser-only rendering, temporary model/camera/light staging, state isolation, resource disposal, and read-only source behavior in `neko-preview`.
- `model-preview-agent-context`: Defines the typed, identity-bearing handoff of a model source, preview evidence, and staging semantics from Preview to Agent without provider routing or raw runtime-object transfer.

### Modified Capabilities

None.

## Impact

- `packages/neko-preview/package.json`, localization, Extension activation, provider registration, model-specific source projection, and Webview message contracts.
- `packages/neko-preview/packages/webview`: a new Vite entry, Three.js dependency, format loaders, renderer lifecycle, staging UI, screenshot capture, accessibility, and tests.
- `packages/neko-types`: only the minimal cross-extension Model Preview context contract required by `neko.agent.sendContext`; no Scene/Engine DTOs or new project format.
- `packages/neko-agent`: context ingestion/presentation for the new typed payload and deterministic projection to Agent-visible source, image, and semantic staging evidence.
- `scripts`, Turbo/build ownership, VS Code functional fixtures, package documentation, and quality/debt guards that prove removed Engine Model/Scene paths remain absent.
