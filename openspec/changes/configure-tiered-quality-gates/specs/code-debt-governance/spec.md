## MODIFIED Requirements

### Requirement: Debt findings have one owning governance scope

The repository SHALL assign every blocking production debt finding to exactly one governance scope. Agent-owned paths SHALL be validated by the Agent debt register, while non-Agent paths SHALL be validated by the repository debt ledger. Both governance scopes SHALL remain blocking in Pull Request and main gates while the full explanatory scan remains available locally.

#### Scenario: Agent rejection diagnostic is scanned

- **WHEN** an Agent source line contains a legacy rejection or compatibility term
- **THEN** the repository scanner reports the occurrence without adding it to the non-Agent blocking count
- **AND** the Agent boundary gate remains responsible for accepting or rejecting the surface

#### Scenario: Non-Agent legacy success path is scanned

- **WHEN** a non-Agent production path can still derive a successful result from a replaced field, handler, renderer, or command
- **THEN** the repository legacy gate classifies it as blocking migration debt

#### Scenario: Pull Request introduces unclassified production debt

- **WHEN** a Pull Request introduces a blocking Agent or non-Agent legacy, fallback, or deprecated surface without valid ownership and ledger classification
- **THEN** the branch gate SHALL fail before the change can merge

#### Scenario: Main revalidates production debt governance

- **WHEN** a commit is pushed to main
- **THEN** the main gate SHALL require the production debt ledger and owning Agent debt register checks to succeed
