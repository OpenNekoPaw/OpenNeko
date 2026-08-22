## Verification summary

Risk classification: low-to-medium user-visible L2 presentation change. The change modifies one Preview-owned scoped image selector, no public contract, durable Canvas fact, Desktop adapter or resource source.

## Automated gates

- `pnpm --filter @neko/preview-webview exec vitest run src/root/index.test.tsx` — passed, 24 tests.
- `pnpm --filter @neko/canvas-webview test` — passed, 65 files / 417 tests.
- `pnpm --filter @neko/preview-webview --filter @neko/canvas-webview run build` — passed.
- `pnpm exec openspec validate preserve-preview-image-aspect-ratio --strict` — passed.
- `pnpm check:package-boundaries` — passed, 54 packages checked.
- `pnpm check:webview-boundaries` — passed.
- `pnpm check:canvas-playback-boundary` — passed.
- `git diff --check` — passed.

The complete `@neko/preview-webview` suite has 105 passing tests and one existing architecture-boundary failure because the dirty worktree has deleted `packages/agent/webview/src/components/ChatView/MediaPreview/AgentPreviewCollection.tsx` while the Preview architecture test still reads that path. The changed Preview root test passes independently; this change does not modify the missing Agent consumer or the failing boundary test.

## UI validation

Authoritative component runtime: the actual Canvas `PreviewSurface`, `CanvasFullscreenPreviewOverlay` and Preview `SharedImagePreview` were mounted through Vite and rendered by isolated Chromium. The fixture supplies an authorized descriptor-shaped resource and projects local synthetic image bytes only at the browser evidence boundary.

| State                 | Viewport/theme   | Evidence                                                                                 | Result                                                                                      |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Portrait Canvas node  | 1000×700 / light | `reports/ui-validation/preview-image-contain-layout/node-portrait-light.png`             | 360×240 image box equals Viewer; top and bottom color sentinels present.                    |
| Landscape Canvas node | 1000×700 / dark  | `reports/ui-validation/preview-image-contain-layout/node-landscape-dark.png`             | 360×240 image box equals Viewer; left and right sentinels present.                          |
| Portrait fullscreen   | 1200×800 / light | `reports/ui-validation/preview-image-contain-layout/fullscreen-portrait-light.png`       | 1164×728 image box equals Viewer; full portrait bounds visible.                             |
| Landscape fullscreen  | 640×480 / dark   | `reports/ui-validation/preview-image-contain-layout/fullscreen-landscape-dark-small.png` | 620×424 image box equals Viewer; full landscape bounds visible without viewport overflow.   |
| Local image loading   | 1000×700 / light | `reports/ui-validation/preview-image-contain-layout/node-image-loading-light.png`        | Preview-owned localized loading state remains centered in the fixed node Surface.           |
| Local image failure   | 1000×700 / dark  | `reports/ui-validation/preview-image-contain-layout/node-image-error-dark.png`           | Preview-owned localized diagnostic remains visible; sibling Canvas shell remains available. |

For all four ready states, computed `position` is `absolute`, `object-fit` is `contain`, intrinsic dimensions remain 400×1200 or 1200×400, and both red start-edge and blue end-edge pixels were detected. Fullscreen programmatic zoom produced `matrix(1.2, …)` and reset returned `matrix(1, …)`. Existing Canvas tests verify wheel isolation and exact resource lifecycle. The selector is image-only, and the full Canvas suite covers adjacent video/audio Surface behavior.

Direct image review confirmed complete edge markers, preserved proportions, centered letterboxing, readable fullscreen controls in light/dark themes, and no clipping at the smaller viewport.

The visible Electron `canvas-openneko-consumer` scenario was attempted but the Desktop CDP target never became ready before timeout, so no new Desktop screenshot/report was produced. This is recorded as a runtime startup limitation; it did not reach an image assertion.

## Quality review

- Ownership: fit logic remains solely in `@neko/preview-webview` L2; Canvas callers contain no `<img>`, `objectFit` or intrinsic-dimension calculation.
- Canonical path: node and fullscreen callers both delegate through `LightweightPreview` to `SharedImagePreview`; no fallback source, caller mode or second renderer was added.
- Data safety: existing node sizes and Canvas viewport facts are unchanged; only the image presentation box changed.
- Adjacent risk: explicit user zoom still intentionally clips outside the Viewer after enlargement; reset restores contain. New image nodes created through generic authoring still start at the canonical 4:3 default, while Workspace artifact projection uses intrinsic ratio. That creation-policy inconsistency is outside this crop fix and does not reintroduce clipping.

No blocking quality findings remain in the changed path.
