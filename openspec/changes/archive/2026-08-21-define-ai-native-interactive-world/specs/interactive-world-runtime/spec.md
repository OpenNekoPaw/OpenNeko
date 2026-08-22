## ADDED Requirements

### Requirement: Run binds explicit participant identity and stance

Each WorldExperienceRun SHALL bind stable run, save, branch, participant and controller identities plus one explicit stance from `observer`, `participant`, `embodied-character` or `director`; missing or mismatched identity MUST fail visibly.

#### Scenario: Start as a participant

- **WHEN** a user selects a permitted participant entry point and starts a new Experience
- **THEN** the Run creates an explicit participant/controller binding and all later inputs inherit that authoritative identity

#### Scenario: Prevent stance escalation

- **WHEN** a participant-model output claims director or author authority that is not present in the Run binding
- **THEN** World runtime treats it as untrusted text and refuses the elevated operation

### Requirement: World actor runtime binds but does not own Character runtime

Each Character-backed WorldActorInstance SHALL resolve one exact WorldActorBinding and immutable CharacterVersion into an independently owned CharacterRun and, for an agent controller, its one primary AgentSession. World runtime SHALL own only World-local actor state and SHALL NOT create or mutate CharacterProject/CharacterVersion or a second actor-level Agent session.

#### Scenario: Character-backed actor enters a World

- **WHEN** a valid WorldActorBinding is instantiated for an agent-controlled actor
- **THEN** World Runtime creates World-local actor state and requests Character Runtime for the exact CharacterVersion/CharacterRun binding
- **AND** Character canon remains unchanged while position, inventory, faction, injury and World knowledge are committed only through World events

### Requirement: Experience runtime binds independently managed Runs

WorldExperienceRun SHALL bind exact WorldRun, WorldStoryRun, participant, CharacterRun and CharacterStorylineRun identities plus any optional WorldGameSession and execution/presentation binding. It SHALL NOT copy their facts or impose a shared create, pause, resume, complete or failure lifecycle.

#### Scenario: One Character participates in another World Story

- **WHEN** the same CharacterVersion starts a separate Experience in another WorldStoryVersion
- **THEN** runtime binds a distinct CharacterStorylineRun and WorldStoryRun for that Experience
- **AND** neither active/latest identity nor memory similarity can select the CharacterStorylineRun from the first World

### Requirement: All behavior enters as a typed intent

User, Character Agent, World Director and deterministic system behavior that may change World facts SHALL enter World runtime as a registered typed WorldActionIntent carrying source, target, action kind, arguments, observation revision and expected state revision; free-form model output MUST NOT directly mutate state. Story progress and Gameplay actions SHALL use their own owner-qualified typed intents rather than overloading WorldActionIntent.

#### Scenario: Accept a valid Character action

- **WHEN** a Character Agent proposes a registered action using its bound actor identity and current authorized revisions
- **THEN** World runtime validates the intent and either commits ordered WorldEvents or returns a typed rejection

#### Scenario: Reject an unknown action

- **WHEN** an AI or Renderer submits an unregistered action kind or invalid payload
- **THEN** strict decoding rejects it and no event, state change or success projection is produced

### Requirement: World runtime is the sole World fact commit authority

Only the World Runtime owning application service SHALL validate identity, stance, visibility, permission, precondition, World rule, approval and revision and atomically commit WorldEvent and the next WorldState revision. It SHALL NOT commit WorldStoryRun progress, CharacterStorylineRun progress or WorldGameSession state.

#### Scenario: Reject a stale concurrent intent

- **WHEN** two intents use the same expected revision and one commits first
- **THEN** the later intent receives a stale-revision rejection and MUST re-materialize context before replanning

### Requirement: Cross-owner progression follows committed events and typed candidates

A committed WorldEvent, GameEvent or GameResult MAY produce sourced WorldStoryProgressCandidate and CharacterStoryProgressCandidate records. World Story and Chara SHALL independently validate and commit their own progress; Experience and Agent SHALL NOT treat candidate creation as accepted progress or require a distributed transaction across owners.

#### Scenario: Story owner is temporarily unavailable

- **WHEN** World Runtime commits an event while World Story cannot process its derived progress candidate
- **THEN** the WorldEvent remains committed and the candidate is retained or reported as pending with an owner-qualified diagnostic
- **AND** no Story progress is fabricated and unrelated World/Character/Game Runs remain usable

### Requirement: Observations are participant-scoped

Before user or AI reasoning, the World owner SHALL materialize an immutable WorldView filtered by run, branch, time, location, participant visibility, actor knowledge and committed revision; consumers MUST NOT receive hidden facts and filter them only through prompts.

#### Scenario: Preserve a Character secret

- **WHEN** one Character knows a hidden fact that another Character has not perceived or been told
- **THEN** the second Character WorldView omits that fact and its source material

### Requirement: AI roles are isolated proposal producers

Intent Interpreter, Character Agent, World Director, Rule Evaluator, Narrator and Generative Presentation, when declared by the selected Experience, SHALL use explicit role scopes and separate mutable session state where applicable; none SHALL receive a general World repository or direct commit capability. Only roles declared as required by the active profile SHALL gate its launch/continuation, and only realtime roles SHALL require a qualified realtime contract.

#### Scenario: Director proposes a story opportunity

- **WHEN** World Director identifies a suitable story beat
- **THEN** it returns a director event candidate that remains provisional until World runtime validates and commits it

#### Scenario: Narrator renders committed facts

- **WHEN** Narrator produces a participant-facing description
- **THEN** it consumes only committed events and that participant's WorldView and cannot create an additional hidden WorldEvent

### Requirement: Speech and generated presentation are not objective facts

Character utterance, narration, realtime-generated image, audio, video or spatial output SHALL be represented as speech or presentation evidence bound to source event and WorldView revisions and MUST NOT automatically become WorldFact or state mutation. A late or cancelled presentation result MUST NOT replace the current WorldView.

#### Scenario: Character states a false claim

- **WHEN** a Character says that an event occurred but World runtime has not committed such an event
- **THEN** the utterance is preserved as speech while objective WorldState remains unchanged

#### Scenario: Reject a late generated presentation

- **WHEN** a generated presentation arrives after its deadline or after the Run, branch, Scene or source revision has changed
- **THEN** runtime rejects it from the active projection and it cannot mutate WorldState or overwrite the current Scene

### Requirement: Runtime core is engine-independent

World Definition/Runtime core and application SHALL NOT depend on Electron, React, DOM, ECS, 3D renderer, physics, navigation, frame-loop, device input, Agent Play, VLA, Computer Use or external game implementation.

#### Scenario: Run a synthetic World fixture headlessly

- **WHEN** tests instantiate a WorldVersion and submit semantic intents without any Renderer or Electron process
- **THEN** the same WorldEvent, WorldState and WorldView contracts execute successfully
