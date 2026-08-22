## 1. Drag surface behavior

- [x] 1.1 Add BaseNode component tests proving label, top rail and bottom rail enter the existing drag hook.
- [x] 1.2 Make external labels pointer-active drag-allow surfaces without changing their visual placement.
- [x] 1.3 Add top and bottom edge rails outside the content box, below selected transform handles in stacking order.

## 2. Regression and acceptance

- [x] 2.1 Retain and run hook tests for controls, explicit block areas and horizontal/vertical scrollbar ownership.
- [x] 2.2 Run Canvas Webview tests/build and strict OpenSpec validation.
- [x] 2.3 Use `neko-quality-review` to audit the unique drag/move path, event ownership and absence of transparent content overlays.
- [ ] 2.4 Use `neko-ui-validation` to exercise dragging from title/top/bottom and scrolling from text content; record blocked runtime evidence visibly.
