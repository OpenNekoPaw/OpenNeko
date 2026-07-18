## Context

`neko-preview` currently owns authorized read-only GLB/glTF/OBJ/STL/PLY preview, panel-local camera/light/transform staging, bounded RGB capture, and one `model-preview` Agent context. It separately owns panoramic image/video preview routing. Canvas and the Agent media platform already distinguish ordinary/IP-Adapter references from pose/depth/etc. control images, but Model Preview currently sends one staged RGB image as generic visual evidence.

The desired product surface is broader: 3D Preview is the user's 3D reference staging surface for four independent purposes—character/prop appearance, pose, camera, and 720° panoramic scene. A creator may begin from a real model, from a small bundled preset catalog, or from an environment-only scene. A neutral mannequin must be useful for pose and camera while being technically incapable of entering an appearance-reference path.

This is an L3 cross-cutting change across Preview Extension/Webview, shared contracts, Agent context ingestion, Canvas/media request projection, packaging, content authorization, and real Webview acceptance. It builds on `add-standard-3d-model-preview` and the accepted Avatar Preview runtime ADR, but it does not add durable 3D authoring, a new product package, or a Rust Engine rendering path.

### Five-layer analysis

- **Responsibility:** Preview owns the temporary 3D reference session, bundled catalog, authorized sources, Three.js projection, purpose outputs, cancellation, and disposal. Agent owns interpretation and provider/model capability negotiation. Canvas owns generation-control UI and Canvas-originated requests. Assets owns user-imported asset identity; bundled presets remain immutable Preview distribution resources.
- **Dependency:** Preview, Canvas, and Agent share only minimal L0 contracts. No feature package imports another feature package's internals. Webviews reuse `@neko/ui` primitives and shared theme tokens. Three.js remains in the Preview model entry. Rust Engine remains outside model/scene authority.
- **Interface:** Identity-bearing discriminated unions represent session subject, preset metadata, reference purposes, purpose outputs, staging revision, and diagnostics. Extension/Webview messages never expose local paths or renderer objects.
- **Extension:** New presets are added only through the audited code-owned catalog. New reference purposes require contract/spec changes rather than string metadata. Future durable scenes, arbitrary asset libraries, or provider-native 3D inputs require separate changes.
- **Testing:** Pure catalog, contract, role-routing, pose, camera, and capability-negotiation tests precede implementation. Production build ownership and a synthetic Extension Development Host scenario prove lazy assets, CSP, resource projection, interaction, exact outputs, and disposal.

## Goals / Non-Goals

**Goals:**

- Present one coherent 3D Reference UI with source-model, bundled-guide, and environment-only sessions.
- Support independently selected appearance, pose, camera, and panoramic scene outputs.
- Provide a small licensed built-in catalog with an abstract articulated mannequin, blockout props/studio, and neutral panorama guide.
- Guarantee that guide-only assets and pose/depth outputs cannot reach appearance/IP-Adapter paths.
- Reuse existing Preview authorization, Three.js runtime, panorama handling, capture, shared UI, Agent context, Canvas control, and media capability boundaries.
- Keep every session isolated, recoverable, source-read-only, fail-visible, bounded, and disposable.

**Non-Goals:**

- Saving poses, cameras, panoramas, materials, or scenes as a new project/sidecar format.
- General rigging, mesh/material editing, animation timelines, keyframes, physics, or final rendering.
- Automatically rigging arbitrary models or guessing humanoid semantics from mesh/bone names.
- Bundling a marketplace-sized model library or discovering presets dynamically from directories.
- Sending guide RGB captures as character appearance, selecting providers in Preview, or bypassing media capability negotiation.
- Restoring removed Rust Engine Model/Scene APIs or introducing Unity/native rendering.

## Decisions

### Keep one Preview-owned 3D Reference surface

The user-facing surface remains in `neko-preview` because Preview already owns authorized model/panorama projection, Three.js, temporary camera/light staging, capture, Webview lifecycle, and Agent handoff. Canvas and Agent consume typed outputs; they do not embed or import Preview's renderer.

Alternative: move guide authoring into Canvas. Rejected because it would add a second Three.js/runtime/resource owner, inflate Canvas ownership, and force duplicate panorama/model authorization. The guide remains non-durable temporary staging, which stays compatible with Preview's read-only source boundary.

### Make session subject mode explicit rather than using fallback

The session begins with one discriminated subject:

