# character-dialogue-chatroom Specification

## Purpose
TBD - created by archiving change define-character-dialogue-chatroom-world-foundation. Update Purpose after archive.
## Requirements
### Requirement: Dialogue and Chatroom are distinct interaction topologies

The system SHALL model one selected Character as Dialogue and multiple selected participants as Chatroom. Both topologies SHALL reuse the same CharacterRun and primary AgentSession ownership contracts. Conversation mode selection and mode-specific context SHALL be provided only by the successor `character-conversation-modes` capability and MUST NOT be inferred from topology, prompt text or an active tab.

#### Scenario: One and multiple Character selections are created

- **WHEN** the user confirms one exact Character selection or multiple exact participant selections
- **THEN** Chara creates the matching Dialogue or Chatroom topology
- **AND** topology alone does not select, change or reinterpret the Conversation mode

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
- **THEN** each participant receives its own visibility-filtered RoomView and only the Character context authorized by the exact Conversation mode selection
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

### Requirement: UI lifetime does not own Character activity

Dialogue and Chatroom Roots SHALL render selected projections only. Unmounting, switching Workspace or entering another scene SHALL NOT delete durable Character/Room records or cancel turns that have a real queue, approval or external-operation protection condition.

#### Scenario: User leaves a Room while a Character is responding

- **WHEN** the Chatroom Root unmounts during an active protected Agent turn
- **THEN** the AgentSession and exact Room/Character identities remain bound until completion or explicit cancellation
- **AND** reopening the Room attaches to those identities rather than an active or recent fallback
