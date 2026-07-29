## ADDED Requirements

### Requirement: Recent Projects can be forgotten without deleting workspace content
The Desktop Shell SHALL provide a persisted Project catalog removal operation that removes the selected Project from recent navigation without deleting or modifying its workspace content.

#### Scenario: Remove a closed recent Project
- **WHEN** the user invokes “Remove from recent” for a Project with no open tab
- **THEN** the Shell SHALL remove that Project from the persisted catalog and authoritative sidebar projection
- **AND** the Shell SHALL NOT invoke workspace file deletion

#### Scenario: Remove an open recent Project
- **WHEN** the user invokes “Remove from recent” for a Project that has open tabs
- **THEN** the Shell SHALL remove the catalog entry and every Window tab for that Project in one persisted transition
- **AND** each Window whose active tab was removed SHALL activate Home

#### Scenario: Reject stale Project cleanup
- **WHEN** the request endpoint, Window revision, catalog revision, or Project identity is stale or unknown
- **THEN** the Shell SHALL reject the operation visibly
- **AND** it SHALL NOT remove a different Project or fall back to the active Project

### Requirement: Agent Home conversations can be deleted through their owning authority
The Desktop SHALL provide an Agent Home conversation deletion operation that validates the stable Project, workspace, and conversation identity and delegates deletion to the owning Desktop Agent workspace authority.

#### Scenario: Delete a recent Agent conversation
- **WHEN** the user confirms deletion of a projected Agent Home conversation
- **THEN** Desktop SHALL delete that conversation through the owning Agent authority
- **AND** the resulting authoritative Agent Home projection SHALL no longer contain the conversation

#### Scenario: Cancel conversation deletion
- **WHEN** the user declines the destructive confirmation
- **THEN** Desktop SHALL NOT invoke the Agent authority deletion operation
- **AND** the conversation SHALL remain visible

#### Scenario: Reject stale conversation cleanup
- **WHEN** the Agent Home revision or any stable navigation identity does not match the current projection
- **THEN** Desktop SHALL reject the operation visibly
- **AND** it SHALL NOT delete another conversation or use an active-conversation fallback

#### Scenario: Preserve a conversation when authority deletion fails
- **WHEN** the owning Agent authority rejects conversation deletion
- **THEN** Desktop SHALL surface the failure
- **AND** it SHALL keep the conversation in the authoritative Home projection

### Requirement: Sidebar cleanup actions are distinguishable and accessible
The Desktop primary sidebar SHALL expose separate localized, keyboard-accessible actions for Project catalog removal and Agent conversation deletion.

#### Scenario: Project and conversation action labels
- **WHEN** assistive technology inspects a recent Project row and an Agent conversation row
- **THEN** the Project action SHALL be announced as removing the Project from recent items
- **AND** the conversation action SHALL be announced as deleting persisted conversation data

#### Scenario: Cleanup action does not navigate
- **WHEN** the user activates a cleanup action inside a recent-item row
- **THEN** Desktop SHALL invoke only that cleanup operation
- **AND** it SHALL NOT open the Project or conversation as a side effect
