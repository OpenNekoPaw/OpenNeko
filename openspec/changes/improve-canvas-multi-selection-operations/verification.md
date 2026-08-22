## Scope and risk

- Risk: L1, package-local Canvas Webview selection, gesture, store mutation and command presentation.
- Owning boundary: `@neko/canvas-webview`; no Desktop IPC, Canvas domain contract, `.nkc` shape or user-data migration changed.
- Canonical path: `BaseNode` gesture -> `InfiniteCanvas` selection delta preview -> `CanvasApp` -> `canvasStore.moveNodesEnd` -> one history snapshot plus root operation projections.
- Replaced path: `moveNodeEnd(id, position)` and single-node drag preview were deleted; no parallel move handler remains.

## Functional verification

Passed:

- `pnpm --filter @neko/canvas-webview build`
- `pnpm --filter @neko/canvas-webview test` — 69 files / 432 tests.
- Focused component/store suite — 6 files / 45 tests covering selection translation, atomic move/undo, Group-child de-duplication, locked nodes, additive marquee, drag selection retention, context commands and toolbar duplicate.
- `pnpm exec openspec validate improve-canvas-multi-selection-operations --strict`
- `pnpm check:webview-boundaries`
- `pnpm check:package-boundaries`
- `pnpm check:canvas-playback-boundary`
- `pnpm check:content-access-boundaries`
- `git diff --check`
- `node --check packages/canvas/webview/functional/desktop-openneko-consumer.mjs`
- `pnpm test:local:media-openneko` — adjacent OpenNeko resource/media qualification passed.

Repository-wide advisory checks:

- `pnpm check:legacy-debt` did not pass because concurrent uncommitted DSH files contain 25 `shim` matches. Reported files are under `apps/neko-desktop` and `packages/agent`; none are in this Canvas change.
- `pnpm check:unused` reports the repository's existing unused files/dependencies/exports. It did not report the new selection transform helper or new Canvas test files.

## UI validation

**Scope:** applicable. User-visible states are multi-selection ready, active shared drag, committed drag with selection retained, additive marquee, mixed locked selection, batch toolbar/context commands, hidden unsupported transform handles and return to single selection.

**Runtime:** the focused Canvas component/store runtime is authoritative for the changed browser-owned gesture and presentation boundary. A supplemental isolated Electron Canvas scenario was added to exercise the same production Root and capture screenshots.

**Inventory and functional evidence:**

- Multi-selection ready -> two selected node projections, Group/Duplicate/Delete capability and no resize/rotate handles: component and toolbar tests passed.
- Active drag -> both selected unlocked nodes receive the same preview delta: `InfiniteCanvas.multi-selection.test.tsx` passed.
- Commit/return -> one `moveNodesEnd` call, complete selection retained, one undo restores all nodes: component and store tests passed.
- Group + selected descendant -> subtree translated exactly once and membership preserved: helper/store tests passed.
- Mixed locked selection -> unlocked roots move while locked sibling stays selected and fixed: helper/store tests passed.
- Additive marquee -> gesture-start modifier survives release and background mousedown does not clear existing selection: hook/component tests passed.
- Context front/back/lock and toolbar duplicate -> complete selection updated with one history step: hook/store/toolbar tests passed.
- Single-selection return -> transform handles render again: component test passed.

**Visual evidence:** blocked. `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer` could not start the isolated Electron fixture because process `18857` already owns the checkout's Vite bundle. The fail-visible report is `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-22T00-09-28.171Z-canvas-openneko-consumer-development/report.json`; no Canvas screenshots were produced, so pixel-level fit, overlap and active/post-drag appearance are not claimed as passed.

**Result:** blocked for visual validation; browser-owned functional acceptance passed.

**Residual risk:** current screenshot evidence is missing for light/dark and compact Desktop layouts. The new production Electron scenario contains multi-selection and equal-delta assertions and should be rerun after the existing development process releases the Vite bundle.

## Quality review

No blocking or suggestion findings in the scoped change.

- Responsibility remains in the Canvas L2 Webview owner; no app-root business logic or runtime boundary was introduced.
- Preview and commit reuse one selection translation helper. Single-node movement uses the same batch store contract, so no parallel success path remains.
- Batch movement, front/back and lock operations each record one history snapshot; tests assert atomic undo and selected relative z-order.
- No new production `any`, unsafe type assertion, console logging, internal version field, fallback path, feature flag, hard-coded durable path or cross-package private import was added.
