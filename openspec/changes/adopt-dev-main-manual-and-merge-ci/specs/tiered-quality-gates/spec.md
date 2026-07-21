## MODIFIED Requirements

### Requirement: Local gate provides complete developer feedback without coverage

The repository SHALL provide a stable local gate command that runs format, lint, build, ordinary workspace tests, unused-code checks, production debt checks, and architecture checks without collecting coverage.

#### Scenario: Developer validates before pushing dev

- **WHEN** a developer invokes the documented local gate from a checkout
- **THEN** the command SHALL run the complete deterministic development gate without invoking Agent Evaluation or provider-backed acceptance
- **AND** it SHALL audit a complete local VS Code launch/tasks pair when that gitignored configuration is present

### Requirement: Pull Request gate blocks deterministic repository regressions

The repository SHALL run complete deterministic source validation, full Rust and Proto checks, dependency review, OpenSpec validation, and all supported-platform VSIX packaging for Pull Requests from dev to main.

#### Scenario: dev promotion succeeds

- **WHEN** a Pull Request has head branch dev and base branch main and every required validation and packaging job succeeds
- **THEN** GitHub Actions SHALL publish a successful stable `Merge Gate` result

#### Scenario: Pull Request bypasses dev

- **WHEN** a Pull Request targeting main has a head branch other than dev
- **THEN** `Merge Gate` SHALL fail with an explicit source-branch diagnostic

#### Scenario: Required merge job does not succeed

- **WHEN** any required source, test, quality, platform packaging, dependency review, or promotion-source job fails, is cancelled, is missing, or is skipped
- **THEN** `Merge Gate` SHALL fail before the change can merge

### Requirement: Gate aggregation is deterministic and testable

The repository SHALL implement `Manual Gate` and `Merge Gate` result aggregation through the same host-neutral fail-visible job-result contract.

#### Scenario: Manual validation succeeds

- **WHEN** a developer explicitly dispatches CI for a selected ref and all shared source and packaging jobs succeed
- **THEN** GitHub Actions SHALL publish a successful `Manual Gate` without requiring Pull Request-only jobs

#### Scenario: Merge validation succeeds

- **WHEN** the dev-to-main Pull Request executes the same shared jobs plus promotion-source and dependency-review jobs successfully
- **THEN** GitHub Actions SHALL publish a successful `Merge Gate`

#### Scenario: Unknown job result is provided

- **WHEN** either aggregator observes a result outside the supported GitHub result set
- **THEN** the aggregator SHALL fail with an explicit diagnostic

### Requirement: Specialized acceptance remains outside generic gates

Generic local, manual, and merge gate commands SHALL NOT invoke Agent Evaluation, provider-backed Agent cases, or Webview functional acceptance.

#### Scenario: Generic gate composition is audited

- **WHEN** the repository orchestration guard traverses local, remote-reproduction, manual, merge, and workflow-root scripts
- **THEN** it SHALL reject any direct or transitive Agent Evaluation execution surface

#### Scenario: Existing localization tests remain package-owned

- **WHEN** the dev/main promotion workflow is introduced
- **THEN** the change SHALL NOT add localization-specific test content or alter package test discovery solely for gate composition

### Requirement: Remote gates exclude local runtime dependencies

Manual and Merge Gates SHALL only execute tests reproducible from a clean checkout without local VS Code configuration, GUI state, real user fixtures, provider credentials, or external API access.

#### Scenario: GitHub discovers orchestration tests

- **WHEN** a remote repository quality gate runs orchestration tests
- **THEN** it SHALL NOT discover or execute `.local.mjs` VS Code configuration tests
- **AND** no remote workflow or remotely reachable root script SHALL reference local VS Code, GUI, Extension Development Host, or real API commands

#### Scenario: Developer runs local runtime checks

- **WHEN** a developer explicitly invokes the local VS Code, UI, or real API command
- **THEN** the command MAY use gitignored configuration, an already-running Extension Development Host, isolated local fixtures, or provider credentials
- **AND** missing partial VS Code configuration SHALL fail visibly while completely absent optional configuration MAY be reported as skipped

## REMOVED Requirements

### Requirement: Main gate aggregates release-level evidence

**Reason**: Platform packaging and deterministic release feasibility now block dev-to-main promotion through `Merge Gate`; a post-merge `Main Gate` cannot prevent an invalid commit from entering main.

**Migration**: Move every required Main Gate source and packaging job into the shared Manual/Merge graph, remove push-main CI, and publish only from protected main version tags.
