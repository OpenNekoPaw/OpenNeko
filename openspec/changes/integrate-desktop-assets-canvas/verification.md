# Verification

Date: 2026-07-29

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

## Workspace Authorization Boundary

- The Desktop Host owns the selected Project workspace grant. The renderer is not granted arbitrary
  filesystem access to the whole directory.
- Resource discovery projects portable `workspace-file` ContentLocators. Before any read or
  preview, Main resolves the real path and proves containment in the workspace root or an explicitly
  linked media-library root.
- Preview projects one opaque `neko-media://desktop/<descriptorId>` URL for an exact authorized
  resource. The descriptor is bound to the requesting Electron `webContents`, window, view and
  preview session lifecycle and is released when that session/window closes.
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
