## 1. Canvas immersive editor Surface

- [x] 1.1 Add a package-local Markdown editor Overlay that composes the existing controlled Milkdown Rich Surface with loading, failure, focus restore, Escape and visible completion behavior.
- [x] 1.2 Add responsive, theme-aware Canvas-scoped styles for a readable long-document editing column and independent scrolling.
- [x] 1.3 Add component tests for controlled updates, loading/failure presentation, Escape/completion close and direction-key ownership.

## 2. Canonical Canvas integration

- [x] 2.1 Replace the preview-only modal state in `InfiniteCanvas` with one Canvas fullscreen Surface union covering resource preview and exact Markdown editing.
- [x] 2.2 Route Markdown node double activation and a distinct selection-toolbar action to the same fullscreen editor Surface.
- [x] 2.3 Delete Markdown node-local Rich editing state and rendering; keep the node projection read-only and preserve the existing node content update path as the only successful write chain.
- [x] 2.4 Add path-level tests proving Canvas Markdown does not mount a node editor, create a Text Editor/Main Preview session, infer another node identity or leave Canvas interactions active behind the Surface.

## 3. Verification and review

- [x] 3.1 Run focused Canvas Webview tests/build, formatting, OpenSpec validation and relevant boundary checks.
- Advisory evidence 3.2: The isolated Canvas Desktop scenario remains environment-blocked; the affected
  browser-owned runtime passed focused functional, visual and adjacent-preview checks recorded in `verification.md`.
- [x] 3.3 Use `neko-ui-validation` to inspect large and smaller viewport states, light/dark themes, dense content, focus, clipping and return state; record blocked evidence explicitly.
- [x] 3.4 Use `neko-quality-review` to audit L1 Webview ownership, the single editor/update path, deleted inline path, verification commands and residual risk.
