## 1. Package-Owned Batch Contract

- [ ] 1.1 Replace the single-Project remove-recent request and bridge signature with a strict non-empty unique `projectIds` collection, including producer tests that reject the removed `projectId` payload.
- [ ] 1.2 Implement Host batch validation, workspace deregistration, and one-commit cross-window Project/Tab/View cleanup with atomic failure regression tests.
- [ ] 1.3 Update Desktop Main/preload delegation and consumer tests to prove all removals use the package-owned canonical batch path.

## 2. Project Catalog Interaction

- [ ] 2.1 Add tested page-local Project selection functions for single, toggle, range, filtered select-all, clear, and projection reconciliation behavior.
- [ ] 2.2 Add accessible selected-row state and a responsive batch action bar with selected count, remove, and clear actions.
- [ ] 2.3 Add mouse and keyboard interaction tests for modifier selection, range selection, select-all, escape, delete confirmation/cancellation, unavailable Projects, and the single-row canonical batch path.

## 3. Verification And Delivery

- [ ] 3.1 Run focused `@neko/host` contract/service and Desktop Main/preload/Renderer tests plus affected package typechecks/builds.
- [ ] 3.2 Run `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:agent-boundaries`, `pnpm check:openspec`, `pnpm check:unused`, and `git diff --check`; record any residual risks.
- [ ] 3.3 Run authoritative visible Electron validation for list and grid selection, batch toolbar, confirm/cancel, unavailable Projects, post-removal selection, and narrow-window layout; retain screenshot evidence.
- [ ] 3.4 Complete a Neko quality review covering package ownership, strict old-path rejection, user-data safety, regression coverage, and residual risk.
- [ ] 3.5 Commit the OpenSpec, implementation, and verification evidence in intentional batches.
