## 1. Canonical Progressive Rendering

- [x] 1.1 Delete the hidden full-spine measurement container, serialized measurement queue, measurement-only state, and warm-all chapters effect from `EpubViewer`.
- [x] 1.2 Keep `loadChapterContent` as the only waterfall `section.render()` owner and preserve viewport observer load/unload plus bounded navigation prefetch.
- [x] 1.3 Preserve estimated unloaded chapter heights, measured loaded chapter heights, scroll correction, page metrics, mode switching, and exact reading-position restore.

## 2. Regression Coverage

- [x] 2.1 Add deterministic tests proving the target chapter neighborhood is bounded and unrelated spine entries are excluded.
- [x] 2.2 Add path-level proof that waterfall production code has one chapter render call and no full-spine measurement/warm path.
- [x] 2.3 Run `pnpm --filter @neko/preview-webview test`, typecheck/build, formatting, strict OpenSpec validation, and scoped diff checks.

## 3. Runtime Qualification

- [ ] 3.1 Validate a large image EPUB in visible Electron: loading overlay clears, first chapter is interactive, distant navigation works, and unloaded chapters do not build DOM or decode images.
- [x] 3.2 Apply `neko-quality-review` and record the remaining complete-ZIP archive read as explicit performance risk rather than claiming byte-range lazy loading.
