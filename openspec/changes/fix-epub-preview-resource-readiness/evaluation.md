# Evaluation

Date: 2026-08-01

## Risk And Review

- Classification: L1. The change is confined to the Preview Webview EPUB component and its
  package-local resource lifecycle. It does not change Desktop IPC, shared contracts, persisted
  data, or archive authorization.
- Architecture: epub.js remains the sole owner of EPUB archive parsing and browser-safe resource
  projection. Preview has one readiness path through `book.opened`; no retry, fallback renderer,
  Desktop archive reader, or parallel readiness fact was added.
- Async lifecycle: book epoch, book identity, chapter element identity, and loaded-chapter state
  fence asynchronous settlement before it can update the active document error surface.
- Focused review findings: none. The changed production lines add no `any`, `console.log`, unsafe
  type assertion, compatibility branch, retry, or silent success fallback.

## Verification

- PASS: `pnpm --filter @neko/preview-webview exec vitest run src/epub/EpubViewer.test.tsx`
  (`9/9` tests).
- PASS: `openspec validate fix-epub-preview-resource-readiness --strict`.
- PASS: `git diff --check`.
- PASS with pre-existing warnings outside the changed lines:
  `pnpm exec eslint packages/neko-preview-webview/src/epub/EpubViewer.tsx packages/neko-preview-webview/src/epub/EpubViewer.test.tsx`.
  ESLint reported zero errors and four existing warnings in later, unchanged sections of
  `EpubViewer.tsx`.
- BLOCKED: `pnpm --filter @neko/preview-webview build`. The package uses `tsc --noEmit` as its
  build/typecheck. Current unrelated `ContentLocator` migration errors remain in `ModelViewer.tsx`,
  `sourceModelViewerHost.test.ts`, `threeRuntime.test.ts`, and `root/index.tsx`; no error points to
  the changed EPUB files.
- PASS in a detached clean-baseline worktree with only the focused EPUB patch applied:
  `pnpm --filter @neko/preview-webview build`. This proves the focused production and test changes
  typecheck against the repository baseline.
- BLOCKED: `pnpm --filter @neko/preview-webview test` completed with `81` passing tests and two
  unrelated failures in `sourceModelViewerHost.test.ts`, both caused by invalid current
  `3D Reference` staging under the same contract migration.

## Desktop Qualification

The first `pnpm test:local:ui` attempt was discarded. The current Desktop Main/preload build failed
because `parseDocumentArchiveResourceRef` is imported from `@neko/types` without a corresponding
export in the dirty worktree. Electron then launched against stale output and used the ordinary
Desktop user data instead of the requested temporary isolated directory. The process was terminated
immediately after confirming the isolation failure, before opening an EPUB.

A valid qualification used a detached worktree at the current `HEAD`, applied only the focused EPUB
production and test diff, installed the locked dependencies offline, and ran:

- PASS: `pnpm package:desktop`.
- PASS: direct packaged `OpenNeko` launch with both `OPENNEKO_DESKTOP_FUNCTIONAL_HOME` and
  `--user-data-dir` pointing to temporary roots whose names matched the functional-fixture safety
  contract.
- PASS: the initial Desktop state showed zero recent projects and created its database plus Electron
  state only below those temporary roots.
- PASS: Computer Use opened the isolated workspace, expanded Project Resources, and opened the
  synthetic image-based EPUB through the real Desktop Preview descriptor and Renderer source URL.
- PASS: the first post-open accessibility state contained `synthetic page 1` and
  `synthetic page 2`; the stable screenshot showed the first page without a broken-image frame,
  document error, mode switch, unload/reload, or retry.
- PASS for the target resource failure contract: Electron logging contained no image `error`,
  `Network.loadingFailed`, `Failed to settle chapter`, or delayed recovery diagnostic.

Evidence:

- `reports/webview-functional/epub-resource-readiness/desktop-initial-page.jpeg` (gitignored,
  isolated synthetic fixture only).

Electron did emit existing CSP diagnostics for blocked inline styles and epub.js attempts to set a
base URI under `base-uri 'none'`, plus existing unknown `document:statusUpdate` /
`document:saveState` message logs. The images still used resolved blob URLs and rendered
successfully. These diagnostics are not image fetch failures and were not introduced or hidden by
this change.

## Residual Risk

The target EPUB broken-image/recovery path is covered by deterministic tests and an isolated
packaged Electron run. The current dirty worktree still cannot run its normal Preview package build
or `pnpm test:local:ui` safely because of unrelated contract migration and launcher isolation
defects. Existing EPUB-adjacent CSP and document-message diagnostics remain visible and should be
handled by their owning Desktop security/message changes; they do not currently prevent the
projected images from loading.
