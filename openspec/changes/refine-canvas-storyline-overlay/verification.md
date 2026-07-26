# Verification

Date: 2026-07-25

## Automated checks

- `pnpm --filter @neko-canvas/webview test`
  - Passed: 56 test files, 311 tests.
  - Covers Store defaults, Overlay geometry and switching, source-node reveal,
    shared controller ownership, timer progression, pause cleanup,
    media-completion behavior, Matrix column alignment, Canvas containment,
    route focus ownership and Simplified Chinese chrome.
- `pnpm --filter @neko-canvas/webview build`
  - Passed: TypeScript and Vite production build.
  - Vite reported the existing chunk-size advisory only.
- `pnpm check:webview-boundaries`
  - Passed for all five Webview roots.
- `git diff --check`
  - Passed.
- `pnpm exec openspec validate refine-canvas-storyline-overlay --strict`
  - Passed.
- `pnpm check:openspec`
  - Passed: 44 changes.

`pnpm check:canvas-playback-boundary` cannot currently execute its assertions.
The script still reads the deleted
`packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.ts`
and exits with `ENOENT`. That file was removed by the preceding Canvas
simplification work; this Overlay change does not recreate a compatibility path
to satisfy the stale check.

## Extension Development Host

The scenario used an isolated synthetic workspace, independent user-data and
extension directories, and CDP port `9351`. It did not use the shared
`neko-test` workspace.

- Host: `[Extension Development Host] storyline-overlay.nkc — storyline-overlay-runtime`
- Fixture: `reports/webview-functional/storyline-overlay-runtime/storyline-overlay.nkc`
- Target preflight: `NEKO_VSCODE_DEBUG_PORT=9351 pnpm smoke:webview:targets`
- Evidence: `reports/webview-functional/storyline-overlay-runtime/storyline-overlay-zh-preview-isolation.png`

Observed results:

- Storyline is the default route view and opens inside the Canvas pane.
- At a `1362px` Webview width, Preview remains a `520px` right pane while the
  Overlay stays within the `841px` Canvas pane; their intersection area is zero.
- At a `552px` Webview width, Canvas and Preview switch to a vertical layout.
  Preview fills the available width, and the Overlay remains inside the Canvas
  pane with zero intersection.
- The Canvas reveal safe area accounts for the 208 px default Overlay height.
- Compare mode keeps Matrix available and renders one route with three aligned,
  playable columns.
- Storyline/Compare switching preserves the active `Resolution` unit.
- Starting playback in the Overlay automatically opens Preview.
- Exactly one controller is rendered; hiding the Overlay transfers its
  presentation to Preview without losing playback state.
- Preview loaded the fixture image through a VS Code resource URI at `960x540`.
- The injected `zh-cn` locale renders Storyline, Route Comparison, close and
  resize labels in Simplified Chinese while preserving user-authored titles.
- The Webview console contained no Neko CSP, media, resource or message error.
  The only warning was VS Code's own benign `local-network-access` warning.

The isolated Extension Development Host was terminated after evidence capture.

## Remaining risk

The stale playback-boundary script leaves that repository-level static check
unavailable until its ownership and current canonical files are updated. The
implemented path is covered by Webview tests, production build, Webview boundary
checks and isolated Extension Host runtime evidence.
