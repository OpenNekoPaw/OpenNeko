## Context

The Preview Webview already centers ordinary images, PDF pages, CBZ pages, and DOCX page
containers. EPUB waterfall rendering owns a separate DOM path in `EpubViewer`: its offscreen
measurement article has an explicit horizontal margin, while the live article relies on a utility
class and the injected EPUB stylesheet only centers raster `img` elements and SVG `image` nodes.
An SVG `image` node cannot center its containing SVG page, so fixed-layout comic EPUBs can remain
left aligned. Paginated rendering uses an epub.js theme and needs the same presentation contract.

## Goals / Non-Goals

**Goals:**

- Keep the live waterfall article and its offscreen measurement counterpart under the same
  explicit horizontal-alignment rule.
- Center raster images and image-bearing SVG page canvases without exceeding the Preview width.
- Preserve intrinsic aspect ratio and apply equivalent behavior in epub.js paginated mode.
- Cover the canonical live and paginated styling paths with focused regression tests.

**Non-Goals:**

- Change PDF, CBZ, DOCX, or ordinary image rendering.
- Change EPUB archive loading, resource projection, navigation, or persistence.
- Introduce a shared Preview container, new component, IPC message, or public contract.
- Rewrite publisher typography or force all non-image SVG illustrations to behave as full pages.

## Decisions

### Keep ownership in `EpubViewer`

The change remains inside the EPUB renderer because the mismatch is specific to EPUB chapter DOM
and epub.js iframe theming. Existing document renderers already meet the alignment requirement, so
a shared container would broaden coupling without a second unmet caller.

### Align the page canvas instead of only its SVG `image` child

Waterfall content normalization will target raster images and SVG elements that contain an
`image`, make each page a block, constrain its maximum width, preserve automatic height, and apply
horizontal auto margins. The declarations are written directly to newly loaded chapter DOM with
`important` priority because the packaged Desktop CSP does not reliably apply the React-injected
waterfall `<style>` element. Targeting image-bearing SVGs avoids changing inline vector icons and
typography decorations.

### Make live and measurement layout explicit

Both waterfall article instances will use the same inline logical margin property. The injected
stylesheet retains typography and theme rules, while page-image geometry uses one explicit DOM
normalizer invoked by both live and offscreen chapter paths. Logical `margin-inline` expresses
chapter-canvas centering across writing directions while page images use `margin: 0 auto` to
preserve publisher-independent vertical geometry.

### Mirror the rule in epub.js themes

Paginated content is rendered in an iframe and cannot inherit the waterfall stylesheet. The same
image-bearing SVG selector and sizing/alignment declarations will therefore be registered in the
epub.js theme.

## Risks / Trade-offs

- `[Publisher SVG uses an image for a non-page illustration]` -> The SVG will be centered and
  width-constrained, which is still a safe readable presentation and does not upscale it.
- `[CSS relational selector support]` -> The supported Electron runtime provides `:has`; the
  isolated packaged Desktop fixture verifies the production renderer rather than relying on jsdom
  alone.
- `[Waterfall measurement diverges from live layout]` -> Regression coverage asserts the live
  article rule, and both paths invoke the same image-layout normalizer.
- `[Paginated runtime fails before iframe content renders]` -> The epub.js theme contract remains
  covered by the focused test; the existing `rendition.hooks` runtime failure is recorded as a
  separate residual risk rather than hidden by a fallback.
