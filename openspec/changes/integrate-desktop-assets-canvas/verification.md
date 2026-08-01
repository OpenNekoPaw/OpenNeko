# Verification

Date: 2026-07-31

Risk classification: L4. This change crosses Electron Main/preload/renderer, package-owned browser
Roots, workspace content authorization and persistent Canvas document sessions.

## Canonical Path Evidence

- Desktop mounts `CanvasWebviewRoot` from `@neko-canvas/webview/root`; it does not own a second
  Canvas editor, toolbar, add popover, node renderer or Canvas store.
- Desktop mounts package-owned Resource Browser and Preview Roots. Resource identity crosses the
  renderer boundary as a stable ContentLocator/authorized descriptor, not an absolute path.
- Desktop Tailwind scans the Canvas package source. Canvas CSS reset/token rules are scoped to the
  package Root marker or the standalone Canvas Webview document.
- Canvas controls are capability-driven. Source-add, selection/pan, undo/redo, resource placement
  and preview have Desktop handlers. Playback, export, package and send-to-Agent have no Desktop
  owner and therefore remain hidden; no no-op handler or visual fallback is used.
- Producer/consumer tests poison the removed module-global VS Code message path and cover
  snapshot-first startup, expected revision, stale identity, disposal, multiple Canvas sessions and
  Resource-to-Canvas targeting.

## Packaged Electron Evidence

Production package:

`apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app`

Observed in the packaged app:

1. Opened the Content Project and the real Canvas Root.
2. Confirmed the shared select, pan, add, undo and redo toolbar.
3. Opened the shared add popover; it rendered the package groups for Markdown/group creation,
   image/audio/video import, file reference and sub-canvas reference.
4. Added a Markdown node and observed the authoritative node count change from 1 to 2.
5. Undid the mutation and observed the authoritative node count return from 2 to 1.
6. Selected an image resource and opened the package-owned Preview Root.
7. Switched panels without the previous blank-surface/disposed-runtime failure.

Save/reopen, stale revision, duplicate focus, two independent Canvas sessions, side-open limits and
cleanup are additionally covered by deterministic Desktop/Canvas producer-consumer tests.

## Development Electron Recovery Evidence

The Desktop Vite path was also exercised directly because its dependency optimizer and dynamic CSS
runtime differ from the production Rollup package:

1. Reproduced the blank renderer before React mount. Vite loaded the linked Canvas package's
   CommonJS external-store shim without a valid default export.
2. Added one physical Canvas Root source identity plus React/Zustand deduplication and explicit
   external-store prebundling. A fresh Desktop process mounted the Shell instead of a white window.
3. Reproduced Canvas remaining on `加载画布中...`. React StrictMode effect replay disposed the same
   shared Canvas Host before its snapshot resolved.
4. Made the package Root lifetime replay-safe and added a test that fails when StrictMode disposes
   the active Host. A fresh Desktop process rendered the saved image node and full Canvas toolbar.
5. Reproduced package Root styles being dropped. Vite correctly attached its fixed nonce to
   development `<style>` nodes, but Desktop CSP authorized that nonce only for scripts.
6. Authorized the fixed Vite development nonce for both scripts and styles while retaining
   production `style-src 'self'`. A fresh Desktop process rendered the Resource Browser thumbnails,
   Canvas node/toolbar and Agent controls with package-owned styles, and the shared add-node menu
   opened with Markdown, group, image, audio, video, file and sub-canvas actions.
7. Reproduced window cleanup reading `BrowserWindow.webContents.id` after Electron had destroyed
   the object. Cleanup now uses the sender identity captured by the Window Registry; a fresh
   start-render-close pass ended with `Desktop AppHost disposed` and no
   `desktop-window-dispose-failed` diagnostic.
8. Reproduced a GLB loading failure after React StrictMode replay. The first Model Viewer effect
   cleanup forced the WebGL context lost on a canvas that React immediately reused, so the second
   package runtime could not probe shader precision. Model Viewer disposal now releases Three-owned
   resources without forcing the reusable canvas context lost, and the source Host fences queued
   initialization by subscription epoch.
9. Opened `test.glb` through the package-owned Model Viewer in a fresh Desktop process. The viewer
   reported 44 hierarchy entries, 39 nodes and 37 meshes/materials, and its scene/camera/light/node
   controls were enabled. No blob URL or authorized-URL diagnostic was emitted.
10. Exercised the package-owned Canvas Add menu in Desktop, created a Markdown node, observed the
    node count change from 1 to 2, undid to 1, redid to 2 and finally restored the saved 1-node
    fixture. Canvas controls use the package Codicon stylesheet rather than Desktop-owned copies.

## Global Library Runtime And Layout Qualification

- The Media Library search failure was reproduced after the shared Home management contract moved
  from version 7 to version 8. Vite rebuilt preload and reloaded renderer, but Electron Forge's Vite
  Main watcher did not restart the already-running Main process. The version 8 request therefore
  reached the stale version 7 parser and correctly failed with
  `Desktop Home management contract version is unsupported`.
- The development Main Vite configuration now requests one Electron restart after each completed
  `serve` build. Production builds do not request a restart, and the strict unsupported-version
  rejection remains unchanged; no multi-version parser, retry, downgrade or fallback was added.
- A red regression first failed because
  `createDesktopDevelopmentMainRestartPlugin is not a function`. After the canonical restart hook
  was implemented, its development-restart and production-no-restart cases both passed.
- Desktop renderer style coverage proves that the Assets-owned Global Library stylesheet is the
  source of its workbench layout rules. Desktop owns only the full-height mount boundary and does
  not duplicate the package selectors.
