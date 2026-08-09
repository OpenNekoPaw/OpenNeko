## ADDED Requirements

### Requirement: World Foundation owns WorldBook and background facts

The system SHALL provide a host-neutral World owner for editable WorldProject data and immutable, user-managed WorldVersion publication. WorldBook entries, background, locations, organizations, rules and initial facts SHALL NOT be owned by CharacterRoom, Agent transcript or Renderer state.

#### Scenario: World background is attached to a Room

- **WHEN** a Room explicitly binds a WorldVersion
- **THEN** participants receive background through a World-owned view derived from that exact version
- **AND** editing the WorldProject does not mutate the active Room's frozen WorldVersion

### Requirement: World evolution follows one intent-event-state path

World state SHALL change only through the canonical `WorldActionIntent -> WorldEvent -> WorldState` path owned by the World application service. Free-form model output, Room messages, summaries and presentation events SHALL remain non-authoritative until accepted as a typed WorldEvent.

#### Scenario: Character claims a door opened

- **WHEN** a Character posts a Room utterance saying that a door opened
- **THEN** the utterance remains a RoomEvent and does not modify WorldState
- **AND** the door changes only after the World owner validates and commits an authorized action intent

### Requirement: Room and World timelines remain separate authorities

RoomEvent and WorldEvent timelines SHALL keep independent owner identity and payloads. A combined user-facing timeline MAY merge read-only projections by stable event reference, but SHALL NOT copy payloads into another store or become a commit authority.

#### Scenario: World action and Character reaction are displayed together

- **WHEN** a committed WorldEvent is followed by Character Room responses
- **THEN** the UI may order their projections in one visible timeline
- **AND** rebuilding that projection from the Room and World authorities produces the same references without writing either source

### Requirement: WorldView is participant scoped

The World owner SHALL materialize each WorldView using exact WorldVersion, WorldRun, WorldSave, branch, timepoint, actor knowledge and visibility identities. Chara and Agent SHALL consume that immutable view without querying hidden WorldState or adding omitted facts.

#### Scenario: Character does not know a World secret

- **WHEN** a WorldEvent is outside a participant's knowledge or visibility scope
- **THEN** the participant WorldView omits that event and its derived state
- **AND** Room membership, retrieval or model knowledge cannot reintroduce the secret into the Agent context

### Requirement: Companion World binding is optional and explicit

A companion DialogueRun or RoomRun MAY bind an exact WorldVersion/WorldRun for background and evolving activity context, or MAY operate without World. Absence of a World binding SHALL be a normal explicit companion state, not a failed World lookup followed by fallback.

#### Scenario: Companion Room has no World

- **WHEN** the user creates a companion Chatroom without selecting World
- **THEN** Chara creates the RoomRun using relationship memory and Room context only
- **AND** no implicit WorldProject, empty WorldView or recent World binding is created

### Requirement: Narrative World binding is mandatory and durable

Every narrative DialogueRun or RoomRun SHALL bind exact WorldVersion, WorldRun, WorldSave and branch identities. WorldSave SHALL retain the durable event history and state required to close, reopen and continue the same narrative authority.

#### Scenario: Narrative Room is reopened

- **WHEN** the user reopens a valid narrative Room after its UI and unprotected runtime resources were released
- **THEN** the system reconstructs Room and participant views from the exact RoomRun and WorldSave branch
- **AND** it does not use active Workspace, latest WorldVersion, another save or Agent transcript as a recovery source

### Requirement: World commits use an evidence-backed CAS token

WorldActionIntent commits SHALL carry the expected World state revision observed by the producer. The World application service SHALL reject stale commits so an asynchronous Agent response cannot overwrite or append against a different WorldState.

#### Scenario: World changes while an Agent action is pending

- **WHEN** a pending action targets an earlier World state revision
- **THEN** the World owner rejects that action with a stale-world-state diagnostic
- **AND** the caller must rematerialize WorldView before proposing another action

### Requirement: WorldSave branches preserve one immutable event authority

WorldSave SHALL create a child branch from an exact event on an exact parent branch without copying or rewriting parent WorldEvents. The child branch SHALL derive its starting facts from WorldVersion and ancestor events, keep branch-local CAS revision, continue narrative timepoint from the fork event, and require explicit exact-identity activation before new commits.

#### Scenario: Narrative continues from an earlier event

- **WHEN** the user forks a new branch from a committed event and continues the narrative
- **THEN** the parent branch keeps its original event objects and state unchanged
- **AND** the child branch begins with derived facts at the fork event, records only its own new events and remains independently reopenable by exact branch identity
- **AND** no active, recent or transcript-backed branch is selected implicitly

### Requirement: Foundation excludes current control capabilities

The World Foundation SHALL NOT register Browser Use, Computer Use, Play-use, external-game, VLA, seat-control or OS-input capabilities. Missing future capabilities SHALL remain unavailable and SHALL NOT be represented by optional imports, empty adapters or successful no-op handlers.

#### Scenario: Current Room requests a future control operation

- **WHEN** a caller requests Browser Use, Computer Use, Play-use or game control through this Foundation
- **THEN** no matching World Foundation operation is registered
- **AND** unrelated Character, Room and WorldBook capabilities remain available

### Requirement: Future World extends the canonical authority

Future WorldExperience, realtime AI, generative presentation, complex replay and Activity composition SHALL reuse the same WorldVersion, WorldRun, WorldActionIntent, WorldEvent, WorldState and WorldView authority. Future extensions SHALL NOT add a second World state store, version-dispatched contract or transcript-backed success path.

#### Scenario: Future realtime World capability is composed

- **WHEN** a future change adds realtime World model or presentation behavior
- **THEN** model outputs remain proposals consumed by the existing World application authority
- **AND** only committed WorldEvents change the state observed by current Character Dialogue and Chatroom consumers
