## ADDED Requirements

### Requirement: Sidebar icons distinguish owning contexts from Conversations

The Desktop primary sidebar SHALL render a stable outline identity icon for every Project, unavailable Workspace, personal Assistant, Character and Room group, SHALL use semantically distinct icons for different available owner kinds, and SHALL render every child Conversation with one shared message icon that is distinct from its parent identity. Icon presentation SHALL preserve the existing row geometry, unavailable diagnostic position and navigation behavior without adding a selected-edge highlight.

#### Scenario: Available owner groups are scanned by identity

- **WHEN** the sidebar renders Project, personal Assistant, Character or Room Conversation groups
- **THEN** the Project uses a folder identity and each standalone owner kind uses its own assistant, person or group identity
- **AND** the icons remain aligned and legible in regular, compact and dark-theme layouts

#### Scenario: Unavailable Workspace remains recognizable

- **WHEN** retained Conversations belong to an unavailable Workspace
- **THEN** its group uses the directory-backed folder identity
- **AND** availability is still communicated by the existing trailing unavailable diagnostic rather than a replacement icon or hidden group

#### Scenario: Conversation rows remain visually subordinate

- **WHEN** a group renders one or more child Conversations
- **THEN** every child row uses the shared message icon instead of its parent owner icon or the storyline icon
- **AND** collapse, open, delete, attention and unavailable behavior remain unchanged
