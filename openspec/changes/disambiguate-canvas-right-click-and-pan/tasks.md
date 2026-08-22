## 1. Gesture contract

- [x] 1.1 Add hook tests for early and late native `contextmenu`, stationary click, sub-threshold jitter and threshold-crossing drag.
- [x] 1.2 Replace move-time menu suppression with a typed right-pointer release disposition and deterministic local state cleanup.
- [x] 1.3 Keep right-pointer viewport updates dormant below threshold while preserving immediate middle/Space/hand-tool pan.

## 2. Menu composition

- [x] 2.1 Add an InfiniteCanvas menu-request callback that receives the exact right-button release event.
- [x] 2.2 Wire CanvasApp's existing `handleContextMenu` into the release callback without duplicating menu construction or node selection.
- [x] 2.3 Add component evidence that click release requests the menu while drag release does not.

## 3. Verification

- [x] 3.1 Run focused and complete Canvas Webview tests, TypeScript build and strict OpenSpec validation.
- [x] 3.2 Run Webview/package boundary checks, scoped formatting/lint and diff integrity checks.
- [x] 3.3 Use `neko-quality-review` to audit the unique gesture/menu path, cleanup and adjacent input ownership.
- [ ] 3.4 Use `neko-ui-validation` to verify right click, sub-threshold jitter, right drag, node menu targeting and adjacent wheel/left/middle gestures in the authoritative runtime; record blocked evidence visibly.
