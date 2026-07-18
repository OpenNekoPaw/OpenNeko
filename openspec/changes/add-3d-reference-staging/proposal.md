## Why

The current 3D Preview treats one staged RGB capture as a generic visual/model reference, so it cannot safely distinguish character or prop appearance, pose, camera, and 720° panoramic scene intent. Creators also need a useful no-source starting point with bundled neutral mannequins and blockout presets, without letting those guide assets leak into appearance conditioning or hiding real source-load failures.

## What Changes

- Reposition the existing Preview-owned Three.js surface as a temporary **3D Reference** staging surface with four explicit reference purposes: appearance, pose, camera, and 720° panoramic scene.
- Add an explicit guide session that can open without a user model and load code-owned, versioned built-in presets such as a neutral articulated mannequin, primitive props, a blockout studio, and a neutral panoramic grid.
- Keep user model and panoramic sources read-only and authorized through existing Preview content-access boundaries; built-in assets remain immutable extension resources and never masquerade as workspace sources.
- Add purpose selection and visible role gating. Guide mannequins can contribute pose and camera controls but cannot contribute appearance; real models and licensed appearance presets may opt into appearance reference explicitly.
- Produce purpose-specific outputs instead of treating one viewport screenshot as every kind of reference: RGB appearance evidence, pose/skeleton or depth control evidence, structured camera data, and panoramic source/orientation data.
- Route pose/depth outputs through the existing media control-image semantics and keep appearance outputs on the reference/IP-Adapter path. Unsupported downstream controls fail visibly and MUST NOT fall back to an appearance reference.
- Reuse the existing Preview model renderer, panoramic authorization, shared UI primitives, resource projection, per-panel identity, capture, and disposal boundaries. Do not add a second renderer owner, persistent 3D project format, or Rust Engine Model/Scene path.
- **BREAKING**: Replace the prelaunch `model-preview` Agent context discriminator with a purpose-aware `3d-reference` contract. The old discriminator and generic-image delivery path must not continue as a successful compatibility fallback; transient contexts are rebuilt from live Preview state.
- Add Extension Development Host functional scenarios for source-model, built-in guide, camera, panorama, output-role isolation, reload, and disposal behavior using only synthetic or bundled fixtures.

## Capabilities

### New Capabilities

- `3d-reference-staging`: Defines explicit source-model and guide sessions, the four reference purposes, temporary pose/camera/environment state, role selection, per-panel identity, and read-only behavior.
- `builtin-3d-reference-presets`: Defines the code-owned preset catalog, immutable bundled assets, stable identity/versioning, license metadata, capability declarations, lazy loading, and appearance-role restrictions.
- `3d-reference-delivery`: Defines purpose-specific capture and semantic outputs, the canonical `3d-reference` Agent context, Canvas/media control routing, provider capability validation, and forbidden appearance fallback.

### Modified Capabilities

None. The prerequisite `add-standard-3d-model-preview` change has not yet been promoted into main specs; this follow-up explicitly replaces its prelaunch `model-preview` context after that change is archived rather than maintaining two canonical context paths.

## Impact

- `packages/neko-preview`: product terminology, explicit guide-panel entry, preset catalog projection, model/panorama Three.js staging, pose and render-pass controls, contextual panels, protocol, capture and lifecycle tests.
- `packages/neko-types`: minimal serializable preset, staging, purpose-output, identity, diagnostic, and `3d-reference` Agent context contracts; removal of successful `model-preview` acceptance.
- `packages/neko-agent`: purpose-aware context validation/presentation, semantic evidence projection, and strict separation between ordinary visual evidence and media control inputs.
- `packages/neko-canvas` and Agent media platform: consume stable pose/depth control resources through existing control-image fields without importing Preview internals.
- Preview packaging: a small audited set of project-owned or CC0 GLB/panoramic assets, license notices, bundle-size limits, and lazy-loaded asset chunks.
- OpenSpec, architecture documentation, localization, manifests, isolated Webview functional fixtures, and quality/debt gates.
