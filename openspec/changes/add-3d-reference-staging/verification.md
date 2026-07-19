# Verification: add-3d-reference-staging

Date: 2026-07-20

This is the current implementation evidence. Downstream Canvas/Agent/media routing, repository gates, and stable architecture documentation are complete; the change remains active for owning Preview Extension Development Host scenarios.

## Design and reuse audit

- Preview owns temporary 3D reference sessions, immutable built-in guide metadata, exact local-resource authorization, Three.js projection, purpose captures, cancellation, and recursive disposal.
- Existing `ModelPreviewProvider`, `LocalResourceAccessService`, `PreviewService`, shared `ResourceRef`, shared UI primitives, theme tokens, and i18n runtime are reused. No second design system, path resolver, cache manager, Engine client, panorama provider lifecycle, or durable 3D project was introduced.
- `3d-reference` is the only successful replacement context. Legacy `model-preview` parsing and generic-image fallback are poisoned inside this boundary.
- Built-in guide geometry is project-authored and procedural. It is structurally restricted to pose/camera guidance and cannot produce appearance output.

### Bottom creation refinement

- Camera and directional-light creation reuse the existing shared `Popover`, `ToolbarButton`, floating-toolbar, theme, focus, keyboard, and i18n primitives through one package-local creation-menu composition. No package-local design system, alternate scene registry, or new Extension/Webview message was introduced.
- Camera creation offers six fixed normalized placements: front, front-left, front-right, left, right, and rear. Light creation offers seven fixed normalized placements: front-left, front-right, left, right, rear-left, rear-right, and overhead. Opening a menu does not mutate staging; selection adds exactly one deterministic panel-local entry and closes the menu.
- The object menu now exposes `guide-blockout-cube`, `guide-blockout-sphere`, and `guide-blockout-cylinder` as separate immutable catalog choices. Each runtime constructs exactly one mesh and replaces the single primary-subject slot through the existing validated preset request.
- The removed `guide-primitive-blockout-props` / `primitive-blockout-props-v1` success path remains only in poison assertions. No compatibility mapping, combined-shape fallback, dual catalog identity, or hidden retained primitive is present.
- Menu items retain `role="menu"` / `role="menuitem"`; ArrowUp, ArrowDown, Home, and End move focus across enabled choices. Focused UI coverage proves selection, menu closure, exact preset requests, deterministic camera/light identity, and absence of the removed combined preset.

## Built-in catalog and production bundle

Production build command:

```text
pnpm --dir packages/neko-preview compile:webview
pnpm --dir packages/neko-preview copy:webview
```

Measured output:

| Item                               |       Raw |      Gzip | Notes                                                                                               |
| ---------------------------------- | --------: | --------: | --------------------------------------------------------------------------------------------------- |
| `assets/model.js`                  | 947.10 kB | 251.64 kB | Only `model.html` loads the 3D entry; includes fixed creation menus and separate primitive runtimes |
| Built-in preset binaries           |       0 B |       0 B | Mannequin, props, studio, and panorama grid are project-authored procedural geometry                |
| Catalog aggregate binary increment |       0 B |       0 B | No Draco, Meshopt, KTX2, worker, or third-party model payload                                       |

Compared with the previous `933.67 kB / 248.58 kB gzip` checkpoint, this refinement adds approximately `13.43 kB` raw and `3.06 kB` gzip to the model entry. It adds no binary asset payload and does not change non-model entry ownership.

`buildOwnership.test.ts` proves every non-model HTML entry points to its own main module and contains no model entry or `model.js` reference. Catalog validation proves immutable identity/capabilities/dependencies/provenance/license notices. All current presets use `LicenseRef-OpenNeko` with project-owned redistribution metadata.

### Adult/child mannequin and pose checkpoint

