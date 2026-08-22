# interactive-world-gameplay Specification

## Purpose
TBD - created by archiving change define-ai-native-interactive-world. Update Purpose after archive.
## Requirements
### Requirement: World Gameplay is an optional independent subcapability

A WorldExperience MAY include a `WorldGameplayDefinition` owned by the World Gameplay subcapability. It SHALL define gameplay goals, seats, observation and action spaces, rules, resource loops, completion or win/loss conditions and result validation without adding those facts to World Definition, Character or presentation state. A World without Gameplay SHALL remain a valid World.

#### Scenario: Publish a narrative World without Gameplay

- **WHEN** an Experience has World and Story interaction but no independent seats, action space, resource loop or outcome rules
- **THEN** publication does not create an empty WorldGameplayDefinition or no-op WorldGameSession

#### Scenario: Publish an authored tactical encounter

- **WHEN** a World author accepts a tactical ruleset with explicit seats, legal actions and victory validation
- **THEN** the Experience pins the exact WorldGameplayDefinition and does not copy those rules into WorldRule, CharacterVersion or Renderer configuration

### Requirement: WorldGameSession owns authored in-World gameplay state

Each launched authored Gameplay instance SHALL use a `WorldGameSession` with exact definition, ExperienceRun, participant, seat and controller bindings. The World Gameplay owner SHALL validate actions, expected session revision, state transitions, completion and GameResult; World Runtime SHALL own only resulting semantic World effects that it separately accepts.

#### Scenario: Gameplay result changes the World

- **WHEN** a WorldGameSession commits a validated victory GameResult that proposes opening a city gate
- **THEN** the result remains authoritative for the GameSession and World Runtime receives a typed World effect candidate
- **AND** the gate changes only if World Runtime validates and commits its own WorldEvent

### Requirement: Agent Play owns planning and control, not Game authority

Agent Play SHALL own game understanding, strategy, replanning, action proposal and authorized control execution for a Character or user seat. It MUST NOT own Game rules, legal-action validation, session state, result verification, World facts or Character canon. The same Play capability MAY target a WorldGameSession or an external GameSession through an explicit capability profile.

#### Scenario: Agent proposes an illegal move

- **WHEN** Agent Play proposes an action outside the current seat's legal action space
- **THEN** the Gameplay/Game owner rejects the action with a typed diagnostic and no state or result is fabricated

#### Scenario: User takes over a seat

- **WHEN** control transfers from Agent Play to a human for an exact seat
- **THEN** the owning Session atomically updates its controller/lease binding while rules, state and result authority remain unchanged

### Requirement: External Games retain their own authority

An external game, emulator or third-party activity SHALL retain ownership of its GameSession, rules, state, seat and outcome contracts. WorldExperience MAY bind that external session to CharacterRun and/or WorldRun through explicit public references, but MUST NOT wrap it as a WorldGameSession or copy its state into WorldSave.

#### Scenario: Character plays an external game

- **WHEN** a CharacterRun participates in an external game through Agent Play
- **THEN** the external Game authority validates actions and results while Chara owns character behaviour and World remains optional

### Requirement: Gameplay and external Game implementations stay outside World core

World Definition/Runtime core SHALL NOT depend on a concrete game engine, VLA, Computer Use, device input implementation or external game adapter. World Gameplay SHALL expose semantic contracts; concrete Engine and Host control adapters SHALL live at their real runtime or trust boundaries.

#### Scenario: Run a turn-based Gameplay fixture headlessly

- **WHEN** tests instantiate a WorldGameplayDefinition and submit semantic actions without Electron, Renderer, VLA or a game engine
- **THEN** the same validation, GameEvent, GameState and GameResult contracts execute successfully
