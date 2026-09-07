# agent-storage-authority Specification

## Purpose

Separate OpenNeko Conversation records and bindings from DSH Session/transcript authority while isolating invalid local records.

## Requirements

### Requirement: Agent configuration authorities are separated

UI-managed runtime selections SHALL use an Agent-owned stable state repository. User-editable
provider/model/MCP definitions SHALL use the product configuration owner or explicit local export.
An explicitly authored provider `api_key` SHALL remain owned by the product configuration document and
MUST be consumed only through a Host-only credential port. Credentials entered through protected UI
interaction SHALL remain in SecretStorage/keychain. Each provider SHALL select one explicit credential
owner; an invalid declared source MUST fail closed without reading another source. No dual write,
environment fallback or alternate import path may combine these authorities.

#### Scenario: Agent configuration is loaded

- **WHEN** Agent starts with canonical configuration
- **THEN** each field and provider credential is read from its exact owner
- **AND** missing or invalid configuration fails with an owner-qualified local diagnostic
- **AND** valid sibling providers, models and bindings remain available

#### Scenario: Inline provider credential is invalid

- **WHEN** a provider explicitly declares an invalid `api_key`
- **THEN** Agent reports that provider's config credential source as invalid
- **AND** it does not read SecretStorage or an environment variable for that provider

### Requirement: Conversation facts and operational state remain distinct

DSH Sessions SHALL remain authoritative for transcript and branch facts. Conversation catalog,
leases, checkpoints and task state MAY use Agent-owned stable state/cache repositories, but MUST be
scoped by exact conversation/session/request identity without writer epochs or schema versions. A
branched child SHALL receive one independent OpenNeko Conversation catalog record that inherits the
source Conversation's exact owner context and binds only to the DSH-owned child Session; OpenNeko MUST
NOT persist a transcript copy or a second branch graph.

#### Scenario: Two conversations run concurrently

- **WHEN** each conversation commits operational state
- **THEN** each session owner serializes its own writes
- **AND** neither operation targets active conversation state or a shared generation counter

#### Scenario: A DSH child Session becomes a Conversation

- **WHEN** DSH creates a child Session from a valid completed source turn
- **THEN** OpenNeko publishes one new Conversation record with the source owner context and one exact child binding
- **AND** DSH remains the only owner of the child's transcript prefix and parent lineage

### Requirement: Agent projections are rebuildable but not fallback authorities

Listing, search and semantic acceleration SHALL be derived from Agent/project facts. Projection loss
MAY trigger ordinary recomputation from current authority. A stale/invalid projection MUST NOT replace
facts, return fabricated empty success or switch to another source.
Conversation catalog enumeration SHALL read the one stable Conversation authority independently
from the currently open Workspace or Desktop Project catalog. A missing Project binding MUST NOT hide
the Conversation; it SHALL produce an unavailable owner projection with exact fields.

#### Scenario: One conversation projection is invalid

- **WHEN** another conversation projection remains valid
- **THEN** the invalid entry reports its exact identity
- **AND** the valid conversation remains listable and restorable

#### Scenario: Conversation Workspace is not in the Shell catalog

- **WHEN** a valid Conversation references a Workspace that is not currently open
- **THEN** Agent Home still lists the Conversation under its stable Workspace identity
- **AND** Desktop marks only the unavailable Project/locator fields for manual handling

### Requirement: Accepted memory uses its owning fact format

Accepted character/project memory SHALL be written only through its owning Chara/project contract.
Draft or cache observations MUST NOT become authoritative memory through log replay or automatic
rebuild. Character versions remain user-managed business identities and do not version the memory file
shape.

#### Scenario: A reviewed Character observation is accepted

- **WHEN** the user accepts it through the owning workflow
- **THEN** Chara writes the canonical memory fact
- **AND** Agent SQLite/cache state remains only operational or derived

### Requirement: Agent reads only its canonical authorities

Normal Agent startup MUST open only the canonical Conversation, operational-state, configuration and
credential authorities defined above. Unknown Agent-local bytes or mixed config sources MUST remain
untouched and MUST NOT become a fallback authority; exact offline repair requires separate user
authorization.

#### Scenario: Unknown Agent-local data remains on disk

- **WHEN** Agent starts with a canonical authority available
- **THEN** it does not inspect or import the unknown data
- **AND** canonical conversations and settings continue independently
