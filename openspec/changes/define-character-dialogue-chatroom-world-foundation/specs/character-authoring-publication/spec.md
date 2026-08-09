## ADDED Requirements

### Requirement: CharacterProject is the mutable authoring authority

The system SHALL represent editable character canon, evidence, candidate facts, representation references, tests and review state in a Chara-owned CharacterProject. Agent transcripts, Entity projections, search indexes and UI state SHALL NOT become CharacterProject facts without an explicit reviewed authoring operation.

#### Scenario: Suggested fact is reviewed

- **WHEN** project evidence or an Agent evaluation proposes a character fact
- **THEN** the proposal remains a sourced candidate until the CharacterProject owner accepts or rejects it
- **AND** the candidate does not mutate an existing CharacterVersion or confirmed Entity fact

### Requirement: Publication creates an immutable user-managed CharacterVersion

Publishing a valid CharacterProject SHALL create a new immutable CharacterVersion identity containing the accepted canon, knowledge boundary, behavior/expression policy and stable representation refs. Updating the draft SHALL NOT change a previously published CharacterVersion.

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
