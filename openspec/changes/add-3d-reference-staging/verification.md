# Verification: add-3d-reference-staging

Date: 2026-07-19

This is the current implementation evidence. The change remains active because downstream Canvas/media routing, automated Webview scenarios, system-document synchronization, and full repository gates remain incomplete or blocked as described below.

## Design and reuse audit

- Preview owns temporary 3D reference sessions, immutable built-in guide metadata, exact local-resource authorization, Three.js projection, purpose captures, cancellation, and recursive disposal.
- Existing `ModelPreviewProvider`, `LocalResourceAccessService`, `PreviewService`, shared `ResourceRef`, shared UI primitives, theme tokens, and i18n runtime are reused. No second design system, path resolver, cache manager, Engine client, panorama provider lifecycle, or durable 3D project was introduced.
- `3d-reference` is the only successful replacement context. Legacy `model-preview` parsing and generic-image fallback are poisoned inside this boundary.
- Built-in guide geometry is project-authored and procedural. It is structurally restricted to pose/camera guidance and cannot produce appearance output.

## Built-in catalog and production bundle

Production build command:

```text
pnpm --dir packages/neko-preview compile:webview
pnpm --dir packages/neko-preview copy:webview
```

Measured output:

| Item                               |       Raw |      Gzip | Notes                                                                                |
| ---------------------------------- | --------: | --------: | ------------------------------------------------------------------------------------ |
| `assets/model.js`                  | 908.18 kB | 242.46 kB | Only `model.html` loads the 3D entry                                                 |
| Built-in preset binaries           |       0 B |       0 B | Mannequin, props, studio, and panorama grid are project-authored procedural geometry |
| Catalog aggregate binary increment |       0 B |       0 B | No Draco, Meshopt, KTX2, worker, or third-party model payload                        |

`buildOwnership.test.ts` proves every non-model HTML entry points to its own main module and contains no model entry or `model.js` reference. Catalog validation proves immutable identity/capabilities/dependencies/provenance/license notices. All current presets use `LicenseRef-OpenNeko` with project-owned redistribution metadata.

## Extension Development Host evidence

Host: VS Code Extension Development Host on macOS, verified through the existing CDP endpoint and the repository `vscode-extension-debugger` workflow.

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

### Directional-light controls implementation checkpoint

- The fixed key/fill/rim rig remains three `DirectionalLight` instances. No point-light attenuation, add/remove operation, shadow authoring, durable scene state, or source writeback was added.
- Preview now exposes a Lights tree group and one selected-light inspector with shared tree, panel, slider, color, axis, theme, icon, and i18n primitives. Selecting a light reuses the single runtime `TransformControls` instance in translate-only mode.
- Light positions round-trip through subject-bounds-normalized coordinates. Drag changes update the live direction light and direction guide; mouse-up advances the existing temporary panel revision without changing camera or model-transform contracts.
- Runtime helpers, arrows, camera helpers, grid, and transform gizmos are excluded from captures and their prior visibility is restored even if capture throws. Helper geometry and listeners are detached and disposed with the model/runtime lifecycle.
- Focused automated coverage passes, but this checkpoint has not been accepted in an Extension Development Host: the required VS Code CDP preflight reports no existing endpoint on port 9222, and the debugger workflow forbids launching or restarting VS Code to enable one. Task 5.8 therefore remains open. When the endpoint is available, acceptance must use only `~/Git/neko-test/test.glb` without copying it into this repository.

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
# passed: knip plus dependency-cruiser; 1,551 modules / 5,537 dependencies, no dependency violations

pnpm exec vitest run
# Preview Webview: 14 files / 52 tests passed, including tree/selection, normalized light coordinates, translate-only UI, staging revision, and capture-helper exclusion

pnpm --filter @neko/ui test -- --run
# shared UI: 35 files / 149 tests passed

pnpm build
# latest checkpoint passed: 10/10 Turbo build tasks, including Preview Webview/Extension and shared UI consumers

pnpm check
# latest checkpoint passed: Knip and dependency-cruiser, 1,549 modules / 5,533 dependencies, no violations

pnpm test
# blocked outside this change: Preview's repository-owned matrix fixture triangle.glb is absent, and three concurrently modified TUI Workspace Board tests expect group nodes that are not present
```

Earlier focused contract/provider/runtime/UI/materialization groups passed 28 tests in 6 files, and the cumulative focused Preview groups passed 44 tests. Relevant ESLint and `git diff --check` checks passed at their implementation checkpoints.

Agent Evaluation disposition is `update` for `agent-runtime.creative-media-workflow`. `pnpm test:agent:eval` passed with 39 files / 278 tests and strict discovery of 23 suites / 47 cases. This is harness integrity only. The required real canonical/failure cases are blocked by the missing TUI Preview-context input boundary and unfinished downstream routing; see `evaluation.md`.

## Active blockers and residual risk

1. The shared `scripts/webview-functional/` runner is present again, but owning Preview scenarios for the new guide/capture/reload/multi-panel path have not yet been added or accepted; tasks 7.1 and 7.2 remain open.
2. Agent task 6.2 is complete: invalid `3d-reference` payloads fail visibly, role-labelled prompt/evidence projection and chips are canonical, exact ResourceRefs become multimodal attachments, and empty-entry injection creates a conversation through the existing bridge. Canvas/media projection and capability negotiation in tasks 6.3–6.5 remain open; overlapping unrelated work in those files must still be preserved.
3. System ADR, architecture index, and package-boundary files already have unrelated edits. Task 8.2 remains open; only clean Preview-owned documentation was updated.
4. Real-model appearance/camera capture and role-labelled Agent context injection are complete, but real-source panorama composition and provider-level role-isolated generation are not; task 7.3 remains open.
5. The latest repository `pnpm build` and `pnpm check` pass. `pnpm test` remains blocked outside this change by the absent Preview `triangle.glb` matrix fixture and three concurrently modified TUI Workspace Board group-node expectations. Legacy-debt, functional, and real Agent evaluation gates have not yet been accepted for this change, so task 7.5 and final verification task 8.3 remain open.
6. The latest full Preview run passed 323 of 324 tests; the unrelated standard-format matrix test is blocked because its repository fixture `triangle.glb` is absent. The focused Preview Webview run passed all 52 tests, including the new light-control paths.
7. Preview Webview `tsc --noEmit` is blocked by three existing errors outside the new light-control files: the unsupported `shield` Codicon and empty `PanelSection` in `ThreeReferencePurposeControls.tsx`, plus a non-tuple spread in `threeReferencePresetRuntime.ts`. Production builds and focused ESLint/tests pass.
8. The full shared `neko-types` Vitest run passed 1,440 of 1,441 tests. The unrelated local-resource guardrail currently reports the pre-existing `ModelPreviewSourceSession.ts` Webview-root assembly path; the focused shared theme test passes.
9. Directional-light visual/interaction acceptance is blocked because no verified VS Code CDP endpoint is listening on port 9222. No browser/Vite substitute was used; task 5.8 stays open until the Extension Development Host can verify helper visibility, drag responsiveness, capture exclusion, console output, and cleanup against `~/Git/neko-test/test.glb`.