- The former `guide-neutral-mannequin` production identity is rejected. The immutable catalog now exposes project-authored adult-female, adult-male, and child variants with distinct body proportions and no identity, clothing, texture, or third-party binary model payload.
- Each variant is assembled from smooth capsule/ellipsoid anatomy around the same declared 16-joint hierarchy. Catalog validation requires exact parent links, bounded rotations, and complete joint values for every preset.
- Twelve pose presets are supplied: standing, T-pose, walking, running, jumping, sitting, crouching, kneeling, falling, waving, thinking, and fighting. Pose cards project their actual rotations into SVG thumbnails; selection sends the complete joint array to the runtime and temporary staging state.
- Manual joint editing is grouped by whole body, torso, head, arms, and legs, and remains bounded by catalog constraints. Static/non-articulated subjects retain an explicit unsupported state. No IK, timeline, retargeting, multi-character staging, or source writeback was added.
- Runtime tests construct and recursively dispose all three variants, assert smooth vertex normals and variant bounds, validate the complete hierarchy and constraints, and reject unknown, duplicate, incomplete, and out-of-range poses.

## Extension Development Host evidence

Earlier guide/source-model evidence was collected in a VS Code Extension Development Host on macOS through the repository `vscode-extension-debugger` workflow. On 2026-07-20, `node "$CDP_CLIENT" --port 9222 preflight` failed with `Port 9222 is reachable but is not a VS Code CDP endpoint: no VS Code workbench page target was found.` The Skill treats this as a hard gate and forbids listing targets, launching/restarting VS Code, or substituting Browser/Vite, so new creation-menu and camera/light acceptance remains blocked below.

### Built-in no-source guide

- Invoked `neko.preview.openThreeReferenceGuide` in the running Development Host.
- Observed guide-only notice, disabled appearance purpose, enabled pose/camera purposes, pose preset/joint controls, ground grid, XYZ indicator, and purpose capture controls.
- Runtime facts: 32 nodes, 15 meshes, 1 material, 0 animations.
- Cached production resource timings: `model.js` 17 ms, shared React chunk 4 ms; decoded model entry size 908,183 bytes.
- Pose skeleton preview rendered without editor chrome. After a real Extension Host reload, no capture-runtime diagnostic was produced; the earlier diagnostic came from a retained pre-build provider instance and did not reproduce on the rebuilt canonical path.

### External real model

- Used only `~/Git/neko-test/test.glb` (33,859,320 bytes). The model was never copied into this repository or a repository fixture.
- Initial view was front-facing and framed the complete character.
- Observed 39 model nodes, 37 meshes, 37 materials, 0 animations; black clothing, textured garments, hair, accessories, limbs, and tail were present.
- Orbiting to a side angle preserved model content and material color. Reset returned to the front view. Ground grid and XYZ indicator remained visible.
- External GLB resource load measured 170 ms in the supported host (cached transfer size is unavailable; decoded size was 33,859,320 bytes).
- Closing the editor removed the Preview Webview CDP target within the first 500 ms poll. Provider/runtime unit tests additionally assert idempotent recursive disposal and simultaneous-panel isolation.
- Console inspection reported no Preview runtime errors; the only message was VS Code's unrelated `local-network-access` feature warning.
- Capturing appearance and camera outputs materialized two 140,949-byte PNGs under the external workspace's `.neko/.cache/resources/three-reference-captures/` directory. No new capture was written to Preview `globalStorageUri`, and the previous “File access path outside allowed roots” diagnostic did not recur.
- Starting from the canonical empty Agent entry state (`activeTabId: null`, no open tabs), Preview created and bound a local conversation before context injection. The Agent Webview displayed one `3d-reference` chip with `appearance · camera`, no alert, and no recurrence of “Cannot send context payload without an active conversation Tab.” No provider request was submitted during this acceptance check.
- Reproduced camera-only handoff failure in the Development Host: with appearance and camera enabled, clicking only “Capture Camera Reference” left Agent with zero contexts. The red collector regression proved `deliverContext` received zero calls because it waited for every enabled purpose. The collector now emits an action-scoped context immediately, with no cross-action pending map. After rebuild/reload, camera capture produced a `camera` chip; a later appearance capture produced a separate `appearance` chip, and both remained visible without alerts. No provider request was submitted.
- The Preview toolbar uses the shared floating-toolbar compact density rather than package-local button styling. Development Host measurement changed from 383 × 54 px with 36 px buttons to 307 × 44 px with 30 px buttons; the horizontal pill shape, active-button indicator, theme tokens, keyboard boundary, and tool ordering were preserved.
- Preview and Canvas now consume the same neutral `@neko/ui/icons` SVG family for viewport actions. With `~/Git/neko-test/test.glb` open, Development Host inspection found 8/8 Preview toolbar icons at 18 × 18 px with a `0 0 24 24` view box and zero Codicon glyphs; the Canvas pointer reported the same geometry and active theme color. The Preview toolbar remained 307 × 44 px and the model loaded successfully.

