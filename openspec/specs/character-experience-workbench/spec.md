# character-experience-workbench Specification

## Purpose

Define the product-level Character authoring, publication, interaction and presentation boundaries without
duplicating Agent, World or external resource authority.

## Requirements

### Requirement: Character authoring and publication have distinct identities

CharacterProject SHALL remain the mutable Chara-owned authoring record. Publication SHALL create an immutable,
user-managed CharacterVersion that preserves role facts and stable references to presentation resources.
Publishing a new version MUST NOT rewrite prior versions or redirect an existing Dialogue, Room or Run.

#### Scenario: Author publishes an updated Character

- **WHEN** an author publishes changes from a CharacterProject
- **THEN** Chara creates a new immutable CharacterVersion
- **AND** existing interactions remain bound to the version they selected

### Requirement: Character management is separate from interaction runtime

Character management SHALL provide one searchable catalog and exact record detail for authoring facts, published
versions, storylines, memories, representation references and run summaries. Selecting or inspecting a Character
MUST NOT create a Dialogue, Room, Agent Session or hidden runtime.

#### Scenario: One Character record is invalid

- **WHEN** an invalid Character record appears beside valid records
- **THEN** the catalog keeps that record visible with a local diagnostic and disables dependent actions
- **AND** valid Character records and unrelated product scenes remain available

### Requirement: Dialogue and Room launch use exact Character versions

Selecting one published CharacterVersion for first submit SHALL atomically create a Character-owned Dialogue,
CharacterRun and bound Agent Conversation. Selecting multiple compatible CharacterVersions SHALL atomically
create a Room, isolated participant CharacterRuns and a room-owned Conversation. Invalid, unpublished, duplicated
or incompatible selection MUST fail before creating partial runtime state.

#### Scenario: User starts a multi-Character Room

- **WHEN** the user selects multiple compatible published CharacterVersions and submits the first message
- **THEN** Chara creates one durable Room and isolated participant runs
- **AND** every Agent-controlled participant receives one exact primary Agent Session identity

### Requirement: Chara owns interaction topology and participant visibility

Dialogue and Room SHALL remain distinct interaction topologies. Chara SHALL own the room timeline, turn policy,
participant visibility and participant-scoped TTS/chat settings; Agent SHALL own Conversation and turn execution.
Unmounting a Character surface MUST NOT cancel protected Agent or Character runtime work.

#### Scenario: Participant cannot observe a private event

- **WHEN** a Room event is outside one participant's visibility policy
- **THEN** Chara filters it before constructing that participant's Agent context
- **AND** the authoritative Room timeline remains unchanged

### Requirement: Character lore does not become World authority

Background story, origin setting, canon, knowledge, behavior and expression SHALL remain Chara-owned role facts.
An origin setting or Character storyline MUST NOT create a runnable World, World Story or World state. Connections
to World-owned facts SHALL use explicit immutable references and preserve independent publication lifecycles.

#### Scenario: Character references a World

- **WHEN** an author associates a CharacterVersion with a published World identity
- **THEN** Chara stores only the exact reference needed for role context
- **AND** editing either owner requires its own publication workflow

### Requirement: Character presentation selects one exact representation

A CharacterVersion MAY reference portrait, Live2D, VRM, MMD or PNGTuber presentation resources. The product SHALL
mount only the explicitly selected supported representation through Host-authorized resource descriptors. A
missing renderer or invalid resource SHALL fail only that presentation surface without selecting another format,
changing Character facts or disabling Agent interaction.

#### Scenario: Selected representation is unavailable

- **WHEN** the chosen representation has no qualified renderer
- **THEN** the Character presentation surface shows an exact diagnostic
- **AND** management, Dialogue, Room and sibling records remain usable
