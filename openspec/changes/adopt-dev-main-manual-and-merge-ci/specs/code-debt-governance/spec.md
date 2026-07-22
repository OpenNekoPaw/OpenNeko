## MODIFIED Requirements

### Requirement: Debt findings have one owning governance scope

The repository SHALL assign every blocking production debt finding to exactly one governance scope. Agent-owned paths SHALL be validated by the Agent debt register, while non-Agent paths SHALL be validated by the repository debt ledger. Both governance scopes SHALL remain blocking in local, Manual, and Merge Gates while the full explanatory scan remains available locally.

#### Scenario: Agent rejection diagnostic is scanned

- **WHEN** an Agent source line contains a legacy rejection or compatibility term
- **THEN** the repository scanner reports the occurrence without adding it to the non-Agent blocking count
- **AND** the Agent boundary gate remains responsible for accepting or rejecting the surface

#### Scenario: Non-Agent legacy success path is scanned

- **WHEN** a non-Agent production path can still derive a successful result from a replaced field, handler, renderer, or command
- **THEN** the repository legacy gate classifies it as blocking migration debt

#### Scenario: Manual validation observes unclassified production debt

- **WHEN** Manual Gate validates a ref containing a blocking Agent or non-Agent legacy, fallback, or deprecated surface without valid ownership and ledger classification
- **THEN** Manual Gate SHALL fail visibly

#### Scenario: Merge introduces unclassified production debt

- **WHEN** a development-branch-to-main Pull Request contains a blocking Agent or non-Agent legacy, fallback, or deprecated surface without valid ownership and ledger classification
- **THEN** Merge Gate SHALL fail before the change can merge
