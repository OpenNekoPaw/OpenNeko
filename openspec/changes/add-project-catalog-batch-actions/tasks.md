## 1. Package-Owned Batch Contract

- [x] 1.1 Replace the single-Project remove-recent request and bridge signature with a strict non-empty unique `projectIds` collection, including producer tests that reject the removed `projectId` payload.
- [x] 1.2 Implement Host batch validation, workspace deregistration, and one-commit cross-window Project/Tab/View cleanup with atomic failure regression tests.
- [x] 1.3 Update Desktop Main/preload delegation and consumer tests to prove all removals use the package-owned canonical batch path.

## 2. Project Catalog Interaction

- [x] 2.1 Add tested page-local Project selection functions for single, toggle, range, filtered select-all, clear, and projection reconciliation behavior.
- [x] 2.2 Add accessible selected-row state and a responsive batch action bar with selected count, remove, and clear actions.
- [x] 2.3 Add mouse and keyboard interaction tests for modifier selection, range selection, select-all, escape, delete confirmation/cancellation, unavailable Projects, and the single-row canonical batch path.

## 3. Verification And Delivery

- [x] 3.1 Run focused `@neko/host` contract/service and Desktop Main/preload/Renderer tests plus affected package typechecks/builds.
- [x] 3.2 Run `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:agent-boundaries`, `pnpm check:openspec`, `pnpm check:unused`, and `git diff --check`; record any residual risks.
- [x] 3.3 Run authoritative visible Electron validation for list and grid selection, batch toolbar, confirm/cancel, unavailable Projects, post-removal selection, and narrow-window layout; retain screenshot evidence.
- [x] 3.4 Complete a Neko quality review covering package ownership, strict old-path rejection, user-data safety, regression coverage, and residual risk.
- [x] 3.5 Commit the OpenSpec, implementation, and verification evidence in intentional batches.

## Verification

- `pnpm --filter @neko/host test`: 35 files and 276 tests passed.
- `pnpm --filter @neko/app-desktop test`: 65 files and 405 tests passed.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm test`, `pnpm build`, and `pnpm check`: passed across the workspace.
- `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:agent-boundaries`, and `pnpm check:openspec`: passed with no new internal versioning or canonical-path debt.
- Packaged Electron `no-active-project-catalogs`: passed with isolated fixture storage, light 1200px, light 960x640, dark 960x640, unavailable Project selection, cancel, confirmed two-record removal, selection cleanup, and zero console errors/warnings/exceptions. Report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T05-36-53.264Z-no-active-project-catalogs-packaged/report.json`.
- Quality review: L2, no blocking or suggestion findings. Business rules remain package-owned; Desktop retains only typed Electron delegation and React interaction state; the removed single-identity payload is fail-closed in contract and Main consumer tests.
- Residual risk: the broader packaged `desktop-workbench-scenes` adjacent scenario reached its existing 120-second limit in Asset Management before the Project batch checkpoint. The focused authoritative Project catalog scenario, full workspace tests, and package build passed; the timeout produced no console error, warning, or exception.
