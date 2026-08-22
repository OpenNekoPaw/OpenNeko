## 1. Canonical Workspace Resolution

- [x] 1.1 Replace the hand-maintained Renderer workspace entry allowlist with a deterministic manifest-derived public-entry catalog owned by the Desktop Vite configuration.
- [x] 1.2 Add producer/configuration tests proving `@neko/canvas-domain` and exported subpaths are catalogued, third-party and undeclared entries are not claimed, and a consumer-local symlink resolves to the canonical package source.
- [x] 1.3 Add path-level Vite evidence proving the Canvas domain import no longer uses `node_modules/@neko/canvas-domain` or a dependency browser-hash query while optimized third-party imports remain unchanged.

## 2. Fail-Local Surface Loading

- [x] 2.1 Move `@neko/canvas-webview/root` behind the existing Canvas Surface `React.lazy`/`Suspense` boundary and add localized stable loading copy.
- [x] 2.2 Add a Renderer test that poisons Canvas Webview module loading and proves the owning Surface diagnostic renders while Shell sibling content remains available.

## 3. Fail-Visible Renderer Bootstrap

- [x] 3.1 Introduce the minimal DOM-only Renderer bootstrap and change the React application entry to expose one async canonical mount operation.
- [x] 3.2 Replace the direct HTML React entry with the bootstrap entry while preserving CSP nonce behavior and existing style loading.
- [x] 3.3 Add bootstrap tests for successful single mount, import rejection, initialization rejection, localized diagnostic detail, and same-page retry without alternate-entry or user-data behavior.

## 4. Verification And Review

- [x] 4.1 Run `pnpm --filter @neko/app-desktop test -- src/renderer-vite-config.test.ts src/renderer/desktop-renderer-bootstrap.test.ts src/renderer/DesktopApplication.test.tsx` and `pnpm --filter @neko/app-desktop typecheck`.
- [x] 4.2 Run the focused real Electron Desktop startup/reload scenario, inspect the normal and failure UI at desktop and compact window sizes, and record `neko-ui-validation` functional/visual evidence.
- [x] 4.3 Run `pnpm check:application-boundaries`, `pnpm check:legacy-debt`, and `pnpm check:unused`; perform the L2 `neko-quality-review` and record any unexecuted full-gate residual risk.
