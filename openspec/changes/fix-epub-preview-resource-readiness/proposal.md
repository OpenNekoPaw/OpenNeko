## Why

Large image-based EPUB files can render broken cover or page images during the first Preview
paint, then show them after the waterfall viewer unloads and reloads a chapter. The viewer treats
epub.js metadata readiness as full archive-resource readiness, so the initial chapter can be
serialized before epub.js has replaced archive-relative image and stylesheet references.

## What Changes

- Require archived EPUB resources to be fully projected before the first chapter render.
- Keep waterfall virtualization behind one resource-readiness barrier instead of relying on a
  later unload/reload to repair the view.
- Surface failed EPUB image resources as a visible Preview diagnostic rather than accepting a
  broken image as settled content.
- Add deterministic regression coverage for delayed resource replacement and the initial visible
  chapter path.
- Qualify the fix with an isolated, image-based EPUB in the real Electron Desktop Preview path.

## Capabilities

### New Capabilities

- `epub-preview-resource-readiness`: Defines first-render readiness, image failure diagnostics,
  waterfall virtualization behavior, and path-level Desktop Preview acceptance for archived EPUB
  resources.

### Modified Capabilities

None.

## Impact

- `packages/neko-preview-webview/src/epub/EpubViewer.tsx`
- `packages/neko-preview-webview/src/epub/EpubViewer.test.tsx`
- Preview Webview tests and real Electron Desktop Preview qualification
- No Desktop IPC, persisted project data, or public package contract changes
- The unified OpenNeko resource transport owns the transient outer archive URL; this change owns
  only EPUB-internal resource readiness and does not add another transport.
