# Verification

## Scope and risk

- Quality-review level: L4, because the change updates a shared Canvas playback contract and the core Storyline authoring workflow.
- Runtime boundary: local Canvas Webview plus shared pure TypeScript projection; no Engine, Proto, durable schema, or cross-extension message schema change.
- Canonical path: `useConnectionDrag` owns the pointer session, `canvasStore` validates and commits complete drafts, and Storyline topology comes from persisted `sequence` connections or explicit sequence Groups.

## Automated verification

- `pnpm --filter @neko/shared exec vitest run`
  - Passed: 171 files, 1419 tests.
- `pnpm --filter @neko-canvas/webview exec vitest run`
  - Passed after the runtime-race regression was added: 56 files, 319 tests.
- `pnpm --filter @neko-canvas/webview build`
  - Passed TypeScript compilation and Vite production build.
- `pnpm build:vscode:dev`
  - Passed and staged all seven development features.
- `pnpm check:canvas-playback-boundary`
  - Passed.
- `pnpm check:webview-boundaries`
  - Passed.
- `pnpm check:legacy-debt`
  - Passed with zero blocking non-agent debt findings.
- `pnpm check:unused`
  - Passed; only existing configuration hints were reported.
- `pnpm exec openspec validate fix-canvas-storyline-connection-authoring --strict`
  - Passed.
- `git diff --check`
  - Passed.

## Extension Development Host evidence

Validated in the existing isolated `[扩展开发宿主] Untitled.nkc — neko-test` window through the `vscode-extension-debugger` and `computer-use` skills:

1. Reloaded the host after staging the rebuilt development extension.
2. Confirmed both Media nodes expose left `in` and right `out` port endpoints.
3. Dragged the first Media `out` endpoint to the second Media `in` endpoint with CDP mouse input.
4. Observed a valid target projection during the gesture.
5. Observed `2 nodes | 1 connections`, two Storyline nodes, and one Storyline edge after commit.
6. Triggered Canvas undo.
7. Observed `2 nodes | 0 connections`, two Storyline nodes, zero Storyline edges, and two lanes after undo.

Screenshot evidence is stored in the gitignored report path:

`reports/webview-functional/fix-canvas-storyline-connection-authoring/canvas-storyline-disconnected-after-undo.jpeg`

The first runtime pass exposed a host-plan race where Storyline retained one stale edge after undo. The final implementation associates host-enriched plans with the exact Canvas snapshot that requested them and defers the host request until the current Canvas status message is queued. A regression test and the repeated Extension Host path prove the stale edge no longer remains.

### Multi-lane Storyline height follow-up

- Increased the collapsed Storyline height from `108–148px` to `204–240px`; fullscreen uses `204–280px`.
- Retained `.canvas-playback-storyline-viewport` as the only horizontal and vertical scroll owner.
- In the isolated `neko-test` Extension Development Host at a 936px Webview height, CDP observed:
  - Storyline height: `240px`;
  - graph viewport height: `165px`;
  - two independent lanes fully visible;
  - `overflow-x: auto` and `overflow-y: auto`;
  - playback controls immediately below the Storyline without overlap.
- The Webview console contained only VS Code's known `local-network-access` container warning.
- The full Webview suite completed 55 files / 318 tests successfully and one unrelated toolbar popover test timed out under the concurrent run; the timed-out test passed alone with both of its assertions. Focused Storyline layout and component tests passed.

## Commit boundaries

- `360a703 docs(canvas): specify storyline connection authoring`
- `7effefe fix(canvas): derive storyline from authored topology`
- `eebc3fe fix(canvas): author sequence connections by drag`

## Residual risk

- The Vite build retains the repository's existing chunk-size and stale Browserslist database warnings; neither is introduced by this change.
- Route enumeration intentionally fails visibly beyond 256 root-to-terminal paths. This protects the local Webview from combinatorial DAG expansion but means extremely branched Canvases require authoring simplification before playback.
