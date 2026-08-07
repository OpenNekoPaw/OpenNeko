## ADDED Requirements

### Requirement: PrimarySidebar separates Projects, Conversations, and World

PrimarySidebar SHALL present three explicit sections in the stable order `Projects`, `Conversations`, and `World` while consuming the existing authoritative grouped Project/Conversation projection. The Projects section SHALL contain only Project groups and their existing Conversation children. The Conversations section SHALL contain standalone Assistant, Character, Room, and unavailable Workspace groups. A group or Conversation MUST NOT be duplicated across sections.

#### Scenario: Project and Assistant conversations are both present

- **WHEN** the authoritative projection contains one Project group with Workspace Conversation children and one standalone Assistant group
- **THEN** PrimarySidebar renders the Project group under Projects and the Assistant group under Conversations
- **AND** every Conversation appears exactly once with its existing owner identity and lifecycle operations

#### Scenario: Project has no conversations

- **WHEN** a recent Project group has no Conversation children
- **THEN** it remains under Projects with its exact zero child count
- **AND** no empty Conversation or Conversation-section entry is fabricated

#### Scenario: Workspace conversation has no valid Project

- **WHEN** Host projects an unavailable Workspace group because its Project identity cannot be resolved
- **THEN** PrimarySidebar renders that group under Conversations with its existing diagnostic and disabled navigation
- **AND** unrelated Project, Conversation, and World sections remain usable

### Requirement: Navigation section counts have one meaning

The Projects section count SHALL equal the number of visible Project groups. The Conversations section count SHALL equal the total Conversation records in standalone owner groups. Project row counts SHALL continue to equal their exact child Conversation count. The World section count SHALL equal records supplied by the World owner.

#### Scenario: Mixed navigation is counted

- **WHEN** two Project groups and standalone owner groups containing five total Conversations are visible and no World projection exists
- **THEN** the section counts are Projects `2`, Conversations `5`, and World `0`
- **AND** the count does not represent a mixture of group kinds

### Requirement: Empty World classification does not fabricate authority

Until a package-owned World Library projection is composed, PrimarySidebar SHALL render the World section with count `0` and no World row or action. Desktop MUST NOT infer a World record from a Project profile, Workspace, Character, Room, Assistant, Agent Conversation, current Scene, or local file.

#### Scenario: World authoring Project exists without World Library

- **WHEN** a visible Project has the `world` Project profile but no World owner projection exists
- **THEN** the Project remains under Projects and World remains empty
- **AND** Desktop does not create a World Experience, Run, Save, placeholder, route, or clickable entry

#### Scenario: Character or Room conversation exists without World Library

- **WHEN** standalone Character or Room Conversations are projected
- **THEN** they remain under Conversations and World remains empty
- **AND** their presence does not imply a World runtime or World record
