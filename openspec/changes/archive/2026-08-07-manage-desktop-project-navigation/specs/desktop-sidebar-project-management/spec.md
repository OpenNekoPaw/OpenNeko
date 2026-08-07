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

#### Scenario: Row action replaces its trailing status marker

- **WHEN** a Project, unavailable Workspace or Conversation row reveals its hover/focus action layer
- **THEN** the row's unavailable or execution status icon is visually hidden while the action is visible
- **AND** leaving the row restores the status icon without changing row width or identity

### Requirement: Unavailable Workspace groups remain explicitly manageable

An unavailable Workspace conversation group SHALL expose an icon-only group cleanup action and a shared context-menu cleanup action. Cleanup SHALL submit the exact non-empty set of owner-qualified Conversation identities through the canonical Conversation deletion command. The group MUST NOT expose Project open, Project creation or Project removal actions because it has no Project catalog identity.

#### Scenario: User manages an unavailable Workspace group

- **WHEN** the user hovers, keyboard-focuses or opens the context menu for an unavailable Workspace group
- **THEN** the group exposes deletion of all conversations currently projected in that exact Workspace group
- **AND** the unavailable diagnostic remains available through Tooltip and assistive technology

#### Scenario: User confirms unavailable Workspace cleanup

- **WHEN** the user confirms deletion for an unavailable Workspace group containing multiple conversations
- **THEN** Desktop validates every submitted Conversation identity before deleting any of them
- **AND** all identities are sent through one sender-bound typed command and the Shell is projected once after deletion

#### Scenario: Old singular deletion payload is received

- **WHEN** a caller submits the former single `navigation` object instead of the required non-empty `navigations` array
- **THEN** strict contract decoding rejects the request
- **AND** no compatibility parser, fallback or deletion runs

### Requirement: Sidebar retains recent Project context without Conversations

The Desktop PrimarySidebar SHALL retain a Project group when that exact Project owns a current Conversation or belongs to the Host-projected recent Project context. Clearing the final Conversation SHALL NOT remove a recent Project group. A Project that exists only in the complete Project catalog and has neither a current Conversation nor a recent context identity MUST remain absent from the sidebar. Renderer MUST consume the exact grouped navigation projection without inferring recent identity from active tabs, catalog order or mounted Roots.

#### Scenario: Recent Project has no Conversations

- **WHEN** a Project belongs to the Host-projected recent Project context and Agent Home contains no Conversation grouped under it
- **THEN** grouped navigation includes that exact Project with `conversations: []`
- **AND** the sidebar shows its Project entry and zero Conversation count without an expand or collapse control
- **AND** opening the Project and creating its first Conversation remain available while Conversation cleanup is disabled

#### Scenario: Catalog-only Project has no Conversations

- **WHEN** the complete Project catalog contains a Project that has no Conversation and is absent from the recent Project context
- **THEN** Project Management continues to show that Project
- **AND** grouped sidebar navigation does not mirror it

#### Scenario: User deletes every Project Conversation

- **WHEN** the canonical Project conversation cleanup completes and the Project remains in the recent Project context
- **THEN** the refreshed sidebar retains the Project group with no Conversation rows
- **AND** neither Project registration nor the current Project Scene is removed as a side effect

#### Scenario: Empty recent Project is unavailable

- **WHEN** a recent Project catalog record is unavailable and has no Conversations
- **THEN** the sidebar retains its Project group with the exact diagnostic
- **AND** opening remains disabled while explicit Project management and removal remain available

#### Scenario: Project is explicitly removed

- **WHEN** the user removes a recent Project from the canonical Project catalog
- **THEN** its Project group is absent from the next grouped navigation projection
- **AND** any retained Workspace Conversations remain isolated in the existing unavailable Workspace group rather than being deleted or projected as that Project

## MODIFIED Requirements

### Requirement: Sidebar groups conversations by owning context

The Desktop primary sidebar SHALL render each Project that owns a current Conversation or belongs to the Host-projected recent Project context, plus each unavailable Workspace, personal Assistant, Character and Room context that contains at least one Conversation, as one explicit group. Groups with Conversation children can be collapsed and expanded independently from the active Scene. The sidebar MUST NOT mirror catalog-only Projects that have neither a Conversation nor a recent context identity.

#### Scenario: User collapses a Project group

- **WHEN** the user activates the collapse control for an expanded Project group
- **THEN** that group's conversation rows are not rendered while its Project header and conversation count remain visible
- **AND** other groups and background Agent runtimes remain unchanged

#### Scenario: Expanded group exceeds the initial budget

- **WHEN** an expanded group contains more than the bounded initial conversation count
- **THEN** the sidebar initially renders only the most recently updated bounded subset
- **AND** the user can explicitly show all conversations without changing another group's state

#### Scenario: Recent Project has no conversations

- **WHEN** a recent Project context has no grouped Conversation
- **THEN** PrimarySidebar renders that exact Project group with zero children
- **AND** a catalog-only Project with no Conversation remains absent from the sidebar and available in Project Management
