## ADDED Requirements

### Requirement: Interaction topology and runtime kind are orthogonal

The system SHALL model single-character Dialogue and multi-participant Chatroom as interaction topology, and SHALL separately bind each active run to exactly one `companion | narrative` runtime kind. It SHALL NOT model Play as a current Chara interaction type or switch runtime kind through an active tab, prompt or mutable session setting.

#### Scenario: Four current interaction combinations are created

- **WHEN** the user creates companion Dialogue, narrative Dialogue, companion Chatroom or narrative Chatroom
- **THEN** the run records the selected topology and runtime kind as independent facts
- **AND** all combinations reuse the same CharacterRun and primary AgentSession contract rather than selecting parallel responders

### Requirement: Every agent-controlled CharacterRun has one primary AgentSession

Every active agent-controlled CharacterRun SHALL bind one exact CharacterVersion and at most one primary Pi AgentSession. Agent runtime SHALL remain the authority for turns, queue, Tool Calls, Approval, streaming, cancellation, transcript and compaction.

#### Scenario: Character responds in a Dialogue

- **WHEN** an agent-controlled Character takes a turn
- **THEN** Chara materializes its frozen profile and authorized context into the bound primary AgentSession
- **AND** no Chara-owned responder loop or duplicate mutable transcript participates in the product success path

#### Scenario: Human controls a Character

- **WHEN** a participant controller is human
- **THEN** the system records the human controller and Character identity separately
- **AND** it does not create a hidden character-playing AgentSession

### Requirement: Chatroom participants remain isolated

Every RoomRun participant SHALL have a stable participant identity, explicit controller and any exact CharacterRun/AgentSession binding. Agent-controlled participants SHALL NOT share mutable transcript, model configuration, memory view or responder.

#### Scenario: Two Characters respond in one Room

- **WHEN** two agent-controlled participants are eligible to respond
- **THEN** each participant receives its own visibility-filtered RoomView, Character/relationship memory view and optional immutable external-composition view
- **AND** each response is produced by that participant's exact primary AgentSession

### Requirement: Chat and TTS configuration is participant- and turn-scoped

Each agent-controlled CharacterRun or Room participant SHALL own an independent effective Chat and TTS configuration. CharacterVersion MAY provide voice identity and default preferences, but changing a runtime provider, model, voice, speed or automatic-read setting SHALL affect only turns that have not started. Each started turn SHALL freeze the actual Chat/TTS execution receipt, and Room SHALL NOT create a shared mutable model or voice configuration.

#### Scenario: User changes one participant while another is speaking

- **WHEN** a Room participant has an active response and the user selects a different Chat model or TTS voice for a later response
- **THEN** the active turn keeps its frozen Chat/TTS receipt and the selected participant applies the change only to its next eligible turn
- **AND** other participants keep their own configuration unless the user explicitly applies a bounded per-participant batch update

#### Scenario: TTS drives an Avatar

- **WHEN** an accepted Character response is synthesized and played with timing or viseme evidence
- **THEN** Voice/Media owns the generated audio artifact and the exact turn records its TTS receipt
- **AND** the Avatar renderer may consume timing/viseme projection without owning TTS configuration, audio facts or the Agent turn

### Requirement: Room timeline has one Chara authority

Each RoomRun SHALL expose one ordered RoomEvent timeline for messages, membership, mentions, moderation, scheduling and accepted participant responses. Parallel Agent inference SHALL remain provisional until the Room owner accepts a response using the expected room revision.

#### Scenario: Two responses use the same Room revision

- **WHEN** two participant AgentSessions prepare responses from the same RoomView
- **THEN** the Room owner serializes accepted commits and advances the room revision
- **AND** a stale or duplicate response is rejected or regenerated rather than appended out of order

### Requirement: Participant visibility is filtered before Agent execution

The Room owner SHALL filter public, private and participant-scoped events before materializing an Agent turn. Shared Room membership, semantic similarity or a shared CharacterVersion SHALL NOT reintroduce events the participant is not allowed to observe.

#### Scenario: Private message targets one participant

- **WHEN** a RoomEvent is visible only to a selected participant
- **THEN** another participant's RoomView and Agent context omit that message and its derived secret
- **AND** the omitted content cannot enter the other participant's relationship memory candidate

### Requirement: Companion runs own relationship memory explicitly

A companion DialogueRun or RoomRun SHALL bind exact UserCharacterRelationship identities for durable cross-session memory. Searchable transcript and Room events MAY be evidence, but SHALL NOT become accepted relationship memory without an owning accept operation.

#### Scenario: Companion conversation produces a memory candidate

- **WHEN** a user message or accepted Room event suggests a durable preference or shared experience
- **THEN** Chara creates a sourced relationship memory candidate under the exact relationship identity
- **AND** acceptance, correction or deletion is controlled by UserCharacterRelationship rather than AgentSession or Room projection

### Requirement: Narrative runs require exact external Composition authority

A narrative DialogueRun or RoomRun SHALL bind the exact typed narrative Composition ref supplied by its owning external domain before creating participant CharacterRuns, CharacterStorylineRuns, CharacterMemoryScopes or AgentSessions. Chara SHALL NOT define, expand or infer the external storyline/runtime/save shape. Missing or invalid Composition authority SHALL keep only that narrative launch unavailable.

#### Scenario: Narrative Chatroom starts without a valid Composition binding

- **WHEN** the requested owning Composition ref cannot be resolved or validated
- **THEN** creation returns a visible external-composition-unavailable diagnostic
- **AND** it does not downgrade to companion mode, select active/recent external state or use the Room transcript as narrative authority

### Requirement: Runtime kind and authority do not change in place

An active DialogueRun or RoomRun SHALL keep its runtime kind, CharacterVersion, CharacterStorylineRun, memory owner and narrative Composition binding fixed. Changing any of these facts SHALL create a new run or use an explicit owning-domain transaction defined for that fact.

#### Scenario: User changes a companion Room to narrative

- **WHEN** the user requests narrative interaction from an active companion RoomRun
- **THEN** the system requires creation of a new narrative RoomRun, CharacterStorylineRun and CharacterMemoryScope with an exact external Composition binding
- **AND** it does not copy relationship memory into CharacterMemory or reinterpret old Room events as accepted storyline progress

### Requirement: UI lifetime does not own Character activity

Dialogue and Chatroom Roots SHALL render selected projections only. Unmounting, switching Workspace or entering another scene SHALL NOT delete durable Character/Room records or cancel turns that have a real queue, approval or external-operation protection condition.

#### Scenario: User leaves a Room while a Character is responding

- **WHEN** the Chatroom Root unmounts during an active protected Agent turn
- **THEN** the AgentSession and exact Room/Character identities remain bound until completion or explicit cancellation
- **AND** reopening the Room attaches to those identities rather than an active or recent fallback
