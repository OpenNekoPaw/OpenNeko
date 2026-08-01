## ADDED Requirements

### Requirement: Desktop typecheck blocks build success

The repository build gates SHALL execute `@neko/app-desktop` strict TypeScript checking before
native Desktop packaging and SHALL fail when that check fails.

#### Scenario: Desktop contract is invalid

- **WHEN** `apps/neko-desktop` fails `tsc --noEmit`
- **THEN** local and remote build gates SHALL fail before reporting a successful Desktop package
- **AND** Forge/Vite transpilation SHALL NOT substitute for the typecheck result

### Requirement: Host-neutral validation does not create native Desktop artifacts

The repository SHALL provide a host-neutral validation path for format, lint, TypeScript, and
browser-safe package builds that does not invoke Electron Forge packaging.

#### Scenario: Static CI runs on Linux

- **WHEN** the host-neutral build job runs on an Ubuntu runner
- **THEN** it SHALL validate source and browser-safe outputs
- **AND** it SHALL NOT create or upload a Linux Desktop application

### Requirement: Native packages are built on matching hosts

Remote native package validation SHALL build `darwin-arm64` on an Apple Silicon macOS runner and
`win32-x64` on an x64 Windows runner.

#### Scenario: Native package matrix runs

- **WHEN** the remote build workflow executes
- **THEN** both canonical targets SHALL run `@neko/app-desktop` typecheck and package on their
  matching host runner
- **AND** each job SHALL upload the matching Forge package output

#### Scenario: Cross-host packaging is proposed

- **WHEN** a workflow attempts to use macOS or Linux cross-packaging as Windows qualification
- **THEN** repository orchestration tests SHALL fail

### Requirement: Aggregate gates require all native targets

Manual and pull-request aggregate gates SHALL treat both native target packages as required
evidence.

#### Scenario: A native target fails or is skipped

- **WHEN** either macOS or Windows native packaging does not succeed
- **THEN** the aggregate gate SHALL fail rather than treating the missing artifact as optional

### Requirement: CI validation classes are explicit and deterministic

The remote gate SHALL validate native platform packages, deterministic unit/contract tests, and a
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
