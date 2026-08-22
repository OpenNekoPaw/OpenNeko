# agent-evaluation-catalog Specification

## Purpose
TBD - created by archiving change retire-legacy-document-evaluation. Update Purpose after archive.
## Requirements
### Requirement: Active evaluation uses the canonical document surface

Active Agent Evaluation suite and scenario files SHALL NOT contain the retired Pi document tool
names `ReadDocument`, `ReadImage`, `read_document`, or `read_document_image`.

#### Scenario: Legacy case is retired

- **WHEN** the suite catalog is loaded
- **THEN** no indexed scenario requires a retired Pi document/image tool
- **AND** the current DSH document contract remains validated by its owning package tests

#### Scenario: Stale case is introduced

- **WHEN** a suite or scenario under `scripts/agent-eval/suites` contains a retired document tool
  name
- **THEN** the deterministic catalog guard fails with the offending file path
