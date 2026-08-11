## ADDED Requirements

### Requirement: Runtime creation intent becomes an owner-qualified change candidate

An authorized participant or author MAY propose changes while a WorldExperienceRun is active. The Transformation capability SHALL classify each proposal as World state, World structure, World Story/Quest, World Gameplay/Interaction, Character-owned canon or Presentation; it SHALL bind the candidate to the exact Experience, Run, Save, branch, source revision, target owner and requester authority. Free-form text, generated media, engine state and model output MUST NOT directly mutate any owner.

#### Scenario: Add a tavern while the World is running

- **WHEN** an authorized author asks to add a tavern and an owner Character to the current city
- **THEN** the compiler produces a World structure candidate plus an exact Character Studio handoff or CharacterVersion binding candidate
- **AND** no location, actor or Character canon is committed until each owning service validates and accepts its own candidate

#### Scenario: Ordinary participant attempts an author-only transformation

- **WHEN** a participant without author authority asks to replace a WorldRule or GameplayDefinition
- **THEN** only that transformation is rejected with an authority diagnostic
- **AND** the participant's permitted ordinary World actions and the active Run remain available

### Requirement: Every change exposes a semantic diff and capability decision

A change candidate SHALL describe exact additions, removals and replacements against its bound base and SHALL list required action, owner, adapter, provider and presentation capabilities. Capability resolution SHALL use exact registered identities; an unresolved requirement MUST remain a visible `CapabilityGapDiagnostic` and MUST NOT select a wildcard/default handler, generate arbitrary executable code or reinterpret prose as success.

#### Scenario: Change a mystery into an unsupported alchemy mechanic

- **WHEN** a proposed Gameplay transformation requires an unregistered `simulate-alchemy-reaction` capability
- **THEN** the candidate remains reviewable but cannot become executable Gameplay
- **AND** valid presentation-only or World-state changes in the same authoring request may continue through their own owners

### Requirement: Current-state transformations commit through canonical events

A transformation that is fully expressible by already registered canonical World, Story or Gameplay actions MAY commit to the current branch only through that owner's typed intent, expected revision validation and committed event. The Transformation capability SHALL NOT write repositories directly or create a second event/state authority.

#### Scenario: Transform the current Scene into a rainy night

- **WHEN** an authorized request resolves to registered World fact actions for weather and time
- **THEN** World runtime validates and commits ordered WorldEvents on the exact branch and refreshes projections
- **AND** Web, engine and World Model profiles only render the committed result

#### Scenario: Transformation is based on stale state

- **WHEN** a change candidate targets an older World revision after the branch has advanced
- **THEN** commit rejects the candidate as stale and returns a fresh diff/rebase requirement
- **AND** it does not retry against the new state or commit a partial mutation

### Requirement: Cross-owner transformations retain independent review lifecycles

World structure, World Story/Quest, World Gameplay/Interaction, Character canon and Presentation changes SHALL be accepted by their canonical owners. A coordinating transformation MAY retain their exact candidate/result identities, but MUST NOT claim an atomic cross-owner success or copy one owner's facts into another owner.

#### Scenario: Add a quest for an existing Character

- **WHEN** a request proposes a World Story quest, a World interaction and a Character memory implication
- **THEN** Story and Interaction candidates can be accepted independently while the Character implication remains a Chara-owned review candidate
- **AND** unavailable Chara review does not roll back already committed World-owned facts or fabricate Character memory

### Requirement: Presentation changes preserve semantic identity

A presentation-only transformation MAY replace or configure an explicitly supported Presentation profile while preserving the exact ExperienceRun, WorldRun, Save, branch, participant and semantic revision. It MUST NOT emit WorldEvents or alter Story, Gameplay or Character facts merely because the visible representation changed.

#### Scenario: Switch from text to an illustrated Web profile

- **WHEN** both profiles are supported by the published Experience and the user explicitly selects the illustrated profile
- **THEN** Desktop rebinds presentation to the same authoritative projections without changing semantic state
- **AND** failure to initialize the target profile leaves the source profile selected with a visible diagnostic rather than silently choosing a third profile

### Requirement: Runtime changes can be explicitly promoted without rewriting history

An authorized author MAY promote accepted runtime structure/Story/Gameplay changes into new authoring candidates and publish new user-managed World or Experience versions. Promotion SHALL preserve source Run/Save/branch/event provenance, SHALL NOT mutate the immutable baseline or source Save, and SHALL require an explicit new Run/Save/branch binding before the new baseline is consumed.

#### Scenario: Publish a transformed branch as a reusable World version

- **WHEN** an author accepts the semantic changes accumulated on one branch and publishes them
- **THEN** the owning authoring services create new reviewable project changes and immutable versions with source provenance
- **AND** existing Runs remain pinned to their original baseline until a user explicitly creates or upgrades a separate binding
