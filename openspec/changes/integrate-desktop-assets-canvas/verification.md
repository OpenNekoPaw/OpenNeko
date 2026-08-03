# Verification status

Task 1.1 is complete. The isolated `canvas-openneko-consumer` Electron scenario exercised the current
package-owned Canvas Root through the fixed Desktop bridge and recorded:

- Add-menu Text authoring from one to two nodes;
- material-action resolution after the local revisioned Canvas status queue settled;
- video and audio playback across two independent Canvas Views;
- View teardown with both OpenNeko resource URLs released;
- zero renderer console errors/exceptions and no Main
  `open-neko:canvas:material-actions-resolve` stale-revision handler error.

Evidence:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-02T19-56-06.154Z-canvas-openneko-consumer-development/report.json`

Focused validation:

- `pnpm --filter @neko/canvas-webview test` — 59 files / 327 tests passed.
- `pnpm --filter @neko/canvas-webview build` — passed.
- `pnpm --filter @neko/canvas-domain test` — 30 files / 271 tests passed.
- `pnpm --filter @neko/canvas-node test` — 2 files / 8 tests passed.
- `pnpm --filter @neko/ui test` — 47 files / 202 tests passed.
- `pnpm --filter @neko/assets-domain test` — 12 files / 107 tests passed.
- `pnpm --filter @neko/assets-webview test && pnpm --filter @neko/assets-webview build` — 4 files /
  31 tests and build passed.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-canvas-runtime.test.ts` — 16 tests
  passed.
- `pnpm check:canvas-playback-boundary && pnpm check:webview-boundaries` — passed.
- `pnpm check:openspec` — 39 strict items passed.

Previous retired-host evidence and implementation inventory remain intentionally absent.
