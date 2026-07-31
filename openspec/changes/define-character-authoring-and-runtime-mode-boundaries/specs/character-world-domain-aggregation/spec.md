## MODIFIED Requirements

### Requirement: Character owns project, version, and run semantics

`neko-chara` MUST own the `CharacterProject -> CharacterVersion` lifecycle, character-specific bindings for profile, representation, voice, memory policy, capability policy, roleplay and validation, and mode-specific CharacterRun orchestration. CharacterVersion MUST remain immutable character canon. NarrativeCharacterRun MUST consume World/Narrative save state through explicit bindings, while companion mode MUST use a Chara-owned UserCharacterRelationship for durable user-interaction memory. Chara MUST reference Entity, Asset, Agent, representation, voice, perception and Activity capabilities through stable refs or ports instead of copying their implementations or facts.

#### Scenario: A character is published and run

- **WHEN** a CharacterProject candidate is reviewed and published
- **THEN** it produces a stable CharacterVersion suitable for cross-project reference
- **AND** every narrative or companion run receives explicit runtime kind, run and AgentSession identities

#### Scenario: A published character starts daily interaction

- **WHEN** companion mode starts from a CharacterVersion
- **THEN** Chara binds it to an explicitly identified UserCharacterRelationship
- **AND** relationship memory remains separate from CharacterVersion canon and individual AgentSession transcripts

### Requirement: Memory fact ownership and promotion are explicit

CharacterProject/CharacterVersion MUST own versioned character canon and memory policy; NarrativeSave/WorldSave MUST own branch-, checkpoint- and save-scoped story events, relationships and user interactions; UserCharacterRelationship MUST own accepted cross-session companion memories; CharacterRun MUST own only run-scoped context and uncommitted candidates; shared Memory infrastructure MUST own only derived indexing, compression and recall. Runtime memory MUST NOT change CharacterVersion. Only an independently reviewed character-authoring insight MAY be accepted by CharacterProject and published in a new CharacterVersion.

#### Scenario: A narrative experience affects a story character

- **WHEN** a user interaction or world event occurs in a NarrativeCharacterRun
- **THEN** the experience remains in the authoritative NarrativeSave/WorldSave causal history
- **AND** it does not enter another branch, companion relationship or CharacterVersion by default

#### Scenario: A companion interaction is remembered

- **WHEN** a CompanionRun produces an accepted long-term interaction memory
- **THEN** the memory is committed to the explicit UserCharacterRelationship revision
- **AND** it remains independent from CharacterVersion and may be selectively retained when the relationship rebinds to a new version

#### Scenario: Runtime reveals a character-authoring insight

- **WHEN** narrative or companion evidence suggests a change to the reusable character design
- **THEN** the system creates a separately identified CharacterProject review candidate
- **AND** only explicit acceptance and publication of a new CharacterVersion changes reusable character canon

#### Scenario: Memory infrastructure retrieves context

- **WHEN** the memory service indexes, compresses or recalls an authorized snapshot
- **THEN** its result is a derived context projection constrained by the owning save or relationship identity
- **AND** it cannot directly write CharacterVersion, NarrativeSave, WorldSave, UserCharacterRelationship or Agent transcript facts
