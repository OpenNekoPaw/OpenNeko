## Scope and risk

- Risk: L2. The change alters ordering between browser-owned Canvas document submission, host-neutral runtime authorization and the Desktop preview delegate.
- Owning boundary: `@neko/canvas-webview` Host adapter. `@neko/canvas-domain` remains the authoritative node/locator validator; Desktop Main/preload/renderer contracts are unchanged.
- Canonical path: Webview Canvas mutation -> `canvasStatus` -> Host operation queue -> `replace-document` -> node-bound preview/text read -> exact runtime authorization.
- Replaced path: preview delegate and text preview no longer bypass an earlier queued document submission. No copy-specific mutation path, locator-only authorization, retry or timeout was added.
- User data: copied refs retain the same canonical `ContentLocator`; `.nkc` shape and source bytes are unchanged.

## Functional verification

Passed:

- `pnpm exec vitest run src/host-runtime/canvas-webview-host.test.ts` from `packages/canvas/webview` — 1 file / 20 tests.
  - The image case blocks `replace-document`, proves resolve is not forwarded early, proves descriptor release remains immediate, then authorizes the copied node after submission.
  - The file case blocks the same submission and proves text preview reaches `ready` only after the exact copied node/locator becomes authoritative.
- `pnpm --filter @neko/canvas-webview test` — 69 files / 434 tests.
- `pnpm --filter @neko/canvas-webview build`.
- `pnpm exec openspec validate serialize-canvas-node-bound-resource-reads --strict`.
- `pnpm check:webview-boundaries`.
- `pnpm check:package-boundaries`.
- `pnpm check:content-access-boundaries`.
- `pnpm check:canvas-playback-boundary`.
- `pnpm test:local:media-openneko` — OpenNeko image/media projection, sender isolation and release lifecycle passed.
- Focused ESLint, Prettier, `node --check` for the Electron scenario and `git diff --check`.

Repository-wide advisory checks:

- `pnpm check:legacy-debt` remains blocked by 25 `shim` matches in five concurrent DSH files under `apps/neko-desktop`, `packages/agent` and related boundaries. The scoped Canvas production diff adds none of the scanned debt terms.
- `pnpm check:unused` reports existing repository-wide unused files, dependencies and exports. It does not identify either changed Canvas Host adapter file or the new OpenSpec artifacts as unused.

## UI validation

**Scope:** applicable. The user-visible behavior is that copied image and text-file reference nodes render their content immediately, without a stale-resource diagnostic or Canvas reopen. Adjacent states are the original reference, duplicate selection/action toolbar, fullscreen preview, persisted reopen and descriptor cleanup.

**Runtime:** the isolated Electron Desktop Canvas scenario is authoritative because the behavior crosses Webview ordering, Canvas Host authority, typed Desktop IPC and native resource projection. Browser/component evidence alone cannot prove this boundary.

**Inventory and evidence:**

- Original EPUB-entry image -> decoded `openneko://resource` image: retained existing Electron scenario assertion.
- Duplicate image -> selected copied identity, decoded image with positive natural dimensions, no role-status diagnostic: added fail-visible scenario assertion.
- Original Markdown file ref -> `data-text-preview-status="ready"`: added fixture assertion.
- Duplicate Markdown file ref -> different selected identity, `ready`/`markdown` content containing the source heading, no unavailable/local-error state: added fail-visible scenario assertion.
- Pending document mutation + descriptor release -> release is forwarded immediately: Host adapter test passed.
- Reopen and adjacent media/Markdown/multi-selection behavior: retained in the owning scenario and package suite.

**Visual evidence:** blocked. `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer` could not start the isolated application because Desktop process `18857` already owns this checkout's Vite bundle. The launcher timed out waiting for CDP before any checkpoint or screenshot. Fail-visible report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-22T00-26-38.918Z-canvas-openneko-consumer-development/report.json`.

**Result:** blocked for authoritative Electron functional/visual acceptance; package-level functional regression evidence passed.

**Residual risk:** the new Electron assertions have not executed in this checkout, so immediate post-copy pixels and the complete reopen cycle are not claimed as visually passed. Rerun the scenario after the existing Desktop development process releases the Vite bundle.

## Quality review

No blocking or suggestion findings in the scoped change.

- Responsibility remains in the L2 Canvas Host adapter that owns ordering for one Webview producer; Desktop app files and domain authorization rules are untouched.
- The existing `canvasStatus -> replace-document` mutation path remains unique. The fix serializes dependent reads instead of adding a duplicate/paste intent or another document authority.
- Authorization remains fail-closed on exact node, locator, output and kind. No locator-only access, stale projection, source-node fallback, retry or artificial delay was introduced.
- Preview descriptor release remains outside the document queue and is covered while submission is blocked, preventing resource lifetime regression.
- No new production `any`, unsafe type assertion, internal version field, feature flag, hard-coded durable path, logging or cross-package private import was added.
