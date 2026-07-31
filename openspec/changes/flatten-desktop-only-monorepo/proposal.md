## Why

The repository currently carries three application hosts and a mixed package topology: reusable
runtime packages are nested below aggregate `packages/*/packages/*` directories, while VS Code
Extension implementations, packaging, tests and compatibility adapters remain active beside the
canonical Electron Desktop application. The `refactor-monorepo` branch flattened reusable packages
but moved Extension code into a larger `apps/neko-vscode` composition root, so merging it unchanged
would deepen the host path that this change must retire.

## What Changes

- **BREAKING** Make `apps/neko-desktop` the only application composition root in the workspace;
  remove the VS Code and TUI applications, Extension packages, `host-vscode` adapters, VSIX release
  assembly, Extension Development Host tests and VS Code-only scripts/configuration.
- **BREAKING** Move every retained second-level package from `packages/*/packages/*` to an explicit
  first-level `packages/<owner>-<responsibility>` directory, preserving package names and public
  exports unless a contract is VS Code-only.
- Keep host-neutral domain, runtime, Node, Webview and contract packages independently testable;
  Desktop composes them through their public package entry points and owns Electron Main/preload/
  renderer adapters.
- Record `refactor-monorepo` as superseded history without accepting its single-extension
  implementation, then reuse its verified first-level naming where that naming still matches the
  current package responsibility.
- Remove legacy workspace globs, dependency checks, package groups, CI/release paths, documentation
  and quality gates that imply VS Code/TUI remains a supported product host.
- Add fail-visible repository guards proving there is one application, no nested workspace package,
  no production `vscode` import or `acquireVsCodeApi` bridge, and no VSIX build/publication route.
- Audit every retained root command after the move: local smoke/discovery scripts must enumerate
  first-level packages, removed release validators must not leave dangling package scripts, and all
  workspace declarations must use the same first-level topology.
- Make repository Skills, Agent Evaluation documentation and active OpenSpec requirements
  Desktop-first. Missing Desktop complete-session automation remains an explicit
  `infrastructure-blocked` condition and must not be rewritten as configuration failure.

## Capabilities

### New Capabilities

- `desktop-only-monorepo-composition`: Defines the single Desktop application root, first-level
  retained package topology, removal of VS Code/TUI runtime paths, and repository-level guards.

### Modified Capabilities

None. Existing stable specs describe retained domain behavior; this change replaces active
host/packaging changes whose VS Code assumptions are no longer product requirements.

## Impact

- Application roots: `apps/neko-desktop` is retained; `apps/neko-vscode` and `apps/neko-tui` are
  removed.
- Package topology: Agent, Canvas, Cut, Preview and Tools nested packages move to first-level
  directories; Extension-only packages and VS Code adapters are deleted.
- Build and release: root scripts, workspace configuration, Turbo tasks, dependency/unused checks,
  lockfile, CI workflows and release validation become Desktop-only.
- Development governance: repository Skills, evaluation harness documentation and active changes
  use Desktop runtime evidence; VS Code debugger guidance remains only in explicitly historical
  documents.
- Contracts: retained npm package names remain stable where possible, but filesystem paths, test
  ownership, local scripts and unpublished VS Code/TUI entry points are intentionally breaking.
- User data: project files and Desktop settings are not migrated or deleted; removed VS Code
  extension state and TUI-local state are no longer read.