```ts
type ThreeReferenceSubject =
  | { kind: 'source-model'; source: ResourceRef; fingerprint: string; format: ModelFormat }
  | { kind: 'builtin-preset'; presetId: string; presetVersion: number; fingerprint: string }
  | { kind: 'environment-only' };
```

Opening a guide is an explicit command/action. A failed real source remains failed. The runtime never catches a missing or invalid model and substitutes a mannequin, because that would hide defects and change reference semantics.

### Model the four purposes as capabilities and selected outputs

Purposes are a set, not one session-wide enum, because a real model may contribute appearance and pose while the same session contributes camera and panorama. The active subject/environment declares eligible purposes; the creator selects a subset for delivery. UI badges and disabled controls project this contract.

Guide-only presets omit `appearance` at the catalog level. That restriction is checked again when constructing capture outputs, Agent context, Canvas projection, and media requests. Repeated checks are justified because these are separate trust/serialization boundaries, not internal fallback guards.

### Use purpose-specific outputs, not one generic screenshot

The canonical output is a discriminated union:

```ts
type ThreeReferenceOutput =
  | { kind: 'appearance'; image: ResourceRef; source: ResourceRef }
  | { kind: 'pose'; controlImage: ResourceRef; controlMode: 'pose' | 'depth'; joints: JointPose[] }
  | { kind: 'camera'; camera: CameraReference; compositionImage?: ResourceRef }
  | {
      kind: 'panorama-scene';
      panorama: ResourceRef;
      orientation: PanoramaOrientation;
      viewportImage?: ResourceRef;
    };
```

The interactive shaded viewport is not itself an appearance reference. Only an explicitly constructed `appearance` output can enter ordinary visual/IP-Adapter fields. Pose/depth outputs bind to media control fields. Camera and panorama preserve their structured semantics. This closes the ambiguity that cannot be solved with UI copy alone.

Alternative: add a free-form `intent` string to the existing capture. Rejected because consumers could ignore it and continue routing every PNG as appearance.

### Replace the prelaunch model-preview context with 3d-reference

The generalized payload uses the `3d-reference` discriminator and a new contract version. The transient `model-preview` path is removed/poisoned inside the replacement boundary before the new producer is accepted. There is no persisted conversation/project migration; live Preview staging rebuilds new context.

Alternative: keep `model-preview` and add `3d-guide`. Rejected because two nearly identical capture/session bridges would create competing canonical paths and ambiguous consumer behavior.

#### Exact transient-state migration contract

- The new Webview/Extension state key and schema start at `THREE_REFERENCE_STAGING_SCHEMA_VERSION = 1`. The implementation MUST NOT read or write the previous `modelPreviewStaging` shape as a `3d-reference` snapshot, and it MUST NOT translate an old revision into a new revision.
- An already open source-model or panorama panel may rebuild a fresh revision-0 3D Reference session only from its still-live, authorized source descriptor. The rebuild copies the source `ResourceRef` and fingerprint as source identity; camera, pose, purpose selection, output resources, and old capture state are reconstructed from new defaults or explicit current user actions.
- Reloaded or reopened panels re-inspect the original user-selected model/panorama through the normal authorization boundary. User source files and resource identities remain untouched; rebuildable capture/cache artifacts are not migrated.
- A `3d-reference` context whose contract version or staging schema version is unknown is rejected. A removed `model-preview` context is also rejected. Neither case is mapped, dual-read, dual-written, attached as a generic image, or reported as a successful send.
- State rejection is visible through the typed version/protocol diagnostic at the owning boundary. It may offer the user a fresh session, but it cannot silently substitute a built-in guide for a failed real source.

### Use a fixed, audited, immutable preset catalog

#### Mannequin feasibility decision (2026-07-19)

The bounded spike at `packages/neko-preview/packages/webview/scripts/three-reference-preset-feasibility.mts` compares a corrected Preview-owned procedural mannequin against one externally downloaded, fingerprint-pinned rigged GLB. The external input is Khronos `RiggedSimple` (`CC-BY-4.0`, © 2017 Cesium, SHA-256 `3a79dabb67bb0cd598a18d08b954d9d357c27c30672f82ef5d3f4e7fe6ca3401`); it is never copied into the repository or selected as a product preset.

Measured on Node `v25.6.1`, macOS arm64, over 25 construction/parse samples after five warmups; timing below is the observed median range across three isolated runs:

