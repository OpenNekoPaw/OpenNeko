# desktop-sidebar-project-management Specification

## Purpose
TBD - created by archiving change manage-sidebar-project-conversations. Update Purpose after archive.
## Requirements
### Requirement: Sidebar groups conversations by owning context

The Desktop primary sidebar SHALL render each Project, unavailable Workspace, personal Assistant, Character, and Room context as one explicit group whose conversation children can be collapsed and expanded independently from the active Scene.

#### Scenario: User collapses a Project group

- **WHEN** the user activates the collapse control for an expanded Project group
- **THEN** that group's conversation rows are not rendered while its Project header and conversation count remain visible
- **AND** other groups and background Agent runtimes remain unchanged

#### Scenario: Expanded group exceeds the initial budget

- **WHEN** an expanded group contains more than the bounded initial conversation count
- **THEN** the sidebar initially renders only the most recently updated bounded subset
- **AND** the user can explicitly show all conversations without changing another group's state

### Requirement: Project group exposes project-scoped actions

Each available Project group SHALL expose distinct controls to open the Project, create or focus its new-conversation draft, and delete the Project registration together with its authoritative conversation group.

#### Scenario: User opens a Project

- **WHEN** the user activates the Project name or open action
- **THEN** Desktop transitions to that exact Project Workspace through the canonical Scene transition
- **AND** it does not substitute the active or most recent Project

#### Scenario: User creates a conversation for a Project

- **WHEN** the user activates the new-conversation action for an available Project
- **THEN** Desktop opens that exact Project's canonical Workspace draft
- **AND** a persisted conversation identity is created only by the existing first-submit lifecycle

#### Scenario: User deletes a Project group

- **WHEN** the user confirms deletion from the Project group
- **THEN** Desktop invokes the same package-owned batch Project deletion contract used by the Project catalog
- **AND** the group and its deleted conversations disappear from the next authoritative sidebar projection
- **AND** Project files are not deleted

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
