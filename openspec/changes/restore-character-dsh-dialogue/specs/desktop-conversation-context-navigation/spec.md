## ADDED Requirements

### Requirement: Character handoff survives until Agent Entry adopts it

Development SHALL carry an exact CharacterVersion handoff from Character detail into the current Agent Entry draft and consume
the handoff only after the Agent Webview adopts it as visible draft selection.

#### Scenario: Character detail starts a conversation

- **WHEN** the user invokes Start Conversation for an available exact CharacterVersion
- **THEN** Desktop SHALL open Agent Entry with that version visibly selected
- **AND** submitting SHALL produce a Character Dialogue creation target rather than a surface Assistant target

#### Scenario: Agent Entry cannot adopt the handoff

- **WHEN** the target draft or experimental Character contribution is unavailable
- **THEN** Desktop SHALL keep or reject the handoff with an explicit diagnostic
- **AND** it SHALL NOT silently clear the selection or attach it to another draft
