# desktop-build-gates Specification

## Purpose
TBD - created by archiving change enforce-desktop-typecheck-and-macos-windows-builds. Update Purpose after archive.
## Requirements
### Requirement: Desktop typecheck blocks build success

The repository build gates SHALL execute `@neko/app-desktop` strict TypeScript checking before
native Desktop packaging and SHALL fail when that check fails.

#### Scenario: Desktop contract is invalid

- **WHEN** `apps/neko-desktop` fails `tsc --noEmit`
- **THEN** local and remote source build gates SHALL fail
- **AND** Forge/Vite transpilation SHALL NOT substitute for the typecheck result

### Requirement: Host-neutral validation does not create native Desktop artifacts

The repository SHALL provide deterministic GitHub validation paths for format, lint, TypeScript,
orchestration, runtime compatibility, tests, and browser-safe package builds without invoking
Electron Forge packaging.

#### Scenario: Static CI runs on Linux

- **WHEN** the host-neutral build job runs on an Ubuntu runner
- **THEN** it SHALL validate source and browser-safe outputs
- **AND** it SHALL NOT create or upload a Desktop application

#### Scenario: Platform compatibility runs on Windows

- **WHEN** the Windows platform test job runs
- **THEN** it SHALL validate Desktop types and deterministic native-runtime contracts
- **AND** it SHALL NOT invoke Forge package, make, publish, or Desktop artifact upload

### Requirement: Native package is built on the matching local macOS host

Native package validation SHALL build only `darwin-arm64` on an explicitly operated local Apple
Silicon macOS host. GitHub Actions SHALL NOT produce or upload that package.

#### Scenario: Native package validation runs

- **WHEN** a developer or release operator validates the native package
- **THEN** the local host SHALL run `@neko/app-desktop` typecheck, native Sharp closure, and package
- **AND** no GitHub workflow SHALL represent native package bytes as its output

#### Scenario: Forge returns without the canonical package output

- **WHEN** the native package process returns but the macOS executable is absent
- **THEN** the repository-owned package command SHALL fail
- **AND** the missing package SHALL NOT be represented as successful native evidence

### Requirement: Aggregate gates require deterministic source and platform tests

Manual and pull-request aggregate gates SHALL require deterministic source, unit/contract,
headless-functional, quality, OpenSpec, and Windows/Linux test evidence without requiring or
creating a native Desktop package.

#### Scenario: Required source or platform test fails

- **WHEN** a required deterministic source or Windows/Linux test job fails or is skipped
- **THEN** the aggregate gate SHALL fail rather than treating the missing evidence as optional

#### Scenario: Aggregate gate succeeds

- **WHEN** Manual Gate or Merge Gate succeeds
- **THEN** no native package, signing, DMG, installation, or release qualification SHALL be inferred

### Requirement: CI validation classes are explicit and deterministic

The remote gate SHALL validate deterministic unit/contract tests and a named headless Desktop
functional subset as separate required evidence. It SHALL NOT build a native macOS package.

#### Scenario: Headless functional CI runs

- **WHEN** the remote test graph executes
- **THEN** it SHALL exercise bounded Desktop Main, preload, and application-composition flows
- **AND** it SHALL NOT start a graphical Electron process, access real user data, consume provider
  credentials, call a real AI API, or invoke Forge

#### Scenario: Unit or functional evidence is missing

- **WHEN** deterministic unit/contract tests or the headless functional job fails or is skipped
- **THEN** the aggregate gate SHALL fail

### Requirement: Agent Evaluation and graphical UI acceptance remain local-only

GitHub workflows and generic CI script composition SHALL NOT invoke the Agent Evaluation harness,
provider-backed Agent Evaluation, or graphical Electron UI acceptance.

#### Scenario: Agent behavior is evaluated

- **WHEN** a change requires AI behavior evidence
- **THEN** a developer SHALL explicitly run the real provider-backed Evaluation locally with
  credential, model, usage/cost, canonical-path, and no-fallback evidence
- **AND** key-free harness success SHALL NOT be represented as real AI behavior acceptance

#### Scenario: Desktop UI behavior is evaluated

- **WHEN** layout, focus, IPC, CSP, renderer lifecycle, or another graphical behavior requires
  acceptance
- **THEN** a developer SHALL explicitly launch the local graphical Electron fixture with an
  isolated functional home and separate user-data directory
- **AND** no GitHub workflow SHALL reach that launcher directly or through another package script
