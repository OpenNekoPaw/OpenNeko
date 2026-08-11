## ADDED Requirements

### Requirement: World Gameplay owns its rules and session state

World Gameplay SHALL own authored rules, seats, action validation, session state, outcomes and result verification independently from World facts, Character facts and Agent transcript.

#### Scenario: Gameplay action changes the World

- **WHEN** a valid Gameplay result implies a possible World change
- **THEN** Gameplay commits its own result and emits a typed candidate for World runtime
- **AND** World facts change only if World runtime independently accepts that candidate

### Requirement: Agent Play controls but does not own game facts

Agent Play SHALL consume an owner-scoped observation and submit an authorized action proposal. The corresponding World Gameplay or external Game owner SHALL validate and commit the action.

#### Scenario: Agent proposes an illegal action

- **WHEN** Agent Play proposes an action outside the current action space
- **THEN** the owning Gameplay/Game session rejects it without changing state or selecting another game path
