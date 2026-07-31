## ADDED Requirements

### Requirement: Desktop is the only application composition root

The workspace SHALL contain exactly one application package, `apps/neko-desktop`. Production,
development, testing and release commands MUST NOT activate, package or publish a VS Code Extension
or TUI application.

#### Scenario: Repository application inventory is validated

- **WHEN** the repository topology guard enumerates workspace application packages and root product
  commands
- **THEN** only `@neko/app-desktop` is present
- **AND** no VS Code Extension, VSIX or TUI entry point can return success

### Requirement: Retained workspace packages are first-level ownership units

Every retained workspace package SHALL have its `package.json` directly below `packages/<name>`.
The workspace MUST NOT discover a `packages/*/packages/*` or package-local `test-utils` package.
Moves SHALL preserve stable npm identities and public exports unless an export is removed with its
VS Code/TUI owner.

#### Scenario: Workspace package topology is validated

- **WHEN** the package topology guard scans the repository and workspace globs
- **THEN** every retained package resolves from one first-level directory
- **AND** no nested workspace package or aggregate Extension package is discovered
- **AND** Desktop imports resolve through package public entries rather than filesystem aliases
- **AND** every workspace declaration contains only `apps/*` and `packages/*`

### Requirement: VS Code runtime and compatibility paths are absent

Production code SHALL NOT import `vscode`, call `acquireVsCodeApi`, register Extension commands or
Custom Editors, expose `host-vscode` adapters, or assemble embedded/per-feature VSIX payloads.
Removed paths MUST NOT remain available through aliases, dynamic optional imports, fallback bridges,
no-op handlers or compatibility packages.

#### Scenario: Removed host APIs are audited

- **WHEN** repository validation scans production source, manifests, package exports, root scripts
  and release configuration
- **THEN** it finds no executable VS Code Extension or compatibility path
- **AND** a reintroduced `vscode` import, VSIX command, Extension app or `host-vscode` export fails
  validation visibly

### Requirement: Desktop composes retained host-neutral capabilities

Retained Agent, Assets, Canvas, Cut, Preview, Tools and shared packages SHALL expose host-neutral
contracts, domain/runtime implementations, Node adapters or browser Webviews from their first-level
package entries. `apps/neko-desktop` SHALL compose those entries through Electron Main, preload and
renderer boundaries without importing package internals.

#### Scenario: Desktop resolves moved capabilities

- **WHEN** Desktop typecheck, tests and production packaging resolve retained creative capabilities
- **THEN** each dependency resolves from its first-level workspace package
- **AND** Main-owned I/O and lifecycle do not move into Webview packages
- **AND** no removed host participates in a successful Desktop path

### Requirement: Host removal protects creator data and fails visibly

The migration SHALL preserve project files and Desktop application settings. It MAY stop reading
unpublished VS Code Extension or TUI-local state, but MUST document that breaking boundary. Missing
Desktop adapters, stale removed-host messages and nested-package references MUST fail build, tests
or typed runtime validation rather than falling back to removed behavior.

#### Scenario: Existing Desktop project is opened after migration

- **WHEN** a creator opens an existing Desktop project and restores Desktop settings after the
  topology migration
- **THEN** project content and supported Desktop preferences remain available
- **AND** removed host state is neither imported nor used as a fallback
- **AND** an unsupported old host message produces an explicit diagnostic

### Requirement: Release and quality gates target Desktop only

Build, test, unused-code, dependency, CI and release validation SHALL target the Desktop application
and retained first-level packages. Historical documents MAY name removed hosts as prior facts, but
active architecture, current changes and executable configuration MUST identify Desktop as the sole
supported product host.

#### Scenario: Local repository quality gate runs

- **WHEN** the Desktop-only local quality gate executes
- **THEN** it builds and tests retained first-level packages and the Desktop application
- **AND** it rejects nested packages, removed-host dependencies and VSIX/TUI release artifacts
- **AND** it does not require an Extension Development Host or TUI runtime to report success

#### Scenario: Retained root tooling is executable

- **WHEN** repository orchestration validates root scripts and local smoke commands
- **THEN** every retained script target exists
- **AND** Webview smoke discovers the retained first-level Webview packages
- **AND** no removed release validator, nested package discovery path or removed-host command can
  report success

### Requirement: Agent Evaluation preserves the Desktop runtime boundary

Repository Evaluation guidance SHALL identify Desktop as the sole product session owner. A real case
MUST use a Desktop-owned complete-session driver. Until that driver exists, provider-backed execution
MUST return `infrastructure-blocked` with exit code 2 and MUST NOT use a removed TUI driver, direct
turn runner, headless assembly or mock provider.

#### Scenario: Credentials exist but the Desktop driver does not

- **WHEN** focused Evaluation passes credential and local configuration preflight
- **AND** the Desktop complete-session driver is unavailable
- **THEN** the report outcome is `infrastructure-blocked`
- **AND** the process exits with code 2
- **AND** the blocker is not rewritten as `configuration-invalid`

### Requirement: Active governance is Desktop-first

Repository Skills, current architecture guidance and active OpenSpec requirements SHALL use Desktop
as the only executable host and runtime acceptance owner. Removed-host facts MAY remain in explicit
negative guards, data migrations or documents marked historical/superseded.

#### Scenario: Active guidance is audited

- **WHEN** maintainers inspect repository Skills and current validation guidance
- **THEN** no instruction requires a VS Code debugger, Extension Development Host or TUI runtime
- **AND** active Cut media requirements identify Desktop Main/preload/renderer and Node/FFmpeg as the
  canonical host path
- **AND** historical removed-host references cannot be mistaken for current implementation tasks
