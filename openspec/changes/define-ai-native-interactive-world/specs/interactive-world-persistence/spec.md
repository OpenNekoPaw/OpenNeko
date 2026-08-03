## ADDED Requirements

### Requirement: WorldSave binds an immutable Experience baseline
WorldSave SHALL identify the exact WorldExperienceVersion, Run, branch, parent checkpoint or branch, ordered event history, periodic checkpoints, current revision and participant/actor bindings needed to restore a WorldState.

#### Scenario: Create a new Save
- **WHEN** a user starts a new Experience from a valid entry point
- **THEN** the World owner creates a Save bound to the exact Experience version and an initial branch before accepting state-changing intents

### Requirement: Events explain history and checkpoints accelerate restoration
Committed WorldEvents SHALL be the authoritative ordered history after the immutable baseline, while checkpoints SHALL be validated acceleration artifacts; current state SHALL restore from a compatible checkpoint plus subsequent events.

#### Scenario: Restore after multiple checkpoints
- **WHEN** a Save contains a valid latest checkpoint and later committed events
- **THEN** restoration validates the baseline and checkpoint and applies later events to reproduce the committed current revision

#### Scenario: Reject an incompatible checkpoint
- **WHEN** a checkpoint schema, Experience version or integrity receipt does not match its Save
- **THEN** restoration rejects the checkpoint or related capability with a diagnostic instead of returning a fabricated empty state

### Requirement: Branching does not rewrite history
Continuing from an earlier checkpoint or event SHALL create a new branch identity with explicit ancestry; the parent branch event history MUST remain immutable.

#### Scenario: Fork from an earlier event
- **WHEN** a user selects a historical checkpoint and chooses to continue differently
- **THEN** the system creates a child branch whose first new event follows the selected revision without modifying the parent branch

### Requirement: Replay does not regenerate committed history
Replay SHALL project stored committed events and states and MUST NOT call AI models to recreate past dialogue, decisions, narration or effects.

#### Scenario: Replay with providers unavailable
- **WHEN** all AI providers are unavailable and a user replays an existing valid branch
- **THEN** committed history remains replayable from stored events and durable presentation evidence, while only new AI-dependent interaction is unavailable

### Requirement: AI receipts are evidence, not state authority
Persistence MAY record purpose, provider/model identity, parameter binding revision, input World revision and proposal/event identity for AI executions, but MUST NOT store credentials or require provider hidden state for restore.

#### Scenario: Restore after a model is removed
- **WHEN** a Save references receipts from a model that is no longer configured
- **THEN** restore uses committed WorldEvents and reports model availability only for future operations

### Requirement: Project facts and local projections remain separate
Portable World project, release and Save facts SHALL be written by World-owned codecs and repositories; user SQLite MAY store installed catalog, recent Run, attention, recovery and searchable projections but MUST NOT overwrite project facts.

#### Scenario: Projection update fails after a Save commit
- **WHEN** a WorldSave event commit succeeds but a local catalog or Search projection update fails
- **THEN** the Save remains authoritative and the projection is marked stale with a diagnostic