| Criterion                                |                                                  Corrected procedural candidate |                           Audited `RiggedSimple.glb` |
| ---------------------------------------- | ------------------------------------------------------------------------------: | ---------------------------------------------------: |
| Additional packaged binary bytes         |                                                                               0 |                                               15,104 |
| Median construct/parse time              |                                                                  0.898–1.022 ms |                                       0.575–0.678 ms |
| Meshes / triangles                       |                                                                        15 / 560 |                                              1 / 188 |
| Skin/bones                               |                                         explicit pivot hierarchy / 0 glTF bones |                                     1 skin / 2 bones |
| Required humanoid landmark coverage      |                                                                           16/16 |                                                 0/16 |
| Constrained pose changes target landmark |                                                                             yes |                      no compatible humanoid landmark |
| Production recursive disposal            |                          15 geometries and all material dispose events observed |     1 geometry and 1 material dispose event observed |
| Render-quality proxy                     | complete neutral head/torso/limb silhouette, intentionally no appearance detail | valid skinning-test shape, not a humanoid silhouette |

Decision: use corrected project-owned procedural geometry for the initial neutral mannequin. Its stable named pivots directly satisfy pose output and landmark contracts, it adds no binary asset/license payload, and it is structurally incapable of supplying detailed appearance. `RiggedSimple` remains useful evidence that the loader and recursive disposer handle a real skin, but its two-bone test geometry is not a viable mannequin. Actual supported-host render appearance and load/disposal acceptance remain required in tasks 2.5 and 7.2; this Node metric is a feasibility comparison, not Webview visual acceptance.

Reproduction downloads the audited input outside the repository and runs:

```bash
pnpm --dir packages/neko-preview/packages/webview exec tsx scripts/three-reference-preset-feasibility.mts /tmp/neko-3d-reference-spike/RiggedSimple.glb
```

Preview Extension owns a code-declared catalog with preset ID/version, packaged fingerprint, kind, allowed purposes, scale, capability descriptor, asset path, provenance, and license. Staging stores only identity/version. Extension projects exact bundled files with `webview.asWebviewUri()` and sends identity-bearing URIs; Webview never guesses paths.

The first catalog is intentionally small:

1. one abstract articulated neutral mannequin;
2. primitive/blockout prop set;
3. simple room/studio blockout;
4. neutral panoramic orientation grid;
5. optional project-authored or redistribution-safe appearance example, clearly separated from guide assets.

The existing `generateHumanoidGlb` helper remains only a historical feasibility reference: its ownership and node-attached mesh behavior do not satisfy the selected runtime-pivot contract. Production implements the corrected candidate inside Preview's preset runtime rather than importing that L1 template or reviving a removed model-project path.

Alternative: runtime catalog registration or asset-directory discovery. Rejected until a real external preset provider and trust/install lifecycle exist.

### Keep presets lazy and model-entry-owned

Preset assets are emitted as model-entry assets or copied through one explicit Preview packaging step and fetched only after selection. Model, audio, video, document, and panorama-only entry ownership tests prove unrelated entries do not decode or instantiate the catalog. Implementation records actual binary sizes, load timings, renderer memory observations where available, and disposal evidence before choosing the default package budget.

Compressed decoders are not introduced solely for the initial low-poly catalog. Adding Draco/Meshopt/KTX2 requires an explicit CSP, worker/asset distribution, dependency, and disposal decision.

### Reuse panorama and content-access boundaries without reusing provider lifecycle

3D Reference extracts/reuses package-local panorama detection/authorization helpers and shared content-access projection. It does not instantiate `PanoramicImagePreviewProvider` inside `ModelPreviewProvider` or create nested custom editors. The Three runtime consumes an exact authorized equirectangular resource and owns only temporary environment texture/projection state.

### Keep pose semantics declared and bounded

Built-in mannequin metadata declares stable joint IDs, hierarchy, constraints, landmarks, and compatible presets. Arbitrary source models expose pose only when an explicit adapter can produce the same stable descriptor (for example a future VRM humanoid adapter); node-name heuristics do not create durable semantics. Static models keep object transforms but cannot claim pose.

Initial pose authoring is preset selection plus constrained joint rotations and reset. It does not add animation tracks, keyframes, IK solvers, retargeting, physics, or source writeback.

### Reuse shared UI primitives while keeping domain composition local

