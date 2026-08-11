## ADDED Requirements

### Requirement: Companion memory has a stable cross-conversation owner

Chara SHALL own one exact companion continuity identity for a user and stable CharacterProject identity. That continuity SHALL reference accepted CharacterMemory and UserCharacterRelationship independently from any one CharacterRun, Conversation, AgentSession or CharacterVersion. A Companion turn SHALL resolve the exact continuity before execution and MUST NOT fall back to active/recent Character or transcript search.

#### Scenario: User starts another companion conversation

- **WHEN** the same user starts a new Companion Conversation for a later CharacterVersion published by the same CharacterProject
- **THEN** Chara resolves the same companion continuity and projects its accepted role and relationship memory with exact source-version receipts
- **AND** the new CharacterRun does not create an unrelated empty long-term memory authority

### Requirement: Transcript and extracted facts remain memory candidates

Agent transcript, RoomEvent, Character model output and authorized external materials SHALL NOT become accepted CharacterMemory or relationship memory directly. Chara SHALL accept only sourced candidates through the corresponding CharacterMemory or UserCharacterRelationship review policy, and correction/deletion SHALL remain independent in the two owners.

#### Scenario: Companion dialogue reveals a durable preference

- **WHEN** a completed character turn suggests a stable user preference and a subjective Character experience
- **THEN** the system may create two separately sourced candidates under relationship and Character memory owners
- **AND** accepting, correcting or rejecting either candidate does not decide the other

#### Scenario: Material-grounded Character turn proposes a character fact

- **WHEN** a Companion Character turn analyzes an attached source and the user requests that the result be remembered
- **THEN** Chara creates an explicitly attributed candidate only after that user action
- **AND** model output is not accepted automatically as Character canon or accepted memory

### Requirement: Narrative is isolated from companion continuity

Narrative Conversation SHALL neither read nor write companion CharacterMemory or UserCharacterRelationship. Its authored narrative memories and relationship state SHALL come only from the frozen CharacterVersion/StorylineNode context, and its transcript SHALL remain Conversation-owned. Closing, reopening or deleting Narrative MUST NOT change companion continuity.

#### Scenario: Narrative and companion use the same CharacterVersion

- **WHEN** a Narrative Conversation and a Companion Conversation bind the same CharacterVersion
- **THEN** only Companion receives accepted continuity memory and may produce new long-term candidates
- **AND** Narrative uses only its authored node memory while both transcripts remain isolated

### Requirement: Character version changes preserve provenance without implicit reinterpretation

Every accepted companion memory SHALL retain the exact source CharacterVersion and Conversation/Turn or RoomEvent reference. Publishing a new CharacterVersion SHALL NOT rewrite memory content or source, but the same CharacterProject continuity MAY project compatible accepted memories to the new version under an explicit canonical policy. Invalid or incompatible memory SHALL remain visible with a local diagnostic and MUST NOT be replaced by an empty or fabricated value.

#### Scenario: New publication changes a knowledge boundary

- **WHEN** an accepted memory from an older CharacterVersion conflicts with the newly selected CharacterVersion's knowledge boundary
- **THEN** Chara excludes that entry from the current turn projection and exposes a record-local compatibility diagnostic
- **AND** the original memory and older Conversation remain unchanged

### Requirement: Memory context is bounded and reconstructible

Companion turn context SHALL derive a bounded, participant-specific memory view from accepted authoritative entries and the exact current CharacterVersion. Cache, context compaction or UI state MUST NOT become memory authority. Reopening a Conversation or rebuilding context SHALL produce the same semantic memory view for the same authority and selection, subject only to explicit accepted/corrected/deleted memory changes.

#### Scenario: Agent compacts a long companion conversation

- **WHEN** Agent compacts transcript context before the next turn
- **THEN** Chara rematerializes the accepted companion memory view independently of the compacted text
- **AND** no dropped transcript message is silently promoted to or removed from long-term memory

### Requirement: Invalid memory records fail locally

A malformed companion continuity, CharacterMemory entry, relationship entry or source receipt SHALL disable only the affected entry or continuity operation and SHALL keep the owning record visible with a diagnostic. It MUST NOT prevent unrelated Characters, Narrative Conversations, sibling memory entries or the Desktop shell from loading.

#### Scenario: One accepted memory cannot decode

- **WHEN** Chara loads one invalid memory entry beside valid entries in the same continuity
- **THEN** the invalid entry remains visible and is omitted from turn projection with an exact diagnostic
- **AND** valid sibling memories and other Character continuities remain usable
