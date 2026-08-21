## 1. Canonical image layout

- [x] 1.1 Add Preview Webview tests that reject intrinsic-size overflow and require a definite two-axis contain box for the shared native image element.
- [x] 1.2 Update the scoped shared image Viewer style so portrait, landscape and extreme-ratio images fit completely at the initial/reset presentation.

## 2. Consumer and interaction verification

- [x] 2.1 Add or update Canvas consumer tests proving node and fullscreen image Surfaces still delegate to the same Preview Viewer without caller-owned image fit logic.
- [x] 2.2 Verify fullscreen zoom/reset and wheel isolation while preserving the Canvas node size and viewport.

## 3. Validation and review

- [x] 3.1 Run focused Preview/Canvas tests and builds, formatting, OpenSpec validation and package-boundary checks.
- [x] 3.2 Use `neko-ui-validation` to inspect portrait and landscape images in Canvas node/fullscreen surfaces across large/small viewports and light/dark themes, including adjacent loading/error and media states.
- [x] 3.3 Use `neko-quality-review` to audit L2 ownership, the single image rendering path, validation evidence and residual risk.
