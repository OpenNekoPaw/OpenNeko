## 1. Regression Contracts

- [x] 1.1 Update Canvas shell and toolbar tests for the original floating placement and removed settings action
- [x] 1.2 Add viewport interaction tests for ordinary wheel pan, modifier wheel zoom, right-drag suppression, and stationary right-click propagation

## 2. Floating Toolbar

- [x] 2.1 Move `CanvasToolbar` from the workbench rail into the Canvas surface overlay
- [x] 2.2 Apply auto-height pill styling with theme tokens and bounded overflow
- [x] 2.3 Remove the settings toolbar action, unreachable CanvasApp state/mount path, and orphaned panel implementation

## 3. Viewport Navigation

- [x] 3.1 Normalize wheel deltas and make unmodified wheel input pan the viewport
- [x] 3.2 Preserve pointer-anchored zoom for `Ctrl/Meta` wheel input
- [x] 3.3 Add right-button pan initiation and drag-threshold tracking to the canonical viewport hook
- [x] 3.4 Consume contextmenu only after a right-button drag while preserving stationary right-click menus

## 4. Verification

- [x] 4.1 Run focused Canvas tests, typecheck/build, lint, and `git diff --check`
- [x] 4.2 Build and copy the Canvas Webview bundle into the extension package
- [x] 4.3 Validate toolbar geometry, wheel pan/zoom, and right-button behavior in Extension Development Host
- [x] 4.4 Complete Neko quality review and record remaining risks

## 5. Visual Refinement

- [x] 5.1 Move the floating toolbar to the left side and update its layout contracts
- [x] 5.2 Render active toolbar buttons with a circular outline and verify the final Extension Host presentation
- [x] 5.3 Remove the Canvas toolbar's redundant left-edge active indicator and re-verify the selected state
- [x] 5.4 Inset the visible active circle within the existing hit target, strengthen its theme-derived contrast, and verify the final selected state
