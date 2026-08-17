## MODIFIED Requirements

### Requirement: Conversation facts and operational state remain distinct

DSH Session files SHALL remain authoritative for transcript and model-context facts of executable Conversations. Conversation catalog, current DSH Session reference, permissions, checkpoints and domain Job references MAY use Agent-owned stable state/cache repositories, but MUST be scoped by exact conversation/session/turn/call/job identity without writer epochs, schema versions or active-object fallback. Old Pi Session files and Pi-only operational fields MUST remain untouched and MUST NOT be opened as a successful transcript path.

#### Scenario: Two conversations run concurrently

- **WHEN** each Conversation commits operational state against its exact DSH Session
- **THEN** each Session owner serializes its own writes
- **AND** neither operation targets active Conversation state or a shared generation counter

#### Scenario: Existing Pi Conversation is encountered

- **WHEN** a stable catalog record is identifiable but lacks a valid current DSH Session reference
- **THEN** the catalog preserves the record and reports a Conversation-scoped runtime-unavailable diagnostic
- **AND** normal runtime does not open, convert, delete or replace its Pi transcript

### Requirement: Agent projections are rebuildable but not fallback authorities

Listing, search and semantic acceleration SHALL be derived from Agent/project facts. Projection loss MAY trigger ordinary recomputation from the current DSH Session and current product authorities. A stale/invalid projection MUST NOT replace facts, return fabricated empty success or switch to Pi, raw Session bytes or another retired source. Conversation catalog enumeration SHALL read the one stable Conversation authority independently from the currently open Workspace or Desktop Project catalog. A missing Project or valid DSH Session binding MUST NOT hide the Conversation; it SHALL produce an unavailable owner/runtime projection with exact fields.

#### Scenario: One conversation projection is invalid

- **WHEN** another Conversation projection remains valid
- **THEN** the invalid entry reports its exact identity and invalid fields
- **AND** the valid Conversation remains listable and restorable through its exact DSH Session

#### Scenario: Conversation Workspace is not in the Shell catalog

- **WHEN** a valid Conversation references a Workspace that is not currently open
- **THEN** Agent Home still lists the Conversation under its stable Workspace identity
- **AND** Desktop marks only the unavailable Project/locator fields for manual handling

#### Scenario: Legacy projection is the only readable message source

- **WHEN** current DSH Session restoration fails but an old preview or Pi-derived projection remains
- **THEN** the Conversation stays non-executable with an exact diagnostic
- **AND** the projection is not used to fabricate transcript restoration

### Requirement: Retired Agent databases and config are product-unreachable

Normal Agent startup MUST NOT open, import, archive, delete, convert or repair retired Agent-specific databases, Pi Session files, Pi-only transcript mappings or mixed config sources. Existing bytes remain untouched; identifiable catalog records MAY expose bounded metadata and an unavailable diagnostic without decoding retired transcript content. Exact offline repair, export or deletion requires a separate product-unreachable workflow and explicit user authorization.

#### Scenario: Retired Agent database remains on disk

- **WHEN** Agent starts with the canonical DSH authority available
- **THEN** it never opens the retired database or Pi Session root as a runtime source
- **AND** canonical DSH Conversations and settings continue independently

#### Scenario: User inspects a legacy Conversation record

- **WHEN** its stable identity and catalog metadata are readable but its transcript authority is retired
- **THEN** the record remains visible with disabled execution and an explicit repair/export availability diagnostic
- **AND** no empty DSH Session is created on its behalf