- In an isolated packaged Electron fixture at 1280 x 800, the Global Library Root measured
  1040 x 800, the search control measured 708 x 30 with a 760 px maximum, and the centered empty
  state measured 1008 x 696. No controls overlapped and renderer diagnostics were empty.
- At 2048 x 800, the Root measured 1808 x 800, the search control remained bounded at 760 px, the
  sort control followed it at x=1024, and the empty state measured 1776 x 696. The loaded
  package-owned lazy stylesheet was `neko-app://desktop/assets/root-C1-6fpW5.css`.
- Neither fixture emitted the unsupported contract diagnostic or an IPC handler error. Closing the
  window logged `Desktop AppHost disposed`, proving the isolated runtime released its lifecycle.

## Workspace Authorization Boundary

The `neko-media:` observation below records the 2026-07-29 implementation only. It was superseded
on 2026-08-01 by `replace-desktop-media-scheme-with-http-resource-gateway`; the current production
projection is an exact-resource, short-lived `openneko://resource` URL from the Desktop registry,
while the durable identity remains the original ContentLocator.

- The Desktop Host owns the selected Project workspace grant. The renderer is not granted arbitrary
  filesystem access to the whole directory.
- Resource discovery projects portable `workspace-file` ContentLocators. Before any read or
  preview, Main resolves the real path and proves containment in the workspace root or an explicitly
  linked media-library root.
- At the time of this report, Preview projected one opaque
  `neko-media://desktop/<descriptorId>` URL for an exact authorized resource. That historical
  transport is not a current success path.
- The renderer receives neither absolute paths nor a directory token. A future `.gltf` package with
  external buffers or textures must register the exact validated dependency resources; it must not
  widen the descriptor into workspace-wide access.

## Validation

- `pnpm --filter @neko-canvas/webview test` — 62 files, 353 tests passed.
- `pnpm --filter @neko/app-desktop test` — 36 files, 155 tests passed.
- `pnpm --filter neko-preview exec vitest run` — 44 files, 275 tests passed.
- `pnpm --filter @neko-canvas/webview test` after the StrictMode/model fix — 62 files, 354 tests
  passed.
- `pnpm --filter @neko/app-desktop typecheck` — passed.
- `pnpm exec tsc --noEmit` from `packages/neko-canvas/packages/webview` — passed.
- `pnpm --filter neko-preview exec tsc -p packages/webview/tsconfig.json --noEmit` — passed.
- `pnpm --filter @neko/preview-webview build` — passed; package-owned Preview production assets
  include the model viewer bundle and Codicon font.
- `pnpm --filter @neko-canvas/webview build` — passed; package-owned Canvas production CSS includes
  the Codicon font and scoped Root styles.
- `pnpm --filter @neko/app-desktop package` after the StrictMode/model fix — passed.
- `pnpm check` after the StrictMode/model fix — no unused-code failure and no dependency violations
  across 1,236 modules and 4,118 dependencies.
- `pnpm check:quality` after the StrictMode/model fix — passed, including content access,
  application, Agent, Canvas, Webview, strict-TypeScript, test-ownership and all 78 OpenSpec items.
- `pnpm --filter @neko/app-desktop package` — production Electron package passed.
- `pnpm --filter @neko/app-desktop exec vitest run
  src/main/desktop-development-main-restart.test.ts` — 1 file, 2 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer-styles.test.ts` — 1 file, 9 tests
  passed.
- `pnpm --filter neko-assets exec vitest run src/global-library/root.test.tsx` — 1 file, 8 tests
  passed.
- `pnpm --filter neko-assets typecheck:resource-browser` — passed.
- `pnpm --filter @neko/app-desktop package` after the Global Library runtime/style fixes — passed.
- `pnpm --filter @neko/app-desktop typecheck` after the Global Library fixes — blocked by unrelated
  concurrent changes in `packages/neko-agent-runtime/src/input/input-processor.ts`,
  `packages/neko-agent-runtime/src/input/node-file-reader.ts` and
  `packages/neko-agent-runtime/src/prompt/prompt-file-projector.ts`; all reported
  `string | undefined`/possibly-undefined errors are outside this change's ownership.
- `pnpm --filter @neko/shared test -- project-file-io-guardrails.test.ts` — 1 file, 9 tests passed.
- `pnpm test:agent:eval` — 40 harness files with 282 tests and 24 suites with 53 dry cases passed;
  no provider-backed behavior is claimed.
- `pnpm check:test-orchestration` — 92 tests passed; 34 source workspaces and 29 coverage owners
  audited.
- `pnpm check:openspec` — all 78 OpenSpec items passed.
- `pnpm build` — 9 tasks passed.
- `CI=1 pnpm test` — 30 Turbo tasks passed.
- `pnpm check` — no unused-code failure and no dependency violations across 1,236 modules and
  4,118 dependencies.
- `pnpm check:legacy-debt` — passed with zero blocking findings.
- `pnpm check:quality` — passed, including architecture/Webview/strict-TypeScript/test-ownership
  gates and all 78 OpenSpec items.
- `pnpm exec openspec validate integrate-desktop-assets-canvas --strict` — passed.
- `git diff --check` — passed.

## Evaluation Disposition And Residual Risk

Resource/Canvas work does not change Agent prompts, Skills, provider/model selection or Tool
routing. The key-free Agent evaluation harness was run as a regression gate; no paid provider case
is required for this change.

The user explicitly excluded VS Code plugin runtime testing while Desktop is under development.
Therefore no Extension Development Host acceptance evidence is claimed. The shared Canvas adapter
is covered by deterministic tests, but VS Code-specific visual/CSP/focus runtime behavior remains a
documented residual risk until a later VS Code acceptance pass.
