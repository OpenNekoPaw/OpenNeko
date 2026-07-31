## Verification (2026-07-31)

## L4 Quality Review

Risk: L4. This change replaces the repository topology, application host, release artifact and core
creative-workflow composition.

No blocking findings remain. The accepted architecture has one executable application owner,
`apps/neko-desktop`, and one first-level package location for each retained runtime/domain/Webview
owner. Host-neutral packages do not import Electron application code. Removed VS Code/TUI commands,
adapters, package roots and fallback paths cannot return success; repository topology, dependency,
legacy-debt and unused-code gates enforce that boundary.

The prelaunch break is intentional. VS Code extension state and TUI-local state are no longer read.
Project files and Desktop settings are not deleted or migrated. Legacy conversation rows are retained
in isolated SQLite tables while active Desktop repositories exclude them. The v3 migration preserves
real Desktop conversations created after the previously applied v2 migration marker.

## Repository And Package Evidence

- `refactor-monorepo` is an ancestor of `neko-desktop` through merge commit `f417458f`. The merge
  records the superseded branch history while retaining the Desktop-only tree.
- The workspace contains one application package at `apps/neko-desktop/package.json`, 28 retained
  first-level packages under `packages/*/package.json`, no `packages/*/packages/*`, and no
  package-local `test-utils/package.json`.
- Root `package.json` and `pnpm-workspace.yaml` both declare only `apps/*` and `packages/*`.
  `pnpm smoke:webview` discovered and built the five retained first-level Webview packages.
- The only retained `@vscode/*` dependency is `@vscode/codicons`, which is a static icon asset.
  Production source contains no VS Code import, runtime URI, Extension adapter or compatibility
  bridge. The remaining `vscode`/`tui` local-metadata values exist only in the non-destructive v1
  migration that isolates old user rows.
- `pnpm gate:local` passed: formatting, lint (0 errors; 219 existing warnings), 29 workspace builds,
  all 28 test owners and repository quality gates completed successfully.
- `pnpm check:legacy-debt`, `pnpm check:unused` and `pnpm check:deps` passed. Dependency Cruiser
  inspected 1,030 modules and 3,223 dependencies without violations.
- Strict OpenSpec validation passed for all 89 active changes.

## Desktop Runtime Evidence

Scenario `desktop.project-open.creative-surface` used the packaged macOS arm64 application with a
temporary HOME and Electron user-data directory. It selected only the synthetic
`scripts/agent-eval/shared-fixtures/creative-planning-workspace` fixture through the native directory
picker.

- The project appeared in the Desktop recent-project list and opened the project-owned Agent
  creative surface.
- The Asset Center route rendered through `neko-app://desktop/index.html` with its media-library
  controls, proving a second Desktop creative surface outside the Agent projection.
- Application-managed state was written only beneath the temporary Electron user-data directory.
  The temporary HOME remained empty, and the application exited normally after the scenario.
- The production artifact is
  `apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app`: version `0.0.1`, bundle identifier
  `com.openneko.desktop`, Mach-O arm64, with ASAR integrity metadata present.

Desktop owner tests passed 55 files / 293 tests. The wider gate also passed Agent runtime
97 files / 920 tests, Agent Webview 88 files / 669 tests, and shared metadata
132 files / 994 tests. The final post-edit shared-contract rerun passed 132 files / 995 tests,
including explicit rejection of retired host-projected runtime URIs.

## Agent Evaluation Disposition

- `pnpm test:agent:eval` passed 35 files / 234 tests and key-free dry-ran 22 suites / 50 cases.
  This validates the Evaluation harness only, not real Agent behavior.
- The focused `agent-runtime.workflow-controller` run through `local-run.mjs` returned exit code 2
  and `infrastructure-blocked` before starting a run because no allowlisted provider credential was
  available. Focused runner tests separately prove that a preflight-complete invocation still
  preserves `infrastructure-blocked`/exit 2 when the Desktop complete-session driver is absent.
- The Evaluation coverage index marks the Desktop complete-session driver as excluded because no
  such owner exists yet. No removed TUI driver, headless runner, direct turn runner or mock business
  tool was used as fallback.

## Documentation And Governance Evidence

- Root README, architecture navigation, package boundaries, contribution rules, Agent Evaluation
  developer documentation and repository Skills identify Electron Desktop as the sole current host.
- The repository-local `vscode-extension-debugger` Skill is absent and its `.gitignore` tracking
  exception has been removed. The developer's global personal Skill installation is outside this
  repository and was not modified.
- Active Desktop foundation, release, Canvas, Cut and standard 3D Preview requirements now assign
  application/session, resource projection, background export and UI acceptance to Desktop
  Main/preload/renderer plus Node/FFmpeg. Archived changes, dated status snapshots and explicitly
  superseded ADRs retain historical VS Code/TUI evidence without defining an executable path.
- `.github/workflows/ci.yml` contains only deterministic source/build/test/quality jobs and no VSIX,
  TUI, Extension Development Host, GUI or real Agent Evaluation job. Root build, package and smoke
  scripts target Desktop and first-level packages only.

Real provider-backed Agent behavior therefore remains unverified until both an authorized provider
environment and a Desktop-owned complete-session driver are available.

## Residual Risk

- Runtime and package inspection covered macOS arm64 only. macOS x64, Windows and Linux packaging
  and runtime scenarios were not executed.
- Developer ID signing, hardened-runtime notarization and release-channel publication were not
  executed; the inspected artifact is a local development package.
- GitHub Manual/Merge Gate execution was not run locally. `pnpm gate:local` is the authoritative
  local gate used for this change.
- The repository no longer produces VSIX or TUI artifacts by design. Existing data owned only by
  those unpublished hosts is preserved where applicable but intentionally inaccessible from
  Desktop.
