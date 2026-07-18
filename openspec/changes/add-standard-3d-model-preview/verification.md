# Verification

## Result

The Preview-owned standard 3D path renders the development GLB with its original materials, embedded textures, transparent content, and complete node hierarchy in the VS Code Extension Development Host. The remaining acceptance gap is the isolated synthetic functional scenario: the runner attached to an already-open development workspace instead of its fixture workspace and correctly rejected the run as `configuration-invalid`.

## Root Causes and Regression Proof

- The first contract violation was the model Webview's exact URL modifier rejecting every `blob:vscode-webview://...` URL.
- `GLTFLoader` creates those panel-local object URLs for images embedded in an already inspected GLB. Rejecting them caused repeated `THREE.GLTFLoader: Couldn't load texture` errors, white materials, and loss of alpha-dependent model content.
- A red regression test first reproduced the rejection in `threeRuntime.test.ts`.
- The canonical fix accepts browser-owned `blob:` projections in the model Webview, alongside embedded `data:` resources. Exact source/dependency authorization remains owned by the Extension.
- A separate Extension regression proves a source-declared `blob:` dependency is still unsafe and rejected. Remote, absolute, traversing, missing, and undeclared dependencies remain fail-closed.
- A camera-bound regression separately proved that OrbitControls could enter the model bounding sphere. The runtime now keeps the camera outside that sphere, but later evidence confirmed that the reported angle-dependent clothing loss also occurred without zoom and therefore had a different root cause.
- The external GLB declares the opaque clothing atlas as `alphaMode: BLEND` for the shirt, skirt, body, and internal safety-pants layers. All 4,194,304 pixels in that 2048×2048 base-color texture have alpha 255, but GLTFLoader consequently placed those meshes in the transparent queue with `depthWrite = false`. Object sorting then changed with the camera angle: the body overwrote clothing and an internal dark layer overwrote the skirt.
- A red material regression now proves that loaded BLEND materials whose effective alpha is fully opaque are promoted to the opaque depth path. Materials with partial texture alpha, `opacity < 1`, an `alphaMap`, or vertex-color alpha semantics remain transparent. This restores deterministic nested clothing depth without flattening genuine hair, highlight, or metallic alpha layers.

## Format and Ownership Matrix

| Source | Loading boundary | Authorized dependencies | Engine use |
| --- | --- | --- | --- |
| GLB | Dedicated Three.js model Webview | Primary file; loader-created embedded image object URLs | None |
| glTF | Dedicated Three.js model Webview | Exact relative buffers/images enumerated by Extension | None |
| OBJ | Dedicated Three.js model Webview | Exact declared relative MTL and MTL textures | None |
| STL | Dedicated Three.js model Webview | Primary file only | None |
| PLY | Dedicated Three.js model Webview | Primary file only | None |
| MTL | OBJ dependency only | Cannot open independently | None |

The source stays read-only. Node transforms, camera presets, lights, background, and capture settings are recoverable panel staging only; no model/scene project format or Rust Engine Model/Scene path was introduced.

## Design and Reuse Audit

- **Responsibility:** Extension owns file policy, bounded inspection, exact URI projection, panel/session identity, capture validation, and Agent command delivery. The dedicated Webview owns Three.js rendering and temporary staging. Agent only consumes the typed `model-preview` context.
- **Dependencies:** `three`, its types, and the direct Codicons stylesheet dependency belong only to `@neko/preview-webview`. Model Preview does not create `PreviewService` or use `EngineClient` model/scene actions.
- **Interfaces:** The versioned protocol carries `sessionId`, source fingerprint, and monotonically increasing revision. Stale or cross-panel messages fail visibly; active-editor fallback is forbidden.
- **Extension:** The fixed adapter table is the only format path. There is no runtime registry, directory probing, external Viewer dispatch, generic binary/text fallback, or direct provider upload.
- **UI reuse:** The scene tree and staging controls reuse `@neko/ui` primitives; package-local components contain model-domain composition and panel-owned state only.
- **Testing:** Pure parsers and guards use deterministic tests; Three lifecycle is behind a fakeable port; the real UI was inspected through the verified VS Code/Electron CDP target.

## Development Host Evidence

- Host: VS Code Extension Development Host with the repository development extensions, opening `/Users/feng/Git/neko-test/test.glb` directly from its external workspace. The model was not copied into the repository or modified. The final rendering pass used the same dev extension paths without an attached Node inspector because the built-in debugger's network inspection raised `Missing dataLength in event` while reading the 34 MB GLB before the Preview handler could mount.
- Before the fix: 21 GLTF texture load errors and a white/incomplete model.
- After the fix: no Three.js, texture, CSP, or model runtime error; the only console message was the known VS Code `local-network-access` feature warning.
- Visual result: original red/white/skin colors, transparent clothing details, skirt, and tail render; the erroneous large black clothing blocks are absent. UI exposes scene search/tree, orbit/node modes, temporary transform, camera, light, background, capture size, and Agent handoff.
- Angle result: front, side, opposite-side, and three-quarter views retain the complete upper garment and skirt layers instead of exposing the body or internal safety-pants mesh as the camera rotates.
- Close-range result: after 30 consecutive zoom-in wheel events, the camera stopped outside the model; face, clothing, limbs, and tail remained rendered without internal-face clipping or viewport-filling triangles.
- Normalized facts shown by the live panel: 39 nodes, 37 meshes, 37 materials, 0 animations.
- Local visual evidence: `/tmp/openneko-preview-before.png`, `/tmp/openneko-preview-after-texture-fix.png`, `/tmp/openneko-external-glb-depth-fix-close.png`, `/tmp/openneko-external-glb-depth-fix-angle-close.png`, `/tmp/openneko-external-glb-depth-fix-angle-opposite-close.png`, `/tmp/openneko-external-glb-depth-fix-three-quarter.png`, and `/tmp/openneko-external-glb-final.png`.

