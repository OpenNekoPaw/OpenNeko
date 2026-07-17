## ADDED Requirements

### Requirement: Agent Evaluation is local-only

The repository SHALL require every key-free or provider-backed Agent Evaluation execution to be started explicitly by a developer from a local checkout.

#### Scenario: Developer runs local harness validation

- **WHEN** a developer explicitly invokes the documented Agent Evaluation harness command locally
- **THEN** the repository SHALL validate the harness and indexed suites without requiring a GitHub Actions workflow

#### Scenario: Developer runs a provider-backed case

- **WHEN** a developer explicitly invokes a focused or repeated Agent Evaluation with valid local configuration and credentials
- **THEN** the Evaluation SHALL run through the canonical local runner and write reports to the gitignored local report directory

### Requirement: GitHub Actions cannot trigger Agent Evaluation

GitHub Actions workflows SHALL NOT invoke Agent Evaluation harnesses, suites, provider-backed runners, repeated matrices, Evaluation credentials, or Evaluation report upload.

#### Scenario: Pull request or push starts ordinary CI

- **WHEN** GitHub Actions processes a pull request or push
- **THEN** its jobs SHALL run ordinary build, unit, coverage and quality gates without reaching any Agent Evaluation command

#### Scenario: Scheduled or manually dispatched workflows are inspected

- **WHEN** repository workflows define schedule or manual-dispatch triggers
- **THEN** none of those workflows SHALL contain an Agent Evaluation execution path

### Requirement: Generic CI scripts exclude Evaluation

Generic test and CI composition scripts SHALL NOT directly or transitively invoke Agent Evaluation.

#### Scenario: GitHub runs the generic test command

- **WHEN** a GitHub workflow invokes the root generic test gate
- **THEN** the command SHALL complete its ordinary tests without executing the Agent Evaluation harness

### Requirement: Repository guard enforces the boundary

The repository SHALL provide a deterministic static guard that runs in ordinary quality checks and rejects any GitHub workflow or generic CI script that references Agent Evaluation execution surfaces.

#### Scenario: A workflow adds an Evaluation command

- **WHEN** a GitHub workflow references an Evaluation command, runner, credential, report path, or Evaluation-specific script
- **THEN** the static guard SHALL fail with a diagnostic identifying the forbidden workflow reference

#### Scenario: Local commands remain available

- **WHEN** the static guard validates the repository
- **THEN** it SHALL also prove that explicit local harness and provider-backed runner commands remain available outside generic CI composition

### Requirement: Evaluation reports remain local

Raw Agent Evaluation reports SHALL remain gitignored local developer evidence and SHALL NOT be uploaded by GitHub Actions.

#### Scenario: Local Evaluation writes evidence

- **WHEN** a local Evaluation completes or is blocked
- **THEN** its raw report SHALL remain under the local report root for developer-managed retention
