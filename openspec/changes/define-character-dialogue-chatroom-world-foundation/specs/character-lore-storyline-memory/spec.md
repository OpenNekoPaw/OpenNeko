## ADDED Requirements

### Requirement: Character background story is a Chara-owned role fact

CharacterProject SHALL own an editable CharacterBackgroundStory covering the Character's origin, personal history, formative events and established relationships. Publication SHALL freeze the accepted background story into the exact CharacterVersion. The background story SHALL NOT be treated as an external event log, runtime transcript or save.

#### Scenario: Author publishes a Character background story

- **WHEN** an author reviews and publishes a CharacterProject containing accepted origin and formative-event material
- **THEN** the resulting CharacterVersion freezes that CharacterBackgroundStory with its reviewed source identities
- **AND** no CharacterRun, external runtime, event or save is created by publication

### Requirement: Character origin setting is lore rather than a runnable World

CharacterProject SHALL represent the Character's native era, culture, social environment, important places/organizations from the Character's perspective and believed background rules as CharacterOriginSetting. CharacterOriginSetting SHALL remain Character lore and SHALL NOT declare or create WorldProject, WorldVersion, WorldRun, WorldState, WorldSave, branch or replay authority.

#### Scenario: Character originates from a fictional kingdom

- **WHEN** the author records the kingdom, culture and historical conflict that shaped a Character
- **THEN** Chara stores them as the Character's reviewed OriginSetting and knowledge boundary
- **AND** the system does not register that lore as a runnable world or infer shared objective state from it

### Requirement: Character storyline has an independent personal-arc authority

Chara SHALL provide immutable user-managed CharacterStorylineVersion records for personal premise, desire, conflict, growth arc, stages, optional turning points and constraints. A CharacterStorylineRun SHALL bind one exact CharacterStorylineVersion and CharacterRun, and SHALL own only the accepted progress of that Character's personal arc.

#### Scenario: Character advances a personal arc

- **WHEN** an authorized observation candidate supports a turning point at the expected CharacterStorylineRun revision
- **THEN** the Chara storyline owner accepts or rejects that candidate and advances only the personal storyline on acceptance
- **AND** the operation does not claim or mutate any external storyline, event, state or save

#### Scenario: Character enters another content composition

- **WHEN** the same CharacterVersion is associated with a different external narrative composition
- **THEN** the user explicitly selects an applicable CharacterStorylineVersion and creates a distinct CharacterStorylineRun
- **AND** Chara does not reinterpret progress from another storyline run or select the latest storyline implicitly

### Requirement: Character memory is independent from external saves

Chara SHALL own CharacterMemoryScope, CharacterMemoryCandidate and CharacterMemoryEntry records for a Character's subjective experiences, feelings, relationship changes, recollections and personal knowledge changes. External events, transcripts and activity results MAY be stable evidence refs for candidates, but SHALL NOT become accepted Character memory without a Chara-owned review operation.

#### Scenario: External event suggests a Character memory

- **WHEN** an external composition reports that a Character observed a significant event
- **THEN** Chara creates a sourced CharacterMemoryCandidate under the exact CharacterRun/MemoryScope identity
- **AND** accepting, correcting or deleting that memory changes only Chara-owned memory records

#### Scenario: External save is restored or deleted

- **WHEN** an associated external save is restored, branched or deleted
- **THEN** CharacterMemoryScope remains an independently addressable Chara record with its original source diagnostics
- **AND** Chara neither reconstructs memory from the save nor deletes memory as a side effect of the external operation

### Requirement: Character and relationship memory remain distinct

CharacterMemoryScope SHALL represent Character-subjective runtime memory, while UserCharacterRelationship SHALL represent user-to-Character companion memory such as preferences, boundaries, agreements and relationship milestones. A shared CharacterVersion, transcript or semantic similarity SHALL NOT merge these scopes.

#### Scenario: Companion interaction produces two possible memories

- **WHEN** one event affects both the Character's subjective experience and the user's relationship with the Character
- **THEN** Chara creates separately sourced candidates under CharacterMemoryScope and UserCharacterRelationship
- **AND** each owner independently accepts, corrects, rejects or deletes its candidate

### Requirement: External composition uses exact Chara refs without copied authority

Chara SHALL expose exact CharacterVersion, CharacterStorylineVersion/Run, CharacterMemoryScope and CharacterRun refs for use by an external Composition owner. Chara SHALL NOT define the external storyline/save/runtime aggregate, copy its records or infer a binding from active, recent or latest state.

#### Scenario: External composition provider is absent

- **WHEN** a caller requests a composed narrative launch before the owning Composition contract is available
- **THEN** Chara returns an external-composition-unavailable diagnostic and creates no partial CharacterRun, storyline run or memory scope
- **AND** standalone Character authoring, companion interaction and existing Chara records remain available