Preview reuses the current shared floating toolbar, tree shell, property rows, axis controls, sliders, segmented controls, badges, empty states, focus/keyboard boundaries, theme tokens, and i18n runtime. 3D-reference source/purpose/preset/pose panels stay package-local typed components; they do not create a generic UI schema or copy a design system.

### Preserve downstream capability negotiation

Preview constructs validated context but never chooses a provider or submits generation. Agent/Canvas map pose/depth outputs to existing `controlImage` fields, appearance to explicit reference fields, and camera/panorama to declared semantic controls. The media platform validates the selected provider/model before submission. Unsupported controls fail visibly; no prompt-only, ordinary-image, other-provider, or dropped-control fallback can report success.

### Materialize captures inside the owning workspace

Purpose capture PNGs are rebuildable resources and are written under the owning workspace's `.neko/.cache/resources/three-reference-captures/` directory before PreviewAsset registration. Source-model and panoramic sessions select the workspace that owns their authorized source; a single-root guide session uses that root. A session with no workspace, or a guide session whose multi-root workspace cannot be selected unambiguously, fails visibly before writing bytes.

VS Code `globalStorageUri` is not a valid handoff location for these captures: it is private to Preview and is outside Agent's authorized workspace roots. The fix does not broaden local-file authorization or introduce a second cache manager; it places the rebuildable source in the existing workspace cache boundary and continues to hand consumers a stable `ResourceRef`.

## Risks / Trade-offs

- [A shaded mannequin may still visually bias appearance] → ship an abstract untextured form, disable appearance in catalog and contract, generate skeleton/depth control passes, and never route its viewport RGB as appearance.
- [The broader Preview surface resembles authoring] → keep all state temporary/recoverable, prohibit project formats and source writeback, and require a separate proposal for durable scenes or animation timelines.
- [Preset binaries increase package size] → keep the initial catalog small, lazy-load exact assets, record measured bundle/runtime impact, and gate additional assets on explicit budget review.
- [Third-party models introduce license and supply-chain risk] → prefer project-authored or CC0 assets and require catalog-to-notice validation before packaging.
- [Arbitrary source models lack stable humanoid semantics] → expose pose only from declared adapters/capability descriptors and reject guessed bone mappings.
- [Panorama textures can be large or taint capture] → reuse exact authorization, bounded size/MIME checks, local Webview projection, explicit disposal, and capture-origin validation.
- [Four purposes can confuse creators] → display active role chips at source selection, staging, send action, Agent context, and Canvas generation controls; default purposes derive from declared capabilities but never override explicit selection.
- [Replacing model-preview can break transient fixtures] → poison the legacy discriminator, migrate producers/consumers/tests in one boundary, and rebuild live contexts rather than adding compatibility mapping.

## Migration Plan

1. Finish and archive `add-standard-3d-model-preview` as the prerequisite source-model preview slice, retaining its incomplete functional-scenario warning if explicitly accepted.
2. Add the new shared `3d-reference` contracts and red parser/compile poison tests, then remove successful `model-preview` acceptance inside the scoped replacement boundary.
3. Add catalog/provenance schemas and a synthetic procedural or bundled mannequin feasibility fixture before committing production assets.
4. Extend the existing Preview provider/Webview protocol with explicit session subject, purposes, preset descriptors, panorama environment, pose state, and purpose-specific captures.
5. Add role-gated UI and package-local pose/preset/environment composition using existing shared primitives.
6. Migrate Agent/Canvas/media consumers to purpose-specific outputs and prove control/reference routing plus unsupported-provider failure.
7. Add package ownership, license, size, CSP, disposal, focused tests, and isolated Extension Development Host scenarios before enabling the entry by default.

Rollback removes the guide entry/catalog and `3d-reference` producer/consumer changes, then restores the last archived source-model Preview code only through an explicit revert. It does not retain both context discriminators or fallback paths. User model/panorama sources remain untouched; preset and capture resources are immutable or rebuildable.

## Open Questions

- Should the first production mannequin be project-authored procedural geometry or an audited CC0 rigged GLB? Resolve through a bounded feasibility task measuring pose ergonomics, landmark output, asset size, and load/disposal behavior.
- Which provider/model combinations currently declare reliable pose, depth, camera, and panoramic controls? Implementation must inventory actual capability profiles before deciding default delivery selections.
- Should appearance-capable built-in examples ship in the initial catalog, or should the first release contain guide-only assets? Default recommendation is guide-only until licensing, package budget, and user-value evidence justify appearance examples.
