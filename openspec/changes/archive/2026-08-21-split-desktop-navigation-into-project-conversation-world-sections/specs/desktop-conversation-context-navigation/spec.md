## ADDED Requirements

### Requirement: PrimarySidebar separates current Project and Assistant contexts

PrimarySidebar SHALL present two explicit current sections in the stable order `Projects` and `Conversations` while consuming the existing authoritative grouped Project/Conversation projection. The Projects section SHALL contain valid Project groups, their existing Workspace Conversation children, and unavailable Workspace context groups. The Conversations section SHALL contain only standalone Personal Assistant Conversations. A group or Conversation MUST NOT be duplicated across sections.

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
- **THEN** PrimarySidebar renders that group under Projects with its existing local diagnostic and disabled authority-dependent operations
- **AND** the unavailable Workspace context is not presented as a standalone Personal Assistant Conversation
- **AND** unrelated Project and Conversation entries remain usable

### Requirement: Navigation section counts have one meaning

The Projects section count SHALL equal the number of visible Project-context groups, including unavailable Workspace context groups. The Conversations section count SHALL equal the total Personal Assistant Conversation records. Project row counts SHALL continue to equal their exact child Workspace Conversation count. A future owner that has no current visible section SHALL NOT expose a UI count.

#### Scenario: Mixed navigation is counted

- **WHEN** two valid Project groups, one unavailable Workspace context group, and five Personal Assistant Conversations are visible
- **THEN** the section counts are Projects `3` and Conversations `5`
- **AND** the count does not represent a mixture of group kinds

### Requirement: Future owner classifications do not expose unsupported product surfaces

PrimarySidebar SHALL reserve Character, Room, and World as future owner classifications without rendering their sections until each corresponding package-owned projection and product runtime is implemented. The reservation MUST NOT create a generic registry, feature-flag path, placeholder DTO, fake record, empty heading, zero count, action, or route. Desktop MUST NOT infer a Character, Room, or World record from a Project profile, Workspace, Personal Assistant Conversation, current Scene, or local file.

#### Scenario: Current Project exists without future owner projections

- **WHEN** a current Project is visible and no Character, Room, or World owner projection exists
- **THEN** the Project remains under Projects and no World section is rendered
- **AND** Desktop does not reinterpret it as a Character, Room, World Experience, Run, Save, placeholder, route, or clickable entry

#### Scenario: Future Character and Room owners are not implemented

- **WHEN** the current product composition has no Character or Room runtime and no corresponding package-owned visible projection
- **THEN** PrimarySidebar renders no Character or Room section, row, count, action, or route
- **AND** Conversations continues to contain only Personal Assistant Conversations

#### Scenario: Future owner is implemented later

- **WHEN** a later change adds a package-owned Character, Room, or World projection and complete product runtime
- **THEN** that change explicitly extends the typed owner classification and composes its own visible section
- **AND** it does not reinterpret Project or Personal Assistant records as the new owner type
