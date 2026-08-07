# desktop-sidebar-project-management Specification

## Purpose
TBD - created by archiving change manage-sidebar-project-conversations. Update Purpose after archive.
## Requirements
### Requirement: Sidebar groups conversations by owning context

The Desktop primary sidebar SHALL render each Project, unavailable Workspace, personal Assistant, Character and Room context that contains at least one conversation as one explicit group whose conversation children can be collapsed and expanded independently from the active Scene. It SHALL NOT mirror Project catalog records that have no conversations.

#### Scenario: User collapses a Project group

- **WHEN** the user activates the collapse control for an expanded Project group
- **THEN** that group's conversation rows are not rendered while its Project header and conversation count remain visible
- **AND** other groups and background Agent runtimes remain unchanged

#### Scenario: Expanded group exceeds the initial budget

- **WHEN** an expanded group contains more than the bounded initial conversation count
- **THEN** the sidebar initially renders only the most recently updated bounded subset
- **AND** the user can explicitly show all conversations without changing another group's state

#### Scenario: Project has no conversations

- **WHEN** a Project catalog record has no grouped conversation
- **THEN** PrimarySidebar does not render that Project group
- **AND** the Project remains available in the complete Project catalog

### Requirement: Project group exposes project-scoped actions

Each available Project group SHALL expose distinct controls to open the Project, create or focus its new-conversation draft, remove the Project registration while preserving conversations, and explicitly delete exact Workspace-owned Project conversations while preserving the Project.

#### Scenario: User opens a Project

- **WHEN** the user activates the Project name or open action
- **THEN** Desktop transitions to that exact Project Workspace through the canonical Scene transition
- **AND** it does not substitute the active or most recent Project

#### Scenario: User creates a conversation for a Project

- **WHEN** the user activates the new-conversation action for an available Project
- **THEN** Desktop opens that exact Project's canonical Workspace draft
- **AND** a persisted conversation identity is created only by the existing first-submit lifecycle

#### Scenario: User removes a Project group

- **WHEN** the user confirms Project removal from the group
- **THEN** Desktop invokes the same package-owned batch Project removal contract used by the Project catalog
- **AND** the Project registration disappears while its conversations remain under an unavailable Workspace group
- **AND** Project files are not deleted

#### Scenario: User deletes Project conversations

- **WHEN** the user confirms Project conversation cleanup from the group
- **THEN** Desktop invokes the package-owned Project conversation cleanup contract
- **AND** only exact Workspace-owned conversations disappear while the Project remains registered

### Requirement: Unavailable diagnostics use the item trailing edge

The Desktop primary sidebar SHALL render Project, unavailable Workspace group, and Conversation unavailable status in one consistent trailing item position while preserving the complete owner diagnostic for accessible inspection.

#### Scenario: Unavailable Workspace group is displayed

- **WHEN** retained conversations belong to a Workspace that is absent from the Project catalog
- **THEN** the group header displays the localized unavailable status at its trailing edge
- **AND** it does not render a separate raw `workspaceId` diagnostic row below the header

#### Scenario: Unavailable Project or Conversation is displayed

- **WHEN** a Project or Conversation has an item-local unavailable diagnostic
- **THEN** the localized unavailable status appears in the same trailing track used by other sidebar items
- **AND** the full diagnostic remains available through its accessible label and tooltip

### Requirement: Unavailable groups remain locally manageable

Unavailable Workspace groups and Conversations SHALL remain visible and collapsible, their open actions SHALL remain disabled, and their exact cleanup actions SHALL remain available.

#### Scenario: User manages an unavailable Workspace group

- **WHEN** a Workspace group has no Project catalog owner
- **THEN** the user can collapse or expand the group and delete its individual conversations
- **AND** the user cannot open the unavailable Workspace or create a conversation for it

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
