# interactive-world-story Specification

## Purpose
TBD - created by archiving change define-ai-native-interactive-world. Update Purpose after archive.
## Requirements
### Requirement: World Story has an independent authoring and runtime lifecycle

The World Story capability SHALL own `WorldStoryProject -> WorldStoryVersion -> WorldStoryRun`. WorldStoryVersion SHALL contain world-level premise, conflicts, chapters, possible beats, triggers, clues, escalation, endings and constraints, while WorldStoryRun SHALL contain only the progress of one exact runtime experience. Neither record SHALL own WorldState or Character Story progress.

#### Scenario: Preserve an untriggered World Story beat

- **WHEN** a WorldStoryVersion contains a possible beat whose trigger has not been accepted in a WorldStoryRun
- **THEN** the beat remains an authoring opportunity and neither World history nor Story progress reports it as completed

#### Scenario: Pause World Story without stopping the World

- **WHEN** a WorldStoryRun is paused while its bound WorldRun remains valid
- **THEN** World facts and permitted non-Story interaction remain available while new World Story progress is paused visibly

### Requirement: Character Story and World Story remain separate authorities

Chara SHALL own `CharacterStorylineVersion -> CharacterStorylineRun` for character-centred goals, personal conflict, growth and relationship milestones. World Story SHALL own world-level conflict, chapter and outcome progress. A WorldExperience MAY associate their exact immutable versions and runtime identities, but MUST NOT store one shared mutable progress record or let either owner mutate the other directly.

#### Scenario: One event affects both stories

- **WHEN** a committed WorldEvent satisfies a World Story beat and creates a possible Character growth milestone
- **THEN** World Story and Chara receive separate typed progress candidates and independently accept or reject them into their exact WorldStoryRun and CharacterStorylineRun
- **AND** rejection or temporary unavailability of one owner does not fabricate progress or roll back the other owner's already committed fact

### Requirement: One Character can experience different World Stories

The same immutable CharacterVersion MAY participate in multiple WorldStoryVersions and WorldExperienceRuns. Each participation SHALL bind a distinct CharacterStorylineRun by default, and knowledge, relationships, injuries, quests, memories and progress from one World SHALL NOT appear in another through CharacterVersion, active/recent identity or implicit memory merge.

#### Scenario: Character enters an unrelated second World

- **WHEN** a CharacterVersion already has a CharacterStorylineRun in World A and starts an Experience in World B
- **THEN** Chara creates or selects an explicit CharacterStorylineRun for World B and World B receives no World A progress unless a separate authorized transition has accepted it

### Requirement: Cross-World continuity is explicit and reviewable

Continuing a Character Story across Worlds SHALL require a Chara-owned journey or transition operation that identifies exact source and target CharacterStorylineRun identities, presents transferable candidates for review and records accepted results without mutating either immutable StorylineVersion/WorldStoryVersion or importing World-owned facts as Character canon.

#### Scenario: Carry a relationship lesson into a sequel World

- **WHEN** a user requests continuity from a completed CharacterStorylineRun into a sequel Experience
- **THEN** Chara presents sourced Character Story candidates and creates target-run progress only for explicitly accepted items
- **AND** source World inventory, location, secret facts and branch state remain under the source World authority

### Requirement: Story progress follows committed facts rather than model narration

World Director, Character Agent and Narrator MAY propose Story opportunities or progress candidates, but WorldStoryRun and CharacterStorylineRun SHALL advance only from authorized committed source events and their owning validation policies. Model text, planned beats and presentation output MUST NOT directly mark progress complete.

#### Scenario: Narrator announces an uncommitted victory

- **WHEN** narration claims that the central conflict has ended but no validating WorldEvent or GameResult was committed
- **THEN** the narration remains presentation evidence and both WorldStoryRun and CharacterStorylineRun remain unchanged
