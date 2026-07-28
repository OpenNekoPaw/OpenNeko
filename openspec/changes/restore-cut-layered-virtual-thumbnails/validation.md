# Validation Evidence

Date: 2026-07-27

## Regression boundary

Git history identified `f681b4f0 refactor(cut): rebuild webview on OTIO
presentation` as the regression boundary. That refactor removed the previous
viewport-aware thumbnail planner, incremental missing-range loading,
time/source-key cache, and absolute tile renderer. The replacement reduced a
Clip to at most eight uniformly sampled frames, cached the whole strip by
`revision:clipId:kind`, and stretched those frames with flex layout.

A red-capable planner test reproduced the defect before implementation: a
126.6-second Clip planned only one Clip-wide request rather than a bounded set
of visible tiles.

## Automated validation

The following focused and repository-wide gates passed:

```text
pnpm --dir packages/neko-cut test --run
pnpm --dir packages/neko-cut compile
pnpm --filter @neko/webview test
pnpm --filter @neko/webview build
pnpm build
pnpm test
pnpm check
pnpm check:quality
pnpm check:legacy-debt
pnpm check:unused
pnpm exec openspec validate restore-cut-layered-virtual-thumbnails --strict
git diff --check
```

The planner coverage proves bounded visible-range planning, half-viewport
overscan, stable density layers, overlapping tile reuse after scrolling, and
new edge requests. Host tests prove tile-to-source-time mapping, bounded
concurrency, localized damaged-frame failure, cancellation, and use of the
injected `FrameCapturePort`. Controller and renderer tests reject the removed
Clip-wide schema, enforce the bounded cache, retain valid tile identities
across revisions, and prove absolute tile placement.

## Extension Development Host

Runtime acceptance used only `~/Git/neko-test` and the existing
`.functional/cut-basic.otio` fixture. Validation used the real VS Code
Extension Development Host and inspected the Cut Webview through CDP; no
regular browser was used as acceptance evidence.

- At 80 timeline pixels per second, the 126.6-second Clip selected density 64
  and rendered fixed-width tiles near 200 CSS pixels.
- Scrolling the timeline changed the visible tile range from the initial set to
  indices 6 through 18. Indices 6 through 13 retained identical image sources,
  proving cached overlap reuse while only new edges loaded.
- Zooming to 160 pixels per second selected density 128. Moving from 160 to 170
  retained density 128 and reused the same-layer image sources.
- The Webview showed distinct, continuous frame tiles rather than a stretched
  Clip-wide strip. Its console contained no Cut, media, message, or Engine
  error. The only entry was VS Code's known `local-network-access` feature
  warning.

Evidence:

```text
reports/webview-functional/restore-cut-layered-virtual-thumbnails/cut-density-128.png
reports/webview-functional/restore-cut-layered-virtual-thumbnails/cut-density-128-scrolled.png
```

## Remaining risks

- This change virtualizes thumbnail generation and rendering, not the complete
  Track/Clip DOM.
- The tile cache is bounded in memory and is not persisted across Webview
  recreation.
- Thumbnail extraction continues through the existing
  `FrameCapturePort` JPEG path. No video proxy, playback transcode, or
  neko-engine fallback was added.
