# character-authoring-publication Specification

## Purpose
TBD - created by archiving change define-character-dialogue-chatroom-world-foundation. Update Purpose after archive.
## Requirements
### Requirement: CharacterProject is the mutable authoring authority

The system SHALL represent editable character canon, CharacterBackgroundStory, CharacterOriginSetting, knowledge boundaries, evidence, candidate facts, representation/voice references, tests and review state in a Chara-owned CharacterProject. Agent transcripts, external runtime records, search indexes and UI state SHALL NOT become CharacterProject facts without an explicit reviewed authoring operation.

#### Scenario: Suggested fact is reviewed

- **WHEN** project evidence or an Agent evaluation proposes a character fact
- **THEN** the proposal remains a sourced candidate until the CharacterProject owner accepts or rejects it
- **AND** the candidate does not mutate an existing CharacterVersion or confirmed Entity fact

### Requirement: Publication creates an immutable user-managed CharacterVersion

Publishing a valid CharacterProject SHALL create a new immutable CharacterVersion identity containing the accepted background story, origin setting, canon, knowledge boundary, behavior/expression policy and stable representation/voice refs. Updating the draft SHALL NOT change a previously published CharacterVersion.

#### Scenario: Draft changes after publication

- **WHEN** the user edits a CharacterProject after publishing a CharacterVersion
- **THEN** existing CharacterRuns continue to resolve the exact published CharacterVersion
- **AND** the new draft content becomes available to formal runs only after the user publishes and explicitly selects another CharacterVersion

### Requirement: Authoring tests remain separate from formal runs

Dialogue and Embody authoring tests MAY use an identified snapshot of the current CharacterProject, but that snapshot SHALL NOT be registered as a published CharacterVersion, accepted relationship memory or narrative actor binding.

#### Scenario: Draft character is tested

- **WHEN** the user starts a Dialogue or Embody test from an unpublished CharacterProject
- **THEN** the resulting artifact records the exact authoring-test snapshot and source project identity
- **AND** it cannot be opened as a companion or narrative CharacterRun

### Requirement: Character records fail locally

Invalid CharacterProject, CharacterVersion, evidence or representation records SHALL remain visible with an exact diagnostic and SHALL disable only operations that require the invalid record. The system SHALL NOT invent default canon, hide the record or make sibling Characters unavailable.

#### Scenario: One CharacterVersion references invalid authoritative data

- **WHEN** the catalog loads one invalid CharacterVersion beside valid CharacterVersions
- **THEN** the invalid version remains visible with its diagnostic and cannot start a formal run
- **AND** valid Characters, versions, Rooms and Workspaces remain usable

### Requirement: Character authoring owns role lore and presentation references, not external composition data

CharacterProject and published CharacterVersion SHALL own accepted background story, origin setting, canon, knowledge boundaries, behavior/expression policy, voice identity/defaults and stable portrait/avatar references. Image, model and audio bytes SHALL remain under their Assets/Content/Media/Voice owner. Character authoring SHALL NOT create, edit, copy or delete an external composition, runnable world, external storyline, state, save or branch.

#### Scenario: Author links a Character to presentation resources

- **WHEN** an author selects a portrait, VRM model and voice identity for a Character
- **THEN** Character authoring records only the stable Character-owned presentation/voice references
- **AND** the underlying assets and every external composition/runtime record remain unchanged

#### Scenario: Author describes a Character's native world

- **WHEN** an author writes the era, culture and social environment from which a Character originates
- **THEN** Character authoring stores that material as CharacterOriginSetting in the Character draft/version
- **AND** it does not create or modify any runnable world, external storyline or save
