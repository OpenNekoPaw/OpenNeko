## ADDED Requirements

### Requirement: Local gate provides complete developer feedback without coverage

The repository SHALL provide a stable local gate command that runs format, lint, build, ordinary workspace tests, unused-code checks, production debt checks, and architecture checks without collecting coverage.

#### Scenario: Developer validates before pushing

- **WHEN** a developer invokes the documented local gate from a checkout
- **THEN** the command SHALL run the complete deterministic development gate without invoking Agent Evaluation or provider-backed acceptance
- **AND** it SHALL audit a complete local VS Code launch/tasks pair when that gitignored configuration is present

### Requirement: Pull Request gate blocks deterministic repository regressions

The repository SHALL run build, coverage tests, unused-code checks, production debt checks, architecture checks, and applicable path-selected contract checks for Pull Requests targeting main.

#### Scenario: Pull Request checks succeed

- **WHEN** every required Pull Request job succeeds and every optional path-selected job either succeeds or is skipped
- **THEN** GitHub Actions SHALL publish a successful stable `Branch Gate` result

#### Scenario: Required Pull Request job fails

- **WHEN** any required Pull Request job fails, is cancelled, is missing, or is unexpectedly skipped
- **THEN** `Branch Gate` SHALL fail visibly with the affected job result

### Requirement: Main gate aggregates release-level evidence

The repository SHALL publish a stable `Main Gate` result for pushes to main that includes deterministic TypeScript quality, full Rust validation, dependency audit, OpenSpec validation, Proto synchronization when applicable, and platform packaging.

#### Scenario: Main push is release-ready

- **WHEN** all required main jobs and packaging matrices succeed and optional path-selected jobs are either successful or skipped
- **THEN** GitHub Actions SHALL publish a successful `Main Gate` result

#### Scenario: Platform packaging is skipped after an upstream failure

- **WHEN** a required upstream job fails and a required packaging job is consequently skipped
- **THEN** `Main Gate` SHALL fail rather than treating the skipped package as success

### Requirement: Gate aggregation is deterministic and testable

The repository SHALL implement job-result aggregation as a host-neutral script with regression tests for success, optional skip, failure, cancellation, missing result, and required skip.

#### Scenario: Optional path job is skipped

- **WHEN** a path-selected optional job reports `skipped` and every required job reports `success`
- **THEN** the aggregator SHALL succeed

#### Scenario: Unknown job result is provided

- **WHEN** a required or observed job reports a result outside the supported GitHub result set
- **THEN** the aggregator SHALL fail with an explicit diagnostic

### Requirement: Specialized acceptance remains outside generic gates

Generic local, branch, and main gate commands SHALL NOT invoke Agent Evaluation, provider-backed Agent cases, or Webview functional acceptance.

#### Scenario: Generic gate composition is audited

- **WHEN** the repository orchestration guard traverses local, branch, main, and workflow-root scripts
- **THEN** it SHALL reject any direct or transitive Agent Evaluation execution surface

#### Scenario: Existing localization tests remain package-owned

- **WHEN** tiered gates are introduced
- **THEN** the change SHALL NOT add localization-specific test content or alter package test discovery solely for gate composition

### Requirement: Remote gates exclude local runtime dependencies

Pull Request and main gates SHALL only execute tests that are reproducible from a clean checkout without local VS Code configuration, GUI state, real user fixtures, provider credentials, or external API access.

#### Scenario: GitHub discovers orchestration tests

- **WHEN** the remote repository quality gate runs orchestration tests
- **THEN** it SHALL NOT discover or execute `.local.mjs` VS Code configuration tests
- **AND** no remote workflow or remotely reachable root script SHALL reference local VS Code, GUI, Extension Development Host, or real API commands

#### Scenario: Developer runs local runtime checks

- **WHEN** a developer explicitly invokes the local VS Code, UI, or real API command
- **THEN** the command MAY use gitignored configuration, an already-running Extension Development Host, isolated local fixtures, or provider credentials
- **AND** missing partial VS Code configuration SHALL fail visibly while completely absent optional configuration MAY be reported as skipped
