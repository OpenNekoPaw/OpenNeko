## MODIFIED Requirements

### Requirement: Conversation facts and operational state remain distinct

Pi Session files SHALL remain authoritative for transcript and branch facts. Conversation catalog,
leases, checkpoints and task state MAY use Agent-owned stable state/cache repositories, but MUST be
scoped by exact conversation/session/request identity without ordered writer generations or schema
versions. Established stable SQLite field names and values MUST remain readable and MUST NOT be renamed,
rewritten, dispatched by shape, or interpreted using numerical order. The package repository MAY expose
an opaque equality-only request identity while keeping its physical storage representation private.

#### Scenario: Two conversations run concurrently

- **WHEN** each conversation commits operational state
- **THEN** each session owner serializes its own writes
- **AND** neither operation targets active conversation state or a shared generation counter

#### Scenario: Existing stable lease and checkpoint records are opened

- **WHEN** the current Agent runtime opens a database containing established lease and checkpoint rows
- **THEN** it uses the same stable fields and exact stored identities without rewriting any row
- **AND** a new lease and turn checkpoint use the same single repository path

#### Scenario: One stale writer attempts to commit

- **WHEN** an exact conversation lease is replaced and its prior holder later submits a checkpoint
- **THEN** the package rejects only that stale operation by exact holder and opaque lease identity
- **AND** unrelated conversations and checkpoints remain available
