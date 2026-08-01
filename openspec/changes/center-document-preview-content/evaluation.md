# Evaluation

Date: 2026-08-01

## Risk And Review

- Classification: L1. The change is confined to EPUB layout inside the Preview Webview. It does
  not change Desktop IPC, content authorization, shared contracts, persisted project data, or
  other document renderers.
- Architecture: `EpubViewer` remains the sole owner of EPUB presentation. Existing image, PDF,
  CBZ, and DOCX paths were audited and already center their content, so no shared Preview
  container or package-local design system was added.
- Canonical paths: live and offscreen waterfall chapters invoke one image-layout normalizer after
  EPUB resource rewriting; paginated content continues through one epub.js theme.
- Focused review findings: none. The changed production lines add no `any`, `console.log`, unsafe
  assertion, retry, compatibility branch, silent fallback, or cross-runtime dependency.

## Verification

- PASS: focused EPUB regression suite, `11/11`.
- PASS: `pnpm --filter @neko/preview-webview test`, `84/84`.
- PASS: `pnpm --filter @neko/preview-webview build`.
- PASS: `pnpm package:desktop`.
- PASS: `openspec validate center-document-preview-content --strict`.
- PASS: scoped `git diff --check`.
- PASS with four pre-existing warnings outside changed lines:
  `pnpm exec eslint packages/neko-preview-webview/src/epub/EpubViewer.tsx packages/neko-preview-webview/src/epub/EpubViewer.test.tsx`.

## Desktop Qualification

- Launched the packaged `OpenNeko.app` with both `OPENNEKO_DESKTOP_FUNCTIONAL_HOME` and
  `--user-data-dir` bound to a temporary `openneko-desktop-functional-*` root.
- Opened only the committed synthetic image EPUB from that isolated workspace through Project
  Resources and the real Desktop Preview descriptor/resource-gateway path.
- PASS: the initial waterfall chapter exposed both synthetic page images with no document error.
- PASS: after applying the live DOM layout normalizer and repackaging, the image page moved from
  the left content padding to the horizontal center of the Preview area.
- Evidence:
  `reports/webview-functional/center-document-preview-content/epub-waterfall-centered.jpeg`
  (gitignored, synthetic fixture only).
- BLOCKED for paginated visual qualification: switching modes reaches the existing epub.js
  rendition path and then surfaces `Cannot read properties of undefined (reading 'hooks')` before
  iframe content renders. The new paginated theme contract is covered by unit tests; no fallback or
  error suppression was added.

## Residual Risk

The target waterfall layout shown in the user report is covered by focused tests and a packaged
Electron screenshot. Paginated theme declarations are verified but their final iframe geometry
cannot be visually qualified until the owning pre-existing `rendition.hooks` failure is fixed.
