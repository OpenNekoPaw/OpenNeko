## ADDED Requirements

### Requirement: Agent configuration authorities are separated

UI-managed runtime selections SHALL use an Agent-owned stable state repository. User-editable
provider/model/MCP definitions SHALL use the product configuration owner or explicit local export.
Credentials SHALL remain in SecretStorage/keychain. No mixed fallback or product legacy import path
may combine these authorities.

#### Scenario: Agent configuration is loaded

- **WHEN** Agent starts with canonical configuration
- **THEN** each field is read from its exact owner
- **AND** missing or invalid configuration fails with an owner-qualified diagnostic

### Requirement: Conversation facts and operational state remain distinct

Pi Session files SHALL remain authoritative for transcript and branch facts. Conversation catalog,
leases, checkpoints and task state MAY use Agent-owned stable state/cache repositories, but MUST be
scoped by exact conversation/session/request identity without writer epochs or schema versions.

#### Scenario: Two conversations run concurrently

- **WHEN** each conversation commits operational state
- **THEN** each session owner serializes its own writes
- **AND** neither operation targets active conversation state or a shared generation counter

### Requirement: Agent projections are rebuildable but not fallback authorities

Listing, search and semantic acceleration SHALL be derived from Agent/project facts. Projection loss
MAY trigger ordinary recomputation from current authority. A stale/invalid projection MUST NOT replace
facts, return fabricated empty success or switch to a retired source.

#### Scenario: One conversation projection is invalid

- **WHEN** another conversation projection remains valid
- **THEN** the invalid entry reports its exact identity
- **AND** the valid conversation remains listable and restorable

### Requirement: Accepted memory uses its owning fact format

Accepted character/project memory SHALL be written only through its owning Chara/project contract.
Draft or cache observations MUST NOT become authoritative memory through log replay or automatic
rebuild. Character versions remain user-managed business identities and do not version the memory file
shape.

#### Scenario: A reviewed Character observation is accepted

- **WHEN** the user accepts it through the owning workflow
- **THEN** Chara writes the canonical memory fact
- **AND** Agent SQLite/cache state remains only operational or derived

### Requirement: Retired Agent databases and config are product-unreachable

Normal Agent startup MUST NOT open, import, archive, delete or repair retired Agent-specific databases
or mixed config sources. Existing bytes remain untouched; exact offline repair requires separate user
authorization.

#### Scenario: Retired Agent database remains on disk

- **WHEN** Agent starts with a canonical authority available
- **THEN** it never opens the retired database
- **AND** canonical conversations and settings continue independently
