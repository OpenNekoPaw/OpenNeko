## 1. Define canonical contracts and build ownership

- [x] 1.1 Define the versioned Extension/Webview Model Preview protocol, source descriptor, normalized model facts, staging state, capture result, and typed diagnostics from abstract contracts to concrete messages.
- [x] 1.2 Add the canonical `model-preview` `AgentContextType` and `ModelPreviewContextData`, remove `model-scene` from shared and Agent validators/presenters, and add compile/parser poison tests proving the legacy discriminator cannot succeed.
- [x] 1.3 Define the fixed GLB, glTF, OBJ, STL, and PLY adapter table with MTL as an OBJ-only dependency; add tests proving unknown formats cannot register dynamically or fall back to another viewer.
- [x] 1.4 Add `three` and its required types to `@neko/preview-webview`, add the independent `model.html` Vite entry, and update build-ownership tests to prove video/audio/document entries do not import or execute the model runtime.
- [x] 1.5 Add the model custom-editor selector, commands only where needed, activation metadata, localized labels, CSP entry metadata, and manifest tests without adding a new extension dependency or Engine requirement.

## 2. Implement authorized standard-model source projection

- [x] 2.1 Implement stable model source `ResourceRef` and fingerprint creation through existing shared resource/path services, with tests for workspace-relative, variable-root, external authorized-root, missing, and unauthorized sources.
- [x] 2.2 Implement bounded GLB, STL, and PLY primary-source validation and exact `webview.asWebviewUri()` projection without companion-directory authorization.
- [x] 2.3 Implement bounded glTF JSON dependency enumeration for relative buffers and images, preserving embedded `data:` resources while rejecting remote, absolute, traversal, missing, duplicate, excessive, and unsupported dependencies.
- [x] 2.4 Implement bounded OBJ and MTL dependency enumeration for declared material libraries and texture maps, with poisoned fixtures for traversal, remote references, missing materials, and undeclared textures.
- [x] 2.5 Implement the panel-scoped Model Preview source session that authorizes exact enumerated files, emits the source-relative URI map, supports cancellation, and revokes all projections on dispose.
- [x] 2.6 Add focused Extension tests for source-size and dependency-count limits, MIME/extension mismatch, stale sessions, cancellation during inspection, exact URI mapping, and visible diagnostics without Engine or external Viewer fallback.

## 3. Add the Preview Extension composition path

- [x] 3.1 Implement `ModelPreviewProvider` as a `CustomReadonlyEditorProvider` with explicit `sessionId`, source fingerprint, staging revision, cancellation scope, message channel, and disposables per open panel.
- [x] 3.2 Implement typed ready/load/state/capture/send/error message routing and reject missing, mismatched, stale, disposed, or cross-panel identities without active-editor fallback.
- [x] 3.3 Implement compatible recoverable Preview state keyed by source fingerprint and staging schema version; reject incompatible state instead of loosely migrating or applying defaults over stale edits.
- [x] 3.4 Register and dispose the provider from the Preview Extension composition root, preserving lazy Engine activation rules and proving model preview never creates `PreviewService` or dispatches Engine model/scene actions.
- [x] 3.5 Add provider lifecycle tests covering two simultaneous model panels, independent state, reload, close-during-load, late messages, idempotent dispose, and panel-visible failure projection.
- [x] 3.6 Make close/cancel during asynchronous editor resolution a terminal lifecycle state: release partial resources and never read, write, or post to a disposed Webview.

## 4. Build the isolated Three.js model Webview

- [x] 4.1 Define a fakeable Three runtime port and implement the panel-owned renderer, scene, loading manager, camera, controls, resize/pixel-ratio policy, animation loop, and error boundary behind that port.
- [x] 4.2 Implement GLTFLoader, OBJLoader/MTLLoader, STLLoader, and PLYLoader adapters using the exact Extension-provided URL mapping; reject unresolved URLs rather than issuing network or directory-probing requests.
- [x] 4.3 Implement model bounds calculation, canonical default framing, normalized model facts, empty/invalid-scene diagnostics, and deterministic source-load state transitions.
- [x] 4.4 Implement stable node-path inspection and temporary TransformControls patches without storing Three.js objects in React/shared state or modifying source bytes.
- [x] 4.5 Implement recursive disposal for geometry, materials, textures, render targets, loaders, controls, renderer, animation frames, listeners, and in-flight loads; add deterministic fake-runtime lifecycle tests.

## 5. Add temporary staging and bounded capture

