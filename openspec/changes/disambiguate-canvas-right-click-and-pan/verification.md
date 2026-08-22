## Scope and risk

- Risk: L1. The change is contained in browser-owned Canvas viewport gesture state and component event composition.
- Canonical owners: `useViewportTransform` owns click-versus-pan classification; `useContextMenu` remains the only menu builder and Canvas/node target owner.
- Canonical path: viewport pointer events -> typed release disposition -> InfiniteCanvas callback -> existing CanvasApp `handleContextMenu`.
- Replaced path: move-time `suppressContextMenuRef` and direct reliance on native `contextmenu` timing. No timer, global listener, duplicate menu builder or alternate viewport authority was added.
- User data: Canvas document, selection contracts and viewport persistence shape are unchanged.

## Functional verification

Passed:

- Focused hook and InfiniteCanvas tests: 2 files / 13 tests.
- `pnpm --filter @neko/canvas-webview build`.
- `pnpm --filter @neko/canvas-webview test` — 70 files / 442 tests.
- `pnpm exec openspec validate disambiguate-canvas-right-click-and-pan --strict`.
- `pnpm check:webview-boundaries` and `pnpm check:package-boundaries`.
- Scoped ESLint: no errors; only pre-existing CanvasApp Hook warnings outside the changed event wiring.
- Scoped Prettier and `git diff --check`.

Path-level evidence:

- Mouse `contextmenu` with `button === 2` is prevented before movement and after release.
- Stationary right release returns `open-context-menu` and reaches the existing callback once with release coordinates.
- Sub-threshold jitter does not call `onViewportChange` and still requests the menu once.
- Threshold-crossing drag updates the existing viewport callback from the original press delta and never requests the menu.
- InfiniteCanvas preserves the exact node release target, so existing node-menu detection still resolves the node identity.
- Keyboard-originated context-menu events continue to bubble to the existing parent owner.

## UI validation

**Scope:** applicable. The visible behaviors are right-click menu timing, right-drag panning, threshold feedback and Canvas-versus-node menu targeting. Adjacent risks are middle/Space/hand-tool pan, left selection/marquee, wheel pan/zoom and modal interaction.

**Runtime:** the isolated Electron Canvas scenario is authoritative because the defect depends on platform Chromium `contextmenu` ordering and real pointer events; jsdom proves deterministic ownership but not macOS Electron timing.

**Inventory:**

- Blank Canvas stationary right click -> no menu on press, existing Canvas menu on release.
- Node stationary right click -> no menu on press, existing node menu on release at the node target.
- 1–3px jitter -> no viewport movement, menu on release.
- 4px-or-greater hold-and-drag -> viewport moves, no menu during or after release.
- Early and late native contextmenu -> no browser/application duplicate menu.
- Keyboard context menu -> existing menu owner remains reachable.
- Middle/Space/hand-tool and wheel gestures -> existing package suite remains green.

**Evidence/result:** blocked. `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer` timed out waiting for a CDP target because an existing Electron Forge development process already owns this checkout. The running process was not terminated. No authoritative pointer trace or screenshot was produced, so real Electron interaction and visual menu timing are not claimed as passed.

## Quality review

No blocking or suggestion findings in the scoped change.

- Gesture classification remains local to the viewport hook and returns a small closed disposition union.
- InfiniteCanvas only routes the exact release event; menu content, selection and actions are not duplicated.
- Native mouse context menus are suppressed without delaying through timers; keyboard context menus remain a separate intentional input mode.
- Right-pointer refs are cleared on release, leave and disabled modal state; errors are not hidden behind fallback behavior.
- Existing middle, wheel, node drag, marquee and modal paths were not given new owners.

## Residual risk

- The actual macOS Electron press/release ordering remains unexecuted until the existing development process releases the checkout.
- The 4 CSS-pixel threshold is covered deterministically but has not received real high-DPI pointer usability review in this run.
