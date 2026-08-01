## Why

Image-based EPUB chapters currently align their page canvas to the left side of the Preview
viewport, leaving uneven whitespace on wide windows. Preview should present document pages and
images consistently in the visual center without changing their aspect ratio or overflowing the
available width.

## What Changes

- Center the EPUB waterfall chapter canvas within the available Preview viewport.
- Center raster images and image-bearing SVG pages while preserving aspect ratio and constraining
  them to the available width.
- Apply the same image-page alignment rules to paginated EPUB rendering.
- Add regression coverage for the live waterfall content path and the paginated epub.js theme.
- Qualify the layout with an isolated image-based EPUB in the real Electron Desktop Preview path.

## Capabilities

### New Capabilities

- `epub-preview-layout`: Defines centered, width-constrained presentation for EPUB chapter canvases,
  raster images, and image-bearing SVG pages in waterfall and paginated modes.

### Modified Capabilities

None.

## Impact

- `packages/neko-preview-webview/src/epub/EpubViewer.tsx`
- `packages/neko-preview-webview/src/epub/EpubViewer.test.tsx`
- Preview Webview tests and real Electron Desktop Preview qualification
- No Desktop IPC, resource-access contract, persisted project data, or shared UI changes
