# Verification

Date: 2026-08-08

## Automated Evidence

- `openspec validate stabilize-desktop-renderer-bootstrap --strict`: passed.
- Desktop focused and full Vitest run: 73 files and 477 tests passed. The emitted `surface failed` and poisoned Canvas module diagnostics are expected error-boundary fixtures.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm check:application-boundaries`: passed for 1,450 checked files, including the self-test.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- `pnpm check:unused`: failed only on the pre-existing exported `activateWorkbenchMainView` in `DesktopShell.tsx`. The same baseline finding is recorded by existing change verification documents and is outside this change.

## Canonical Path Evidence

The restarted Forge/Vite runtime served the Canvas selection toolbar from `http://localhost:5173`. Its transformed imports showed:

- Canvas domain: `/@fs/.../packages/canvas/domain/src/index.ts`, with no consumer-local `node_modules` identity and no `v` browser-hash query.
- Canvas domain response: `Cache-Control: no-cache`.
- React: `/node_modules/.vite/deps/react.js?v=...`, preserving third-party optimization.

The Electron log reached `Desktop renderer loaded` after cold startup and no longer emitted the previous optimized `@neko/shared/path` `ENOENT` or missing Canvas export error.

## UI Validation

**Scope:** Desktop startup, reload, pre-React failure presentation, and Canvas Surface failure containment. UI validation is applicable.

**Runtime:** the visible Forge-launched Electron Desktop using the production Renderer, preload, Main, and Vite boundaries.

**Inventory and evidence:**

- Normal startup rendered the Shell, Agent composer, Canvas document, navigation, and Resource Browser at desktop and compact window sizes.
- `Cmd+R` reloaded the same window and restored the complete UI without a blank state or runtime diagnostic.
- A bounded bootstrap loader rejection rendered the localized title, original diagnostic, and same-page reload action at desktop and compact sizes. Light and dark CSS states were inspected directly; text, diagnostic, and action remained readable without clipping or overlap.
- Keyboard `Tab` focused the reload action with a visible focus ring.
- A bounded Canvas lazy-import rejection rendered the owning Main slot diagnostic and retry action while navigation, Agent, and Resource Browser siblings remained rendered. Restoring the canonical import and reloading restored Canvas.
- All temporary failure injections and forced visual-state rules were removed after capture. The final Electron window rendered the normal Canvas path.

**Result:** passed.

## L2 Quality Review

No blocking or suggestion findings were identified in this change. Desktop Vite configuration remains the single owner of workspace public-entry identity; all internal entries are excluded from dependency optimization from the same manifest-derived catalog, while third-party optimization remains active. The DOM-only bootstrap does not import React or domain code, and Canvas failure containment uses the existing Surface boundary rather than a parallel application path.

Residual risk:

- `pnpm ci:local`, packaged Desktop startup, and installer smoke were not run because the worktree contains broad concurrent changes outside this OpenSpec scope.
- `check:unused` remains red on the documented pre-existing `activateWorkbenchMainView` export.