- [x] 5.1 Implement the versioned `ModelPreviewStagingState` store with selected node, serializable transform patches, monotonically increasing revision, background, capture settings, and explicit source/session identity.
- [x] 5.2 Implement multiple temporary camera presets with stable camera identity, active-camera selection, framing controls, and independent panel state.
- [x] 5.3 Implement one temporary light rig with environment and key/fill/rim-equivalent entries, bounded parameters, canonical defaults, and deterministic scene projection.
- [x] 5.4 Build the fixed model staging UI from existing `@neko/ui` primitives, including keyboard/focus handling, accessible labels/states, localized diagnostics, loading/empty/error views, and clear read-only-source messaging.
- [x] 5.5 Implement bounded untainted PNG capture with exact staging identity, camera/light/transform metadata, configured dimension limits, and visible failure for stale revisions, invalid dimensions, renderer loss, or capture errors.
- [x] 5.6 Add Webview tests for staging serialization, camera/light/transform behavior, accessibility, source-byte immutability, stale state, capture validation, and multiple independent panel roots.
- [x] 5.7 Make canonical front framing the initial/reset pose and project camera presets differentially so non-camera inspector changes preserve the live orbit position, target, and distance; advance incompatible recoverable staging explicitly and add red/green regressions.
- [x] 5.8 Add the bounds-scaled ground grid, live screen-space XYZ orientation indicator, and updated accessible bottom toolbar with panel-local guide toggles; verify the real external development GLB in the Extension Development Host.
- [x] 5.9 Project one package-local scene/camera/node hierarchy selection, add accessible camera edit/duplicate/view/remove operations, and render/dispose a capture-excluded camera helper without changing source bytes or the shared staging shape.
- [x] 5.10 Refactor the right inspector into contextual scene, camera, and node panels using existing `@neko/ui` property primitives; add regression coverage and verify switching/editing with the external development GLB without resetting the live orbit view.
- [x] 5.11 Restyle the viewport controls as a Canvas-aligned bottom-centered horizontal pill-shaped floating toolbar using shared toolbar primitives, preserve all existing actions and accessible states without an extra edge highlight, and verify the external development GLB in the Extension Development Host.

## 6. Deliver canonical Model Preview context to Agent

- [x] 6.1 Materialize a validated capture through the existing rebuildable preview/cache resource boundary and return a stable preview-image `ResourceRef` without persisting Webview URIs, authorization tokens, raw absolute user paths, or source binaries.
- [x] 6.2 Implement the pure Model Preview context builder and validate that source ref, preview ref, fingerprint, contract version, model facts, staging snapshot, session identity, and revision all describe one live projection.
- [x] 6.3 Implement the Extension bridge ending at `neko.agent.sendContext`, retain staging for retry, and surface correlated panel diagnostics when Agent is unavailable or rejects delivery.
- [x] 6.4 Update Agent protocol parsing, context presentation, reference tokens, conversation chips, and multimodal input projection for `model-preview`, using the preview image as visual evidence and the source model as a stable referenced resource.
- [x] 6.5 Add Agent tests proving model binaries never enter generic text attachment reading, Preview never supplies provider/model routing, unsupported native 3D provider input cannot trigger upload or fallback, and `model-scene` is rejected.
- [x] 6.6 Add path-level spies/poison guards proving the successful flow is Preview session → bounded capture resource → `model-preview` context → Agent projection, with no Engine, legacy context, external Viewer, generic file reader, or direct media-provider participation.

## 7. Validate real Webview and Agent boundaries

- [x] 7.1 Add isolated synthetic GLB, glTF bundle, OBJ/MTL, STL, PLY, unsafe dependency, oversized, and invalid model fixtures that contain no user workspace data or external network dependencies.
- [x] 7.2 Run focused Preview Extension/Webview and shared/Agent tests, TypeScript checks, production Preview compilation, CSP tests, manifest/build-ownership tests, content-access guards, and recursive-disposal regressions.
- [ ] 7.3 Add and run a `neko-preview` Extension Development Host functional scenario that opens the synthetic GLB, proves the model Webview/Three path, changes camera and lights, captures the staged view, sends it to Agent, observes the canonical context chip/evidence, and asserts no runtime/CSP/console/Engine errors.
- [ ] 7.4 Record the Agent Evaluation authoring decision for host-private Model Preview context ingestion as `excluded` from real TUI behavior evaluation, with deterministic Preview/Agent protocol tests and the real VS Code scenario as evidence; run `pnpm test:agent:eval` for key-free harness integrity and do not claim it as behavior acceptance.
- [x] 7.5 Revisit the Evaluation disposition and create or update `agent-runtime.creative-media-workflow` with one canonical and one failure case if implementation adds Agent reasoning, Tool/capability routing, provider selection, or TUI-observable behavior beyond deterministic context projection.
- [x] 7.6 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, strict OpenSpec validation, and `git diff --check`; record blocked commands, report paths, no-fallback evidence, and residual risk without treating dry-runs or target discovery as acceptance.
- [x] 7.7 Keep the ordinary external-workspace `Debug Dev (All)` launch free of missing functional-runner extension paths and validate every local Extension Development Host path after parsing its argument prefix.

## 8. Synchronize documentation and delivery evidence

- [x] 8.1 Update Preview README, architecture, supported-format tables, localization, commands, package description, and source-read-only/staging/Agent handoff documentation in Chinese and corresponding English text where semantics change.
- [x] 8.2 Update system package-boundary or retained-product documentation only where the stable Preview responsibility changes, explicitly preserving the pruned Rust Engine Model/Scene boundary and absence of new model project formats.
- [x] 8.3 Record the final format matrix, design/reuse audit, actual validation commands and results, VS Code functional evidence, Evaluation disposition, dependency/bundle impact, blocked checks, and remaining risks in the change verification material.
