## ADDED Requirements

### Requirement: pnpm owns workspace task orchestration

The repository MUST use pnpm workspace commands as the sole root orchestrator for build, focused UI build,
typecheck, test, and coverage tasks.

#### Scenario: Root build follows workspace dependency order

- **WHEN** a developer runs the root build command
- **THEN** pnpm runs every workspace build script in sorted dependency order
- **AND** workspaces without a build script do not make the command fail

#### Scenario: Coverage continues across package failures

- **WHEN** one workspace coverage test fails
- **THEN** pnpm continues running the remaining workspace coverage tests
- **AND** the root command reports failure after the recursive run

### Requirement: focused UI builds remain explicit

The root UI build command MUST build exactly the Cut, Tools, Preview, Agent, and Canvas Webview packages.

#### Scenario: Developer builds all Webviews

- **WHEN** a developer runs the root UI build command
- **THEN** pnpm selects the five package owners by workspace package name
- **AND** each selected package runs its own build script

### Requirement: retired Turbo infrastructure is absent

The repository MUST NOT depend on Turbo for package scripts, lockfile resolution, CI caching, local act mounts,
quality scanner exclusions, or repository-generated cache state.

#### Scenario: Repository configuration is audited

- **WHEN** orchestration contract tests and dependency checks inspect repository configuration
- **THEN** no Turbo package, root task command, configuration file, CI cache, or repository scanner exception exists

#### Scenario: User workspace content is enumerated

- **WHEN** Desktop scans an arbitrary user-owned workspace
- **THEN** it MAY still ignore a `.turbo` directory as third-party generated content
- **AND** that filtering does not create a repository build dependency

### Requirement: Desktop packaging remains on the canonical build path

The pnpm root build MUST preserve the application dependency order and invoke the existing Electron Forge package path.

#### Scenario: Full repository build runs

- **WHEN** a developer runs the root build after installing the lockfile
- **THEN** all package builds complete before the Desktop package build
- **AND** Electron Forge produces the native Desktop package without Turbo
