## ADDED Requirements

### Requirement: Release does not restore hidden creative conversations

Release MUST reject Character, Room and World conversation restore at the Host Scene boundary while preserving their durable
conversation and transcript records. Development MUST continue to restore those conversations by exact owner identity.

#### Scenario: Release receives a Character or Room restore intent

- **WHEN** the caller requests restore for an exact Character or Room conversation in Release
- **THEN** Host SHALL return an owner-qualified unavailable result
- **AND** it SHALL NOT attach the conversation to an Assistant or Workspace Scene
- **AND** the conversation, transcript and protected runtime SHALL remain unchanged

#### Scenario: Development restores the same conversation

- **WHEN** the caller requests restore for an exact Character or Room conversation in Development
- **THEN** Host SHALL use the existing exact Character interaction composition
- **AND** no active, recent or Assistant fallback SHALL participate
