## MODIFIED Requirements

### Requirement: Generic CI scripts exclude Evaluation

Generic local, remote-reproduction, manual, merge, test, and CI composition scripts SHALL NOT directly or transitively invoke Agent Evaluation.

#### Scenario: GitHub runs the generic test command

- **WHEN** a GitHub Manual Gate or Merge Gate invokes the root generic test gate
- **THEN** the command SHALL complete its ordinary tests without executing the Agent Evaluation harness

#### Scenario: Developer runs a generic local gate

- **WHEN** a developer invokes the documented local or remote-reproduction gate
- **THEN** the command SHALL execute deterministic repository checks without invoking Agent Evaluation harnesses, suites, credentials, provider-backed cases, or report upload

#### Scenario: GitHub aggregates manual or merge results

- **WHEN** a GitHub workflow publishes the stable Manual Gate or Merge Gate
- **THEN** the aggregate job SHALL inspect only ordinary CI job results and SHALL NOT execute or require Agent Evaluation
