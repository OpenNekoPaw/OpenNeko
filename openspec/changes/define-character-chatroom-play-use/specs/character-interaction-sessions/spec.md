## ADDED Requirements

### Requirement: Character experiences compose topology and activity

The system SHALL model the user-visible single-character dialogue, multi-character dialogue, single-character Play, and multi-character Play experiences as validated combinations of `single-character | multi-character` topology and `dialogue | play` interaction kind rather than four independent session runtimes. Play-use SHALL remain an internal execution capability for Play and SHALL NOT be exposed as the product interaction kind.

#### Scenario: Four product presets resolve to shared primitives

- **WHEN** the product resolves any of the four Character experience presets
- **THEN** it produces one validated participant roster, room identity, optional Play activity binding and projection using the same canonical contracts
- **AND** it does not select a preset-specific Agent loop or transcript implementation

### Requirement: Participants declare stable identity and controller

Every room participant SHALL carry a stable participant identity, an explicit human, agent or deterministic-system controller, and any applicable CharacterVersion, CharacterRun, WorldActor or relationship binding. Every active agent-controlled CharacterRun SHALL map to at most one primary AgentSession.

#### Scenario: Ensemble room starts independent character runs

- **WHEN** an ensemble room starts with two agent-controlled characters
- **THEN** each participant receives a distinct participant identity, frozen CharacterVersion binding, CharacterRun identity and primary AgentSession identity
- **AND** neither participant shares a responder, mutable transcript, model config or memory view with the other

#### Scenario: Human controls a character participant

- **WHEN** the user embodies or directly controls a character participant
- **THEN** the participant records a human controller and the character identity separately
- **AND** the system does not create a hidden character-playing AgentSession for that participant

### Requirement: Character Agent configuration has explicit ownership and revision

The system SHALL separate immutable CharacterVersion information, CharacterRun mode and memory binding, conversation-local model configuration, and an immutable per-turn effective snapshot. Runtime kind, CharacterVersion and memory owner SHALL remain fixed for an active CharacterRun; mutable conversation settings SHALL affect only future turns.

#### Scenario: Character information changes during an active room

- **WHEN** a CharacterProject draft or published version changes after a CharacterRun starts
- **THEN** the active run continues with its frozen CharacterVersion/profile revision
- **AND** adopting the new version requires a new run or an explicit version-binding transaction

#### Scenario: Agent model changes between turns

- **WHEN** the user changes one participant's model configuration while no turn is active
- **THEN** the conversation config revision advances and the next turn freezes the exact resolved provider, model and parameters
- **AND** an already-running turn keeps its original configuration snapshot

### Requirement: Character model selection is exact and fail-visible

Dialogue-only Character operations SHALL resolve the exact `character.dialogue` purpose binding. A Play CharacterRun SHALL resolve an explicit `game.plan` LLM binding and, when required, `game.observe` perception and `game.control` VLA/control bindings. One model MAY satisfy multiple roles, but every turn/action receipt MUST retain the exact purpose, provider, model and parameter snapshot; missing, incompatible or uncredentialed bindings MUST return an unavailable diagnostic without another-purpose or first-compatible fallback.

#### Scenario: Play-use participant selects an incompatible model

- **WHEN** a Play participant is configured without the planning, observation or control capabilities required by its game profile
- **THEN** the participant cannot enter an active operator state and receives an explicit capability diagnostic
- **AND** the system does not silently use `character.dialogue`, another participant's binding or the first compatible catalog entry

### Requirement: Turn context is materialized from authoritative scopes

Each Character turn SHALL use an immutable context assembled in order from the frozen CharacterVersion, authorized narrative or relationship memory view, Game Activity rule/playbook view, room/team/private event view, current game observation, current goal and effective permission/model/control receipts. Each input SHALL retain its owner identity and revision; compaction or retrieval SHALL NOT promote derived text into Character or game facts.

#### Scenario: Play turn receives bounded context

- **WHEN** an agent-controlled Character begins a Play turn
- **THEN** its LLM receives budgeted role, memory, rule, room and current-state context with source revisions
- **AND** its VLA/control model receives only the short-horizon goal, allowed action space, cropped current observation and stop conditions needed for the action chunk
- **AND** raw continuous frames are not appended to the durable conversation transcript

#### Scenario: Context source is stale

- **WHEN** the room, game, memory or control-lease revision changes before a proposed action commits
- **THEN** the stale context snapshot cannot authorize that action
- **AND** the owning runtime rematerializes context or returns a visible stale-revision diagnostic

### Requirement: Room interaction has one ordered event authority

Each room SHALL expose one revisioned event timeline whose events identify the room, actor, visibility, source turn or action and committed revision. Model outputs SHALL remain provisional until the owning room or game application service accepts them at the expected revision.

#### Scenario: Two characters respond from the same room revision

- **WHEN** two AgentSessions prepare public responses from the same room revision
- **THEN** the room owner serializes their commits and advances the revision for each accepted event
- **AND** a stale or conflicting commit is rejected or regenerated rather than appended out of order

### Requirement: Participant observations and memories remain scoped

The room or game owner SHALL filter events by participant visibility, actor knowledge, save/branch, team, seat and owner revision before constructing a turn observation. Room events MAY create sourced memory candidates, but SHALL NOT automatically mutate CharacterVersion, NarrativeSave, WorldSave or UserCharacterRelationship memory.

#### Scenario: Private room event is hidden from another character

- **WHEN** one participant receives a private or team-scoped event
- **THEN** another ineligible character's turn snapshot omits that event and any derived secret
- **AND** semantic similarity, shared room membership or a shared CharacterVersion cannot reintroduce it

### Requirement: Uncomposed Character room routes remain unavailable

Character room and ensemble product routes SHALL remain fail-visible until their Chara application owner, Agent adapter, persistence/projection contract and Desktop consumer are all composed and qualified.

#### Scenario: Desktop requests an unfinished ensemble room

- **WHEN** Desktop requests an ensemble Character room before the owning composition is complete
- **THEN** it returns an unavailable diagnostic naming the missing capability
- **AND** it does not reuse the active ordinary conversation, create empty participant sessions or simulate multiple characters with one responder