## Validation Commands

| Command | Result | Coverage |
| --- | --- | --- |
| `pnpm exec vitest run ...threeRuntime.test.ts ...modelSourceInspection.test.ts ...webviewHtmlCsp.test.ts` | Passed: 3 files, 30 tests | Embedded object URL regression, source dependency rejection, CSP |
| `pnpm exec vitest run packages/neko-preview/packages/webview/src/model/threeRuntime.test.ts` | Passed: 1 file, 7 tests after the opaque-BLEND material regression failed red | Camera bounds plus deterministic nested opaque/transparent material behavior |
| `pnpm --filter neko-preview test -- --run` | Current run: 33 files passed; 260/261 tests passed. The sole failure is the removed repository fixture `scripts/webview-functional/fixtures/preview-models/triangle.glb`; it was not recreated because real acceptance was explicitly restricted to the external `~/Git/neko-test/test.glb`. | Preview Extension/Webview deterministic suite except the unavailable local-fixture matrix case |
| Focused model lifecycle/provider/runtime rerun | Passed: 3 files, 14 tests | Source projection, provider identity/lifecycle, Three runtime |
| `pnpm exec tsc -p packages/neko-preview/packages/webview/tsconfig.json --noEmit` | Passed | Model Webview TypeScript contract |
| Preview Extension `tsc --noEmit` | Blocked by existing package/shared errors in media DOM libs, document/audio/panorama tests and providers; after local corrections, no error remains under `providers/model` | Extension typecheck gap remains outside this proposal boundary |
| `pnpm --filter @neko/preview-webview build` | Passed | Production model entry and asset ownership |
| `pnpm --filter neko-preview compile:extension` | Passed | Extension production bundle |
| `pnpm build` | Passed: 10/10 Turbo tasks | Full repository build |
| `pnpm test` | Failed in 4 Agent Webview UI tests during the concurrent run | Full repository test attempted; Preview was not the failing package |
| Focused rerun of the 4 failed Agent Webview files | Passed: 4 files, 13 tests | Confirms concurrency/timing flake rather than deterministic failure |
| `pnpm check` | Earlier run passed. Current run stops in Knip on an existing unused root `ws` devDependency and stale functional-fixture entry hints; dependency-cruiser therefore did not run. | Current dirty-worktree quality gap is outside the material fix |
| `pnpm check:legacy-debt` | Passed: 0 blocking findings | No new fallback/legacy debt |
| `pnpm test:agent:eval` | Passed: 39 files, 277 tests; 23 suites/47 cases dry-run | Evaluation harness integrity only, not behavior acceptance |
| `openspec validate add-standard-3d-model-preview --strict` | Passed | OpenSpec artifacts |
| `git diff --check` | Passed | Patch formatting |

## Functional Scenario Status

The focused scenario exists at `scripts/webview-functional/scenarios/preview/preview-model-agent-context.p0.scenario.json` and uses isolated synthetic models. Its latest report is:

`reports/webview-functional/preview.model-agent-context.p0/2026-07-18T07-52-02-424Z/result.json`

Status is `configuration-invalid`: the runner expected `<repo>/scripts/webview-functional/neko-test` but attached to the unrelated active development workspace. The safety check produced no scenario steps, assertions, screenshots, runtime errors, or side effects. This is retained as a blocker; the manual dev-host rendering result does not substitute for the missing end-to-end Agent context chip assertion.

The local VS Code workspace now provides `Debug Webview Functional (All)`, whose final workspace argument is the repository-owned `scripts/webview-functional/neko-test` root; the tracked fixture README names the same canonical configuration. Functional host and selection tests pass (11/11). Because `.vscode/` is intentionally ignored, the launch entry is local environment setup rather than committed product code. The manual model-rendering pass does not replace that scenario: it used the ordinary development model workspace and intentionally did not weaken the fixture identity check.

## Evaluation and Bundle Impact

- Evaluation disposition remains `excluded`: this change adds deterministic host context ingestion, not Agent reasoning, Tool/capability routing, provider selection, or TUI behavior. `agent-runtime.creative-media-workflow` therefore remains unchanged.
- `model.js` is isolated to `model.html`: 830.19 kB minified / 218.48 kB gzip in the verified build. Existing video, audio, and document entries do not execute it.
- The production build reports the existing Vite chunk-size warning for this entry; compressed glTF decoders and further code-splitting remain separate design decisions.

## Remaining Risks

- The synthetic Extension Development Host scenario and canonical Agent chip/evidence assertion still need a clean fixture-bound debug host.
- Start the built-in `Debug Webview Functional (All)` configuration with the synthetic fixture workspace, then rerun `preview.model-agent-context.p0`; do not use the ordinary development workspace or weaken the runner's workspace identity check.
- Full repository `pnpm test` remains red until the concurrent Agent Webview timeout flakes pass in a complete run, despite the focused rerun passing.
- Preview Extension standalone `tsc` is still blocked by pre-existing non-model errors; Webview typecheck and all model-scoped Extension errors are clean.
- Very large or shader-heavy models may need later performance work; current capture and source/dependency limits remain enforced.
- Bounding-sphere clamping intentionally prevents orbiting inside a model. Dedicated section/cutaway inspection would require an explicit mode with a different clipping and material contract rather than weakening the default preview guard.
