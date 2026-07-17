## Quality review

- Risk level: L2. The change crosses shared Canvas contracts, Extension Host file projection, Webview message correlation, and Canvas rendering, but does not change Engine or published remote protocols.
- Architecture: the Extension Host remains the only file reader. Generic text-file addition performs one bounded strict UTF-8 import, then Canvas owns the editable `TextCanvasNode` snapshot and portable provenance. Historical text Document runtime projection remains readable but is not a new-import fallback. The existing `BaseNode` remains the only selection/frame owner.
- Reuse: Markdown display is built on `@neko/markdown` and exported from `@neko/ui`; Canvas adds only resource/runtime adaptation. Opaque readable surfaces extend `BaseNode` with one opt-in visual flag instead of changing every foundational node.
- Review result: no change-scoped blocking findings remain.

## Verification

- `openspec validate render-canvas-text-file-resources --strict`: passed.
- `pnpm --filter @neko/ui check`: passed.
- `pnpm --filter @neko/ui test -- --run`: passed (43 files, 180 tests).
- Focused Canvas Webview tests: passed (7 files, 86 tests), covering text classification, add-source correlation, snapshot creation, node construction, rendering, and message handling.
- Focused Canvas Extension services: passed (2 files, 8 tests), including Fountain strict UTF-8 projection.
- `pnpm --filter neko-canvas compile`: passed, including Extension bundle, Webview typecheck/Vite build, and copied runtime bundle.
- `pnpm build`: passed (12/12 selected Turbo tasks).
- `pnpm check:deps`: passed.
- `git diff --check`: passed.
- Unified text import regression: passed. `.md/.markdown` create Markdown Text assets; `.txt/.log/.fountain/.nks/.story` create plain Text assets; Script-picker requests are normalized to the same Text path, and successful results persist content plus portable provenance without `scriptPath` or `docPath`.
- Header hierarchy regression: passed. The focused red-to-green run covered canonical imported-text title/icon projection, explicit authored titles, transparent foundational header classes, and spatial-group `xN` labels (2 files, 41 tests); the expanded changed-path run passed 5 files and 65 tests.
- Header production acceptance: `pnpm --filter @neko-canvas/webview build` and `pnpm --filter neko-canvas compile` passed; the copied production CSS contains the foundational header, header-control, and group-count rules.

## Existing gate failures and runtime residuals

- Full Canvas Webview tests retain one unrelated panoramic preview failure in `previewResolver.test.ts`; the focused changed paths pass.
- Canvas protocol tests retain two baseline source-string expectation failures that are also absent from `HEAD`.
- `pnpm check` stops on 72 existing unused-export/config hints; none name the new exports. `pnpm check:legacy-debt` reports the existing 202 blocking items.
- `pnpm test` reaches unrelated dirty TUI/guardrail failures: the TUI expects a concurrently deleted Agent evaluation workflow and stale status/config projections, while shared project-file guardrails reference packages absent from this checkout.
- The debugger preflight script rejects VS Code 1.129 because it recognizes only the older `electron-sandbox` workbench URL; direct CDP inspection found the real `electron-browser` Extension Development Host and Canvas Webview targets. Before the opaque-surface follow-up, direct DOM inspection confirmed Markdown display mode, zero Canvas textareas, no permanent Open button, and explicit Script failure state.
- The active `BLAME!…nkc` Canvas tab is dirty. It was not reloaded, so unsaved Canvas data was not discarded. Reloading the separate zero-node Canvas Webview confirmed that a bare iframe does not receive host initialization again and therefore cannot provide honest visual evidence. Header behavior is covered by render assertions and the copied production build; after saving and restarting the debug session, repeat the live visual check for imported filename/icon, transparent Header, and Group `xN` label.
