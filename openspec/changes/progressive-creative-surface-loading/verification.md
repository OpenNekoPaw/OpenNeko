## Scope And Risk

- Risk: L3. The change crosses Desktop Main authorization, local ZIP/file IO, Preview contracts, Renderer lifecycle, lazy Webview modules, and Electron packaging.
- User data: read-only. No EPUB, OTIO, Canvas, project, or presentation facts are rewritten.
- Canonical path: visible Surface bootstrap -> exact Host Snapshot -> demand-driven publication -> sender-bound opaque resource -> exact lazy Viewer.

## Architecture Evidence

- Cut and Preview start one exact Snapshot when the visible Surface commits; lazy module readiness is independent.
- Preview navigation registers a `loading` session. The first exact Snapshot deduplicates preparation and commits only `loading -> ready | unavailable`.
- PDF, DOCX, EPUB, CBZ, Model, Audio, and Video use exact dynamic imports. Quick Preview has a separate public entry.
- EPUB uses one Content Node ZIP index and exact entry decompression. Desktop projects a generic sender-bound resource tree; the Renderer receives only its opaque base URL.
- epub.js uses directory mode with `replacements: 'none'`; the full archive URL path is removed.
- Close/detach/dispose abort pending work. A registration completing after close is immediately released and cannot commit stale state.

## Automated Verification

- `openspec validate progressive-creative-surface-loading --strict`: passed.
- `openspec validate make-epub-preview-viewport-lazy --strict`: passed.
- Scoped Prettier check: passed.
- `pnpm --filter @neko/content test`: passed, 18 files / 115 tests.
- `pnpm --filter @neko/content typecheck`: passed.
- `pnpm --filter @neko/preview-domain test`: passed, 5 files / 28 tests.
- `pnpm --filter @neko/preview-webview test`: passed, 20 files / 97 tests.
- `pnpm --filter @neko/preview-webview build`: passed.
- `pnpm --filter @neko/cut-webview test`: passed, 33 files / 256 tests.
- `pnpm --filter @neko/cut-webview build`: passed.
- Focused Desktop Preview/resource/Surface/architecture tests: passed, 43 tests.
- `pnpm --filter @neko/app-desktop test`: passed, 75 files / 487 tests.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm --filter @neko/app-desktop build`: passed; darwin-arm64 package output verified.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- Content access, application, Webview, and workspace dependency boundary checks: passed.
- `pnpm check:unused`: no finding in changed code; command remains non-zero for the pre-existing `DesktopShell.activateWorkbenchMainView` unused export.

## UI Validation

Applicability: applicable. Loading, ready, unavailable, exact Viewer selection, EPUB content, close/release, and adjacent image/audio/video/PDF/model behavior are user-visible.

Authoritative runtime: isolated real Electron Main/preload/renderer Desktop scenario, because local authorization, custom protocol, session lifecycle, and resource release cannot be accepted in a browser-only runtime.

Acceptance inventory:

- Cut: visible loading state while module and Snapshot initialize; ready timeline; final unmount release.
- Preview: visible loading state; exact Viewer ready/error state; no stale Snapshot overwrite; final unmount release.
- EPUB: virtual-directory metadata/current chapter requests; no complete ZIP request; bounded distant chapter; close revokes all entry URLs.
- Adjacent: image, audio, video midpoint, PDF, GLB, and glTF dependency preview/release.

Result: blocked.

- Packaged target report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T18-41-33.364Z-preview-openneko-consumer-packaged/report.json`. CDP did not become ready; the process produced no visual evidence.
- Development reports: `2026-08-08T18-42-59.534Z`, `18-44-35.834Z`, and `18-46-33.178Z` under the same report root. Port 5173 was occupied by an existing Desktop dev process, so Forge used 5174. The isolated functional cache repeatedly discovered dependencies and reloaded Vite during the first interaction; the Preview Root was no longer observable before capture.
- No stable current screenshot was produced. Per `neko-ui-validation`, functional tests and package success do not substitute for direct pixel inspection.

## Quality Review

- Findings: no blocking or scoped suggestion after cancellation-race, dependency declaration, unused-export, contract, and architecture review.
- Responsibility: Content Node owns ZIP facts and reads; Preview Domain owns EPUB MIME; Desktop owns authorization/projection; Webview owns presentation and viewport rendering.
- Coupling: the Desktop resource registry remains container-agnostic; Preview Webview has no Node/Electron/path access.
- Extension: another read-only archive-backed viewer can reuse the resource-tree boundary without adding EPUB logic to Desktop.
- Testability: each owner has focused unit/contract tests plus Desktop integration and package build coverage.

## Residual Risk

- Visible cold/warm Cut and large-image EPUB latency and pixels remain unqualified because authoritative UI capture was blocked.
- ZIP central-directory indexing is range-based and cancellable, but its latency on unusually large entry counts has not been benchmarked.
- Development Vite dependency discovery can reload the isolated fixture before first interaction; this is a validation-environment limitation, not accepted UI evidence.
