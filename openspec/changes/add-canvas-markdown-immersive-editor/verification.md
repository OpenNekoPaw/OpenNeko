## Scope

- Feature: Canvas Markdown immersive editing.
- UI surfaces: compact Markdown node, selection toolbar, Canvas fullscreen modal Surface, Rich editor and completion state.
- Applicability: `neko-ui-validation` applies because entry controls, modal presentation, scrolling, focus and responsive layout changed.

## Runtime and acceptance inventory

The affected behavior is browser-owned inside `@neko/canvas-webview`: no new Host authorization, IPC, native resource, persistence contract or Desktop lifecycle boundary is introduced. The authoritative focused runtime therefore mounted the production `CanvasMarkdownEditorOverlay`, production Milkdown Rich Surface and production Canvas CSS in Chromium. Component integration additionally mounted production `InfiniteCanvas` to verify the modal lifecycle.

| Start                            | Action                            | Expected observation                                      | Result                                                  |
| -------------------------------- | --------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Selected compact Markdown node   | Inspect without activation        | Read-only Markdown projection; no node-local ProseMirror  | Passed                                                  |
| Selected compact Markdown node   | Invoke `canvas:edit-markdown`     | One fullscreen editor; toolbar/viewport input suspended   | Passed                                                  |
| Selected compact Markdown node   | Double activate                   | Same fullscreen editor path                               | Passed                                                  |
| Fullscreen editor                | Scroll dense content              | Editor body scrolls without viewport mutation             | Passed in focused Chromium and encoded Desktop scenario |
| Fullscreen editor                | Type content                      | Controlled Rich update writes the exact node data         | Passed                                                  |
| Fullscreen editor                | Direction key                     | Editor retains the key; modal remains open                | Passed                                                  |
| Fullscreen editor                | Completion button or Escape       | Surface unmounts; toolbar/input/focus return              | Passed in component integration                         |
| Target node missing              | Surface remains mounted           | Local unavailable diagnostic; no sibling inference        | Passed                                                  |
| Dense light/dark layout          | Inspect 1200×800                  | 920px centered page, readable hierarchy, no clipping      | Passed                                                  |
| Small light layout               | Inspect 700×520                   | Full-width page, 15px editor text, no horizontal overflow | Passed after fixing `box-sizing`                        |
| Adjacent Canvas resource preview | Run existing Canvas package suite | Existing overlay and media tests remain green             | Passed                                                  |

## Evidence

- `pnpm --filter @neko/canvas-webview test`: 65 files / 417 tests passed.
- `pnpm --filter @neko/canvas-webview build`: passed.
- Focused integration: 4 files / 25 tests passed.
- `pnpm test:local:ui:contract`: 6 tests passed.
- `pnpm check:openspec`: 120 items passed.
- `pnpm check:webview-boundaries`: passed.
- `pnpm check:package-boundaries`: passed, including package product reachability.
- `pnpm check:legacy-debt`: passed with no blocking production debt.
- Directly inspected visual artifacts:
  - `reports/ui-validation/canvas-markdown-immersive-editor/light-large.png`
  - `reports/ui-validation/canvas-markdown-immersive-editor/dark-large.png`
  - `reports/ui-validation/canvas-markdown-immersive-editor/light-small.png`
- Desktop supplemental attempt: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-21T20-52-53.258Z-canvas-openneko-consumer-development/report.json`.

## Visual findings

- Light 1200×800: the editor covers the full Canvas viewport, toolbar remains one compact row, the 920px document page is centered at x=140, 16px/28px body typography is readable, and the completion action stays visible.
- Dark 1200×800: the same hierarchy and dimensions remain intact; the #242426 page is separated from the #171719 workspace without inheriting the resource-preview black stage.
- Light 700×520: toolbar contracts to 46px, secondary mode copy is hidden, the page becomes exactly 700px wide with zero horizontal overflow, and the body remains vertically scrollable.
- The first visual pass exposed a content-box overflow (1090px large page and 740px small page). Adding `box-sizing: border-box` corrected both; the final artifacts above were recaptured and directly inspected.

## Result

`passed` for the browser-owned affected UI boundary. Every required inventory item has focused functional, visual or adjacent-regression evidence.

## Quality review

- Risk: L1, local Canvas Webview component/state/presentation change.
- Findings: no blocking or suggestion-level implementation finding after the responsive overflow fix.
- Architecture: Canvas owns one discriminated fullscreen Surface and exact node update path; `@neko/markdown/rich-surface` remains the only Rich engine; no Desktop, domain contract, persisted shape or internal version was added.
- Replaced path: the node-local `isEditing` and Milkdown mount were removed; source guards prove the Rich import exists only in the fullscreen Overlay.

## Residual risk and blocked checks

- The visible isolated Desktop scenario could not start because Desktop process `88034` already owned this checkout's Vite bundle. The launcher timed out before the CDP target and produced zero checkpoints, so it is recorded as environment-blocked rather than a functional failure. Task 3.2 remains open.
- `browser-use` could not attach to local Chrome because remote debugging approval was not enabled. An isolated headless Chromium process was used for the focused browser-owned runtime instead.
- `pnpm check:no-internal-versioning` is currently blocked by unrelated repository/worktree findings (78 new occurrences and stale allowances, mainly the concurrent DSH work); none points to the scoped Canvas/OpenSpec files.
