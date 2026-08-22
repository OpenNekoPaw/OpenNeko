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
