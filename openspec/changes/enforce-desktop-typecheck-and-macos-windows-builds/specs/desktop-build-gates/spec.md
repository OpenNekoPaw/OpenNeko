## ADDED Requirements

### Requirement: Desktop typecheck blocks build success

The repository build gates SHALL execute `@neko/app-desktop` strict TypeScript checking before
native Desktop packaging and SHALL fail when that check fails.

#### Scenario: Desktop contract is invalid

- **WHEN** `apps/neko-desktop` fails `tsc --noEmit`
- **THEN** local and remote build gates SHALL fail before reporting a successful Desktop package
- **AND** Forge/Vite transpilation SHALL NOT substitute for the typecheck result

### Requirement: Host-neutral validation does not create native Desktop artifacts

The repository SHALL provide deterministic Windows/Linux validation paths for format, lint,
TypeScript, orchestration, runtime compatibility, and browser-safe package builds without invoking
Electron Forge packaging.

#### Scenario: Static CI runs on Linux

- **WHEN** the host-neutral build job runs on an Ubuntu runner
- **THEN** it SHALL validate source and browser-safe outputs
- **AND** it SHALL NOT create or upload a Linux Desktop application

#### Scenario: Platform compatibility runs on Windows

- **WHEN** the Windows platform test job runs
- **THEN** it SHALL validate Desktop types and deterministic native-runtime contracts
- **AND** it SHALL NOT invoke Forge package, make, publish, or Desktop artifact upload

### Requirement: Native package is built on the matching macOS host

Remote native package validation SHALL build only `darwin-arm64` on an Apple Silicon macOS runner.

#### Scenario: Native package job runs

- **WHEN** the remote build workflow executes
- **THEN** the macOS job SHALL run `@neko/app-desktop` typecheck, native Sharp closure, and package
- **AND** it SHALL upload only the matching Forge package output

#### Scenario: Forge returns without the canonical package output

- **WHEN** the native package process returns but the macOS executable is absent
- **THEN** the repository-owned package command SHALL fail before artifact upload
- **AND** the missing package SHALL NOT be represented as successful native evidence

### Requirement: Aggregate gates require macOS package and platform tests

Manual and pull-request aggregate gates SHALL require the macOS native package plus deterministic
Windows/Linux test evidence.

#### Scenario: Required package or platform test fails

- **WHEN** the macOS package or a required Windows/Linux test job fails or is skipped
- **THEN** the aggregate gate SHALL fail rather than treating the missing evidence as optional

### Requirement: CI validation classes are explicit and deterministic

The remote gate SHALL validate the macOS native package, deterministic unit/contract tests, and a
named headless Desktop functional subset as separate required evidence.

#### Scenario: Headless functional CI runs

- **WHEN** the remote test graph executes
- **THEN** it SHALL exercise bounded Desktop Main, preload, and application-composition flows
- **AND** it SHALL NOT start a graphical Electron process, access real user data, consume provider
  credentials, or call a real AI API

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