### Camera and directional-light object controls implementation checkpoint

- The fixed key/fill/rim rig remains three `DirectionalLight` instances. No point-light attenuation, add/remove operation, shadow authoring, durable scene state, or source writeback was added.
- Preview now exposes a Lights tree group and one selected-light inspector with shared tree, panel, slider, color, axis, theme, icon, and i18n primitives. Camera selection renders an orange camera body with its frustum; light selection renders a role-colored solid light object with its direction arrow.
- Camera and light objects use one panel-owned `DragControls` instance for direct camera-facing-plane pointer drag. They never attach to the XYZ `TransformControls` gizmo, which remains reserved for model nodes. Hover and drag pause orbit navigation, and drag end restores it.
- Camera and light positions round-trip through subject-bounds-normalized coordinates. Drag changes update the live camera frustum or direction light/arrow; drag end advances the existing temporary panel revision without changing source bytes or model-transform contracts.
- Runtime objects, arrows, camera frusta, grid, and transform gizmos are excluded from captures and their prior visibility is restored even if capture throws. Handle geometry, materials, controls, and listeners are detached and disposed with the model/runtime lifecycle.
- Focused automated coverage passes, but this checkpoint has not been accepted in an Extension Development Host: port 9222 is reachable but exposes no VS Code workbench target, and the debugger workflow forbids launching or restarting VS Code to replace it. Task 5.8 therefore remains open. When a verified endpoint is available, acceptance must use only `~/Git/neko-test/test.glb` without copying it into this repository.

Manual screenshots were kept outside the repository at `/tmp/neko-3d-reference-test-glb-latest.png`, `/tmp/neko-3d-reference-test-glb-rotated.png`, `/tmp/neko-3d-reference-builtin-guide.png`, and `/tmp/neko-preview-shared-svg-toolbar.png`.

## Focused validation completed

