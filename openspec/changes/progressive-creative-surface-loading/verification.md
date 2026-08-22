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

## Workbench Surface Bootstrap Extension — 2026-08-14

### Canonical Path Evidence

- Canvas, Text Editor, and Resource Browser now create one package-owned bootstrap resource at the Desktop Surface boundary beside their lazy Root import.
- Each bootstrap starts its exact subscription and initial projection before the React module resolves, retains the latest result, and replays it to the eventual UI subscriber without issuing a second Root-owned request.
- Canvas publishes the authoritative document Snapshot first, then reattaches Generation nodes asynchronously through the same exact Session projection. A slow or invalid Generation node no longer blocks unrelated Canvas nodes or the initial document UI.
- Resource Browser keeps one host subscription while presenting a subscriber-local contiguous event sequence, so data prepared before module readiness cannot violate the Root's event-order contract.
- Surface unmount disposes only the exact bootstrap/subscription; StrictMode remount does not create a parallel authority or hidden Root.

### Automated Verification

- `pnpm --filter @neko/canvas-webview test`: passed, 65 files / 409 tests.
- Focused Desktop Canvas runtime/Surface tests: passed, 51 tests.
- `pnpm --filter @neko/canvas-webview build`: passed.
- `pnpm --filter @neko/text-editor-webview test`: passed, 5 files / 49 tests.
- `pnpm --filter @neko/text-editor-webview build`: passed.
- `pnpm --filter @neko/assets-webview test`: passed, 8 files / 66 tests.
- `pnpm --filter @neko/assets-webview build`: passed.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `openspec validate progressive-creative-surface-loading --strict`: passed.
- `pnpm check:application-boundaries`: passed, 1706 files with no findings.
- `pnpm check:webview-boundaries`: passed.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- `pnpm check:unused`: passed with no findings.
- `pnpm smoke:webview`: blocked before scoped packages by the pre-existing Agent fixture type error in `packages/agent/webview/src/extension-management/root.test.tsx:161` (`plugin-tools` is not assignable to `personal | plugin`). All three changed Webview package builds passed independently.
- `pnpm test:functional:headless`: 187/189 passed. The two failures are pre-existing expectation drift in standalone Character slot placement and Resource Browser project-content routing; neither enters the new bootstrap resources.

### Authoritative Electron UI Validation

Applicability: applicable. The change affects Workbench loading, document switching, and the visible relationship between Canvas/Text Editor/Resource Browser readiness.

Runtime: real Electron Main/preload/renderer launched with the Desktop development entry. Direct pixel and accessibility-tree inspection were both used.

Observed acceptance:

- Cold project open: Canvas document and Resource Browser file tree became visible in the same Workbench composition; neither waited for the other and the Canvas did not remain on `加载画布中`.
- Canvas initial projection: the existing media node, minimap, toolbar, zoom controls, and `1 nodes | 0 connections` projection were present on the first ready frame.
- Text Editor switch: `test.md` mounted its WYSIWYG editor while the Resource Browser remained ready; the window Shell and Agent panel were not remounted or blocked.
- Warm switch back to `test.nkc`: Canvas and Resource Browser were both ready within the inspected frame, with no global loading overlay or stale Text Editor UI.
- Adjacent surface: the Agent composition remained responsive throughout Canvas/Text Editor switches.

Result for the Workbench bootstrap extension: passed.

Development-runtime note: adding new package export specifiers while an old Vite process was already running produced stale export-map errors until that process was restarted. The first fresh start also triggered Vite dependency optimization/reload for Milkdown. After the complete Electron + Vite runtime was restarted and optimization settled, the authoritative cold/warm observations above passed. This is development-server lifecycle evidence, not an accepted fallback path in product code.

### Extension Residual Risk

- The Canvas media element was visible but still reported its own `正在缓冲` state during inspection. Media playback readiness is a separate resource/codec path and is not treated as evidence for or against document bootstrap completion.
- No numeric cold-start latency budget was measured; this verification establishes independent progress and absence of the previous serial/global loading dependency, not a millisecond performance guarantee.

## Canvas Video Content-Box Alignment — 2026-08-14

- Canonical path: Canvas `MediaNode` -> Preview `LightweightPreview` -> shared `VideoPlayer` -> one native `<video>` element. No Canvas-specific player or media capability path was added.
- Layout contract: the native video element now fills the owning preview width and height; `object-fit: contain` preserves picture ratio inside that exact content box.
- `pnpm --filter @neko/preview-webview test`: passed, 20 files / 112 tests.
- `pnpm --filter @neko/canvas-webview test`: passed, 65 files / 409 tests.
- `pnpm --filter @neko/preview-webview build`: passed.
- `pnpm check:webview-boundaries`: passed.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- `pnpm check:unused`: reported only pre-existing Canvas findings outside this change (`@neko/media` in Canvas Domain and two `previewResolver` exports); no changed Preview file was reported.
- Authoritative Electron inspection: passed at 100% and 173% Canvas zoom. The black media field matched the node frame, native controls/progress aligned to the content-box bottom, and the source picture remained centered and undistorted with expected letterboxing.
- Adjacent path: Main Preview and Lightweight Preview remain covered by the shared-element test and use the same full-size video element; control density remains the only presentation difference.

## Preview Runtime Restoration — 2026-08-22

### Canonical Path Evidence

- Pinned and side Preview Views persist only canonical `ContentLocator`, content kind, presentation and stable View identity. Absolute paths, opaque resource URLs and live Preview descriptors remain process-local.
- A renderer or application restart resolves the exact stored Workspace authority, re-authorizes the locator, creates a fresh resource lease and republishes the same Preview View through the single Preview runtime path.
- Old Preview presentation records without `ContentLocator` are removed locally with a `desktop-presentation-reset` diagnostic. Source content and sibling Workspace Views remain intact.
- A locator whose current source no longer exists reaches only its exact Preview session as `preview-source-unavailable`; it does not reset the Workbench or replace the source with stale bytes.

### Automated Verification

- Focused Preview/Host contract tests: passed, 4 files / 114 tests.
- `pnpm --filter @neko/host exec tsc --noEmit`: passed.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- Scoped ESLint and Prettier checks: passed.
- `pnpm exec openspec validate progressive-creative-surface-loading --strict`: passed.
- `pnpm install --lockfile-only --offline --ignore-scripts`: passed for all workspace projects.

### Quality And UI Review

- `neko-quality-review`: no blocking or scoped architecture finding. Content identity remains owned by `@neko/content`; Host owns durable presentation identity; Desktop Main owns Workspace authorization and opaque resource lifetime; Preview Domain remains the sole runtime/session projection owner.
- `neko-ui-validation` applicability: applicable because the fix changes the user-visible Preview unavailable/recovery state, while intentionally preserving the current UI.
- Authoritative restarted-Electron inspection is blocked: `pnpm --filter @neko/app-desktop build` was rejected because Desktop process `18857` already owns this checkout's Vite bundle. The active user process was not terminated. The running instance cannot validate the new Main-process code until restarted.

### Residual Risk

- Production packaging and direct reload/reopen pixel inspection remain pending until the current Desktop process is closed and a fresh build/runtime is started.
- Missing or moved source content is intentionally fail-visible in the exact Preview; no historical path, opaque URL, cached payload or active-Workspace fallback is used.
