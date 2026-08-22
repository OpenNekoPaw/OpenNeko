# dsh-tool-detail-inspection Specification

## Purpose
TBD - created by archiving change improve-dsh-tool-detail-inspection. Update Purpose after archive.
## Requirements
### Requirement: Complete Tool payloads are inspectable

The Agent Webview SHALL allow users to inspect and copy the complete input and
output payload of a DSH Tool event without replacing the current UI.

#### Scenario: A long Tool result is displayed

- **WHEN** formatted Tool JSON exceeds the collapsed detail height
- **THEN** the user can scroll it vertically or expand the payload
- **AND** no part of the authoritative payload is discarded

#### Scenario: A Tool payload is copied

- **WHEN** the user activates Copy for Tool input or output
- **THEN** the clipboard receives the complete formatted JSON for that payload
- **AND** the affected control reports success or a visible failure