```text
pnpm exec vitest run packages/neko-preview/packages/extension/src/__tests__/webviewHtmlCsp.test.ts packages/neko-preview/packages/webview/src/model/buildOwnership.test.ts
# 2 files, 19 tests passed

pnpm --dir packages/neko-preview build
# extension.js 691.8 kB; copied the current Webview production assets

pnpm --dir packages/neko-preview compile:webview
# production Vite build passed; model.js 908.18 kB / 242.46 kB gzip

pnpm --dir packages/neko-preview exec vitest run packages/extension/src/providers/model/threeReferenceCaptureMaterialization.test.ts packages/extension/src/providers/model/ThreeReferenceOutputCollector.test.ts packages/extension/src/__tests__/extension.test.ts
# 3 files, 25 tests passed

pnpm --dir packages/neko-preview compile:extension
# production Extension bundle passed; extension.js 693.3 kB

pnpm --dir packages/neko-preview exec vitest run packages/extension/src/providers/model/ThreeReferenceOutputCollector.test.ts packages/webview/src/model/ModelViewer.test.tsx
# 2 files, 8 tests passed

pnpm --dir packages/neko-types exec vitest run src/theme/tokens.test.ts
# 1 file, 3 tests passed

pnpm --dir packages/neko-preview compile:webview
# production Webview build passed; model.js 908.21 kB / 242.47 kB gzip

pnpm exec vitest run src/icons/viewport.test.ts
# neko-types shared viewport icon contract: 1 file, 1 test passed

pnpm exec vitest run src/__tests__/public-entrypoints.test.ts
# @neko/ui public icon entrypoint: 1 file, 1 test passed

pnpm exec vitest run src/model/ModelViewer.test.tsx
# Preview toolbar SVG path and interactions: 1 file, 5 tests passed

pnpm exec vitest run src/components/toolbar/CanvasToolbar.test.tsx
# Canvas shared pointer consumption and toolbar behavior: 1 file, 8 tests passed

pnpm --filter @neko/preview-webview build
pnpm --filter @neko-canvas/webview build
pnpm --filter neko-preview build
# Preview Webview, Canvas Webview, and packaged Preview Extension builds passed

pnpm check
# Knip and dependency-cruiser passed; 1,549 modules / 5,533 dependencies, no violations

pnpm exec vitest run packages/neko-agent/packages/agent/src/runtime/__tests__/message-runtime.test.ts
# 1 file, 68 tests passed

pnpm exec vitest run packages/neko-agent/packages/extension/src/chat/message/__tests__/attachmentProcessor.test.ts packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts
# 2 files, 45 tests passed

pnpm exec vitest run packages/neko-agent/packages/webview/src/presenters/__tests__/reference-token-presenter.test.ts packages/neko-agent/packages/webview/src/components/ChatView/InputArea/AgentContextChip.test.tsx
# 2 files, 9 tests passed

pnpm --dir packages/neko-agent run compile
# production Agent Extension and Webview builds passed

pnpm build
# passed: 10/10 Turbo build tasks, including Preview, shared theme consumers, Agent/Canvas Webviews, and Rust release/N-API builds

pnpm check
# passed: knip plus dependency-cruiser; 1,549 modules / 5,533 dependencies, no dependency violations

pnpm exec vitest run
# Preview Webview: 14 files / 53 tests passed, including camera/light object construction, direct-drag routing without XYZ controls, normalized coordinates, staging revision, and capture-helper exclusion

pnpm --filter @neko/ui test -- --run
# shared UI: 35 files / 149 tests passed

pnpm build
# latest checkpoint passed: 10/10 Turbo build tasks, including Preview Webview/Extension and shared UI consumers

pnpm check
# latest checkpoint passed: Knip and dependency-cruiser, 1,550 modules / 5,536 dependencies, no violations

pnpm --dir packages/neko-preview test --run
# latest creation-menu checkpoint passed: 44 files / 335 tests

pnpm --dir packages/neko-preview exec vitest run packages/extension/src/providers/model/threeReferencePresetCatalog.test.ts packages/webview/src/model/modelStagingStore.test.ts packages/webview/src/model/threeReferencePresetRuntime.test.ts packages/webview/src/model/ModelViewer.test.tsx
# fixed camera/light placements and separate primitive choices: 4 files / 36 tests

pnpm exec vitest run packages/neko-types/src/types/__tests__/three-reference.test.ts
# shared 3D Reference contract: 1 file / 5 tests

pnpm exec tsc -p packages/neko-preview/packages/webview/tsconfig.json --noEmit
# passed

pnpm --dir packages/neko-preview compile
# production Webview + Extension build passed; model.js 947.10 kB / 251.64 kB gzip

pnpm test
# passed: 25/25 Turbo tasks; all package test commands completed successfully.

pnpm check:legacy-debt
# passed; removed combined primitive success path was not detected

pnpm check:unused
# passed with exit code 0

openspec validate add-3d-reference-staging --strict
# passed

pnpm exec prettier --check <changed 3D Reference files>
# passed after repository-configured formatting

git diff --check
# passed
```

Earlier focused contract/provider/runtime/UI/materialization groups passed 28 tests in 6 files, and the cumulative focused Preview groups passed 44 tests. Relevant ESLint and `git diff --check` checks passed at their implementation checkpoints.

Agent Evaluation disposition is `update` for `agent-runtime.creative-media-workflow`. `pnpm test:agent:eval` passed with 39 files / 278 tests and strict discovery of 23 suites / 48 cases. This is harness integrity only. The required real canonical/failure cases are blocked by the missing TUI Preview-context input boundary; see `evaluation.md`.

