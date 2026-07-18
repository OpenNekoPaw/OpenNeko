## MODIFIED Requirements

### Requirement: Generic CI scripts exclude Evaluation

Generic local, branch, main, test, and CI composition scripts SHALL NOT directly or transitively invoke Agent Evaluation.

#### Scenario: GitHub runs the generic test command

- **WHEN** a GitHub workflow invokes the root generic test gate
- **THEN** the command SHALL complete its ordinary tests without executing the Agent Evaluation harness

#### Scenario: Developer runs a generic local gate

- **WHEN** a developer invokes the documented local, branch-reproduction, or main-reproduction gate
- **THEN** the command SHALL execute deterministic repository checks without invoking Agent Evaluation harnesses, suites, credentials, provider-backed cases, or report upload

#### Scenario: GitHub aggregates branch or main results

- **WHEN** a GitHub workflow publishes the stable branch or main aggregate gate
- **THEN** the aggregate job SHALL inspect only ordinary CI job results and SHALL NOT execute or require Agent Evaluation
