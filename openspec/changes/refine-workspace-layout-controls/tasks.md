## 1. Workspace control composition

- [x] 1.0 Extend the version-free Host Workbench display mode with canonical `empty-main`, validate that it requires a docked Cut Panel, and update all package producer/consumer contract tests without compatibility paths.
- [x] 1.1 Replace the four top-level Workspace region buttons with Agent, combined Main-plus-Cut Popover, and Resource management controls using the canonical left/layout/right Codicons.
- [x] 1.2 Keep Main and Cut child actions delegated to the existing `toggleWorkbenchRegion` / exact Cut draft path, with checked, disabled, focus and selected states derived from exact Scene slots and Host layout presentation.
- [x] 1.3 Add Renderer producer/delegation tests proving the three-button path and Popover child actions, and poison the replaced independent top-level Main/Cut control selectors.

## 2. Cut-only composition

- [x] 2.1 Project exact `empty-main + docked Cut` as hidden Agent plus canonical empty Main above the existing Cut bottom panel without changing Main/Cut identities.
- [x] 2.2 Add consumer tests for Cut-only empty Main, retained/unmounted Main Views, restoring Agent/Main, and fail-visible rejection of `empty-main` without docked Cut.
- [x] 2.3 Replace the superseded empty-Main-above-Cut presentation with a derived expanded Cut presentation whenever Main is not visible; keep a visible Agent docked and retain the existing bottom-panel Portal, Root and stored height.
- [x] 2.4 Extend the host-neutral `ControlledWorkbenchShell` with a canonical docked/expanded bottom-panel presentation, fail visibly on invalid expanded input, and disable bottom resize only while expanded.
- [x] 2.5 Add package and Desktop consumer tests for Agent+expanded Cut, Cut-only expanded presentation, restoring Main, retained Portal identity, resize behavior and absence of the superseded empty Main.

## 3. Verification and evidence

- [x] 3.1 Run `pnpm --dir apps/neko-desktop exec vitest run src/renderer/DesktopShell.test.tsx src/renderer/DesktopApplication.test.tsx src/renderer-styles.test.ts`, `pnpm --dir apps/neko-desktop typecheck`, focused ESLint/Prettier, and `git diff --check`; record any unrelated pre-existing failures.
- [x] 3.2 Use the real Electron Desktop runtime to verify Main+Cut, Cut-only, restored Main, hidden Cut, keyboard Popover, current light theme, a smaller supported window, and adjacent Resource/Agent controls; directly inspect current screenshots and record residual risk for unexecuted themes or states.
- [x] 3.3 Audit the final diff against existing uncommitted changes, confirm no legacy top-level Main/Cut path or parallel layout state remains, and complete the OpenSpec task/status report.
- [x] 3.4 Run focused UI/Desktop tests, typecheck, formatting and `git diff --check`; record unrelated pre-existing failures separately.
- [x] 3.5 Validate the expanded Cut state and restoration cycle in the authoritative Desktop UI, inspect current visual evidence directly, then run the Neko quality review and record residual risk.

## Validation notes

- Focused `@neko/ui` Workbench tests passed, including docked → expanded → docked Root retention, resize visibility and invalid-combination rejection.
- Desktop Shell and Application layout tests passed for Main+Cut, Agent+expanded Cut and Cut-only expanded states. The full focused Desktop group passed 100/101 tests on the first run; the unrelated Project/Conversation context-menu case exceeded its 5-second timeout under concurrent load and passed when rerun alone.
- Prettier, focused ESLint, `node --check`, `git diff --check` and strict OpenSpec validation passed.
- Full package typecheck was attempted but is blocked by unrelated in-progress worktree failures: Agent launch test fixtures do not provide the new required `defaultMediaModels` field; the UI test project also has an existing `contextTarget` control-flow inference error outside this change.
- Authoritative Electron UI validation is `blocked`. The first isolated `desktop-workbench-scenes` run reached a complete but empty renderer DOM while Vite repeatedly optimized/reloaded dependencies; the second run did not expose the CDP target before startup timeout. A subsequent normal Desktop restart reached the fail-visible startup screen before Shell mount with `Cannot read properties of undefined (reading 'bootstrap')`. Evidence is retained under `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T00-46-46.671Z-desktop-workbench-scenes-development/report.json`, `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T00-48-38.744Z-desktop-workbench-scenes-development/report.json` and `reports/ui-validation/refine-workspace-layout-controls/desktop-startup-blocked.png`. No target-state screenshot was available for a valid visual judgment.
