## 1. Project Catalog Scroll

- [x] 1.1 Make the All Projects root fill and clip its Workbench viewport while the collection owns remaining-height vertical scrolling in normal and compact layouts.
- [x] 1.2 Add focused renderer/style regressions for list default, fill empty state, fixed management controls, and the bounded scroll owner.

## 2. Functional Storage Isolation

- [x] 2.1 Validate fixture Electron `userData` containment together with runtime HOME before Local Metadata opens, and remove the duplicated Agent-only containment check.
- [x] 2.2 Make shared functional launch construction reject unsafe HOME, userData, and Workspace paths before spawning Electron.
- [x] 2.3 Add Main and orchestration path tests proving fixture launches select `${FIXTURE_HOME}/.neko/neko.db`, ordinary startup selects the user database, unsafe launch construction fails closed, and Agent Evaluation delegates to the shared runner.

## 3. Verification

- [x] 3.1 Run focused Desktop renderer, Main fixture, and test-orchestration tests plus Desktop typecheck.
      Evidence: Desktop package tests passed 65 files / 400 tests; focused renderer/Main/orchestration tests and Desktop typecheck passed.
- [x] 3.2 Run `pnpm check:storage-authorities`, `pnpm check:test-orchestration`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec`, and `git diff --check`; record any unrelated pre-existing failures as residual risk.
      Evidence: all listed gates passed; `check:unused` retained 74 non-blocking repository configuration hints and exited successfully. Internal versioning and application-boundary gates also passed.
- [x] 3.3 Run the authoritative isolated real Electron UI with a long project catalog, inspect normal and compact screenshots directly, verify scroll-to-final-row and unavailable-item actions, and record diagnostics and residual risk.
      Evidence: isolated `no-active-project-catalogs` passed at normal and `960x640` window sizes with 29 retained projects, `scrollTop=1792.5`, fixed controls, the final unavailable row visible, open disabled, remove enabled, and no console errors, warnings, or exceptions. Report: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T03-35-45.414Z-no-active-project-catalogs-development/report.json`.
- [x] 3.4 Review the final diff for forbidden version, migration, fallback, path-inference cleanup, or user-database mutation paths and split commits by Project UI and test-storage isolation scope.
      Evidence: no forbidden production path was added; storage isolation is commit `7787970a` and Project catalog scrolling is commit `15e7853b`. Existing user database rows remain unchanged and explicitly removable.
