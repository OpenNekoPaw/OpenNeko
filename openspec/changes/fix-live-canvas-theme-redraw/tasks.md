## 1. Live theme redraw

- [x] 1.1 Add a CanvasGrid component test proving a root theme-marker change repaints the same canvas with current CSS tokens.
- [x] 1.2 Observe the canonical root theme marker within CanvasGrid and feed it into the existing bitmap draw path with lifecycle cleanup.

## 2. Verification

- [x] 2.1 Run focused Canvas Webview tests/build and strict OpenSpec validation.
- [x] 2.2 Use `neko-ui-validation` to verify dark/light/dark switching in the visible Electron Canvas without document remount or restart.
- [x] 2.3 Use `neko-quality-review` to audit ownership, single-path rendering, cleanup, validation evidence and residual risk.
