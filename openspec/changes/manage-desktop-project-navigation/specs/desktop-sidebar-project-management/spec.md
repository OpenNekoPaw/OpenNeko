## ADDED Requirements

### Requirement: Sidebar entries expose contextual management menus

The Desktop PrimarySidebar SHALL expose a shared context menu from each Project group header and Conversation row. Menu actions SHALL delegate to the same exact Project, Conversation and Scene commands as the visible controls, and SHALL NOT introduce a second command path or infer an active identity.

#### Scenario: User opens a Project context menu

- **WHEN** the user opens the context menu for an available Project group
- **THEN** the menu offers opening that Project, opening its new-conversation draft, entering Project management, deleting its exact Workspace conversations when present, and removing the Project registration
- **AND** every action uses the selected Project identity rather than the active or recent Project

#### Scenario: User opens a Conversation context menu

- **WHEN** the user opens the context menu for a Conversation row
- **THEN** the menu offers restoring and deleting that exact owner-qualified Conversation
- **AND** deleting still uses the existing confirmation and canonical conversation lifecycle command

#### Scenario: Context menu belongs to an unavailable item

- **WHEN** a Project or Conversation has an unavailable diagnostic
- **THEN** its context menu disables the open action while retaining the explicit remove or delete action
- **AND** no unavailable navigation request reaches Host as a successful operation

#### Scenario: User enters Project management from a Project group

- **WHEN** the user selects Project management from a Project context menu
- **THEN** Desktop opens the canonical Project Management Scene
- **AND** the Project catalog's existing individual and batch operations remain the only management commands

### Requirement: Sidebar displays current Conversation execution attention

Each available Conversation row in the Desktop PrimarySidebar SHALL display a localized icon-only trailing status for `running`, `needs-input` and `needs-review` attention from that exact Conversation's authoritative Agent Home projection. The icon SHALL retain its complete localized accessible name and Tooltip without rendering duplicate inline status text. Renderer MUST NOT derive execution state from the active Scene, message text, another Conversation or a retained React Root.

#### Scenario: Background Conversation is running

- **WHEN** a non-active Conversation projects `attention: running`
- **THEN** its row displays the localized running icon at the trailing edge without inline status text
- **AND** switching Scenes or unmounting its Agent UI is not required for the status to remain visible

#### Scenario: Conversation needs user handling

- **WHEN** a Conversation projects `needs-input` or `needs-review`
- **THEN** its row displays the corresponding attention icon with a localized accessible name and Tooltip
- **AND** another Conversation's status remains independent

#### Scenario: Conversation has no current attention

- **WHEN** a Conversation projects `attention: none`
- **THEN** its row does not invent an idle, completed or running status from historical activity
- **AND** its normal open and context-menu behavior remains available

#### Scenario: Unavailable Conversation retains a former attention value

- **WHEN** an unavailable Conversation also carries a non-none attention value
- **THEN** the row shows only the unavailable warning icon instead of an actionable execution status or inline diagnostic text
- **AND** open remains disabled while explicit deletion remains available

### Requirement: Sidebar row actions remain available without permanent chrome

Project group headers SHALL expose their existing new-Conversation, Conversation cleanup and removal actions, and Conversation rows SHALL expose their existing deletion action, only while the owning row is hovered or contains keyboard focus. Hiding the row actions MUST NOT remove them from keyboard navigation, shift the row layout, or replace the shared context menu path.

#### Scenario: User hovers a Project group

- **WHEN** the pointer enters an available or unavailable registered Project group header
- **THEN** the exact Project's applicable actions become visible at the trailing edge
- **AND** leaving the row hides those actions without changing Project selection, count, status or layout

#### Scenario: User reaches an action by keyboard

- **WHEN** keyboard focus enters a Project or Conversation row action
- **THEN** the action layer becomes visible and the focused control retains its accessible name and focus indication
- **AND** activating it delegates to the same canonical command as before

#### Scenario: Row is not being operated

- **WHEN** a Project or Conversation row is neither hovered nor focus-within
- **THEN** destructive row buttons are not visually displayed
- **AND** unavailable and execution markers use icon-only presentation with diagnostic details available on hover or assistive technology