### Downstream 3D-reference delivery checkpoint

- The shared `projectThreeReferenceMediaControls()` projector is the only role mapping used by Agent direct media and Canvas generation. It accumulates appearance references, permits one pose/depth control, one camera, and one panorama, and rejects ambiguous singleton roles.
- Agent direct-media and Canvas requests preserve stable `ResourceRef` identities. Image control/IP-Adapter refs are materialized through the authorized host asset port; camera and panorama remain structured fields and are not flattened into prompt text.
- `MediaGenerationService` validates provider runtime mapping and selected model precise capabilities before task creation. Audited pose/depth paths are fal, DashScope, and standard-image NewAPI-compatible runtimes (`generic`, `newapi`, `oneapi`, `xai`, and `kling`); fal also exposes one IP-Adapter reference. Official OpenAI image models, compatible chat-image prompt/multimodal projection, mixed stable/legacy identities, and multi-reference truncation all fail before task creation. No current adapter declares structured camera or panorama support.
- Focused delivery evidence: shared 3D contracts `7/7`, Agent message runtime `69/69`, platform media projection/capability/materialization `49/49`, Canvas runtime `18/18`, and Extension bridge `5/5` tests passed. The full repository run passed `25/25` Turbo tasks.
- Additional gates passed: `pnpm build`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm test:agent:eval`, `openspec validate add-3d-reference-staging --strict`, Prettier checks, and `git diff --check`.
- These checks prove the canonical code path and harness integrity, not real Agent behavior. The required supported-control and unsupported-control TUI cases remain blocked because the Evaluation platform has no canonical operation that originates a VS Code Preview `3d-reference` payload; direct turn injection is intentionally not used.

## Active blockers and residual risk

| Task        | Remaining evidence                                                                                                                                                                                                                                                                                                                                                                                                           | Closure condition                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2.5`       | Static entry ownership, zero preset-binary increment, and deterministic construction/disposal tests are complete. Supported-host construction, visible render, and disposal measurements have not been recorded separately for adult-female, adult-male, and child.                                                                                                                                                          | Run all three catalog mannequins in a verified Extension Development Host and record per-variant construction/render/disposal evidence without loading preset code from non-model entries.                                             |
| `5.8`       | Camera/light runtime tests pass, but direct-drag visibility, no-XYZ behavior, capture exclusion, console state, and cleanup lack current real-host evidence. Port `9222` is reachable but the debugger Skill reports no verified VS Code workbench page target.                                                                                                                                                              | Re-run the focused camera/light scenario against `~/Git/neko-test/test.glb` after the existing CDP endpoint passes the Skill preflight; do not substitute browser/Vite.                                                                |
| `7.1`/`7.2` | The retired shared `scripts/webview-functional` harness no longer provides a scenario schema or runner. Preview must not recreate host/CDP/report ownership inside the feature package. The required guide/preset/pose/camera/light fixed-choice menus, panorama/send/reload/multi-panel/disposal matrix therefore has no sanctioned executable owner yet. The 2026-07-20 preflight again found no VS Code workbench target. | Reuse or define a repository-owned local-only host runner, keep business fixtures/actions/assertions under Preview ownership, then execute the matrix in an isolated synthetic workspace after the existing endpoint passes preflight. |
| `7.3`       | External `~/Git/neko-test/test.glb` appearance/camera capture and role-labelled Agent injection are complete. Real-source panorama composition, role isolation across all four purposes, and provider-level supported/rejected generation remain unverified.                                                                                                                                                                 | Re-open the external workspace in a verified Development Host, stage an authorized panorama, exercise each role independently, and record both supported-control submission and fail-closed cases.                                     |

Agent tasks 6.2–6.5 and documentation task 8.2 are complete. The latest full repository build/test/check, legacy-debt, unused, and Agent evaluation harness gates pass, but deterministic evidence does not replace the open Extension Development Host or real Agent behavior acceptance above.
