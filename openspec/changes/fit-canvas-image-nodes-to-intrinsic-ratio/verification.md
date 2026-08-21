## Verification summary

Risk classification: L2. The change modifies a shared Canvas domain sizing policy, Canvas Node authorized-file metadata production, a Webview browser-File creation path, public package types/exports and visible node geometry. Durable node contract shape is unchanged; only newly created image node `size` differs when valid intrinsic dimensions exist.

## Automated gates

- `pnpm --filter @neko/canvas-domain test` — passed, 37 files / 305 tests.
- `pnpm --filter @neko/canvas-webview test` — passed, 65 files / 420 tests.
- `pnpm --filter @neko/content exec vitest run src/document/__tests__/image-metadata.test.ts` — passed, 5 tests.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-canvas-material-authoring.test.ts` — passed, 7 tests, including authorized and imported PNG dimensions.
- `pnpm --filter @neko/canvas-domain --filter @neko/canvas-node --filter @neko/content run typecheck` — passed.
- `pnpm --filter @neko/canvas-webview build` and `pnpm --filter @neko/app-desktop typecheck` — passed.
- Focused Prettier check, `pnpm exec openspec validate fit-canvas-image-nodes-to-intrinsic-ratio --strict`, package/content/Webview/Canvas-playback boundaries and `git diff --check` — passed.

## UI validation

**Scope:** new image-node initial geometry, proportional minimums, narrow-node label readability and dense Canvas layout. Applicable because the change is directly visible.

**Runtime:** Desktop material authoring integration is the authoritative functional boundary for authorized bytes -> metadata -> durable Canvas size. The actual Canvas `MediaNode`, `BaseNode`, Preview Viewer and domain sizing function were mounted in a real Chromium component runtime for supporting visual evidence. The visible Electron product scenario was also attempted because it is the only runtime that could combine Desktop startup/lifecycle with the rendered scene.

**Inventory and evidence:**

| State                                                                          | Evidence                                                                    | Observation                                                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Landscape `1600×900`, portrait `800×1200`, square `1000×1000`, long `400×1600` | `reports/ui-validation/canvas-image-intrinsic-sizing/light-large.png`       | Actual node boxes measured `120×67.5`, `80×120`, `120×120`, `30×120`; images filled the ratio-matched Viewer without clipping. |
| Selected portrait and proportional minimum presentation                        | same light screenshot plus domain/Webview sizing tests                      | Selection frame and handles followed the `80×120` node; minimum calculation retained ratio and did not apply `80×50`.          |
| Dense dark layout                                                              | `reports/ui-validation/canvas-image-intrinsic-sizing/dark-dense.png`        | Four ready images had no rectangle overlap, readable labels and coherent borders/ports in dark theme.                          |
| Small viewport                                                                 | `reports/ui-validation/canvas-image-intrinsic-sizing/light-small-dense.png` | `640×433` viewport had no document overflow; all four nodes and labels remained visible.                                       |
| Narrow image identification                                                    | all screenshots                                                             | `1:4` node title displayed as `长图 1:4` after the validation-discovered label-width fix; durable width remained 30.           |
| Unknown dimensions / adjacent audio-video behavior                             | domain/node factory tests and full Canvas Webview suite                     | Unknown dimensions retained the canonical media fresh default; audio/video sizes and shared media components remained passing. |

All three screenshots were opened and inspected directly. No clipping, unintended stretching, node overlap, title loss, alert state or viewport overflow was observed. Browser recording: `/Users/feng/.config/browser-harness/agent-workspace/recordings/canvas-image-intrinsic-sizing`.

**Result:** `blocked` overall. The functional Desktop authoring integration and browser-owned visual checks passed, but `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer --target development` could not start the isolated Electron Renderer because process `95309` already owned this checkout's Vite bundle. The fail-visible report is `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-21T21-48-05.169Z-canvas-openneko-consumer-development/report.json`; it contains no checkpoints, so no Electron visual pass is claimed.

## Quality review

No blocking or suggestion findings remain in the changed path.

- Ownership: Canvas domain is the only size/minimum policy owner; Content is the only encoded-image metadata parser; Node and Webview only produce dimensions at their real runtime boundaries.
- Canonical paths: Workspace Board, Host material authoring and Webview File drop all call `resolveCanvasImageNodeSize`; the prior Workspace-only fixed-width/minimum-height calculation was deleted.
- Data safety: intrinsic dimensions are creation input only and are not copied into node data. Existing document nodes and Entity representation replacements preserve their durable size.
- Trust/runtime boundaries: Node probes only exact authorized workspace paths or bytes already read for the current import. Webview imports no Node/Electron API and uses the same pure Content probe for browser File bytes.
- Code hygiene: no production `any`, console logging, compatibility path, feature flag, internal version field, duplicate image parser or fallback renderer was added.

## Residual risk

- Package resources whose owner exposes authorization but not readable bytes retain the canonical `120×90` fresh default; no size is fabricated.
- Pathological ratios narrower than the visually exercised `1:4` case remain mathematically proportional and bounded, so their short edge can become difficult to manipulate even though the label remains readable.
- The visible Electron scene should be rerun after the existing development process releases the checkout's Vite bundle.
