## ADDED Requirements

### Requirement: Project catalog opens an available Project directly

The Project catalog SHALL treat ordinary activation of an available Project entry as a request to open that exact Project Workspace and SHALL NOT create a page-local selection, batch toolbar, detail surface, or alternate double-click path.

#### Scenario: User clicks an available Project

- **WHEN** the user single-clicks an available Project entry
- **THEN** Desktop sends the canonical scene intent for that exact Project identity
- **AND** no selection toolbar is inserted before navigation completes

#### Scenario: User activates a Project from the keyboard

- **WHEN** keyboard focus is on an available Project entry and the user activates its native button
- **THEN** Desktop sends the same exact Project scene intent as pointer activation

#### Scenario: Project is unavailable

- **WHEN** a Project entry has a local unavailable diagnostic
- **THEN** its open control remains disabled and its diagnostic remains visible
- **AND** its exact Project management actions remain independently reachable

### Requirement: Project catalog defaults to a stable responsive grid

Each fresh Project catalog mount SHALL render populated results in grid mode and SHALL offer explicit, accessible grid and list controls without changing Project identity, ordering, filtering, or management semantics.

#### Scenario: Project catalog opens with populated results

- **WHEN** the Project Management scene mounts with one or more Projects
- **THEN** the collection reports grid mode and lays out responsive Project cards without overlap or clipping

#### Scenario: User switches to list mode

- **WHEN** the user activates the list view control
- **THEN** the same filtered and sorted Projects render in list mode
- **AND** no Project is opened, selected, removed, or otherwise mutated

#### Scenario: Compact Project Management panel

- **WHEN** the catalog renders in the supported compact Workbench panel
- **THEN** the grid resolves to one stable column and every Project action remains reachable

### Requirement: Project item management preserves distinct data lifecycles

Each Project item SHALL expose Project registration removal separately from exact Workspace Conversation cleanup. Both actions MUST remain scoped to the item identity and MUST preserve the Project directory, files, media, and generated artifacts.

#### Scenario: User removes a Project registration

- **WHEN** the user confirms the Project item's removal action
- **THEN** Desktop submits that exact identity through the canonical Project removal contract
- **AND** its Conversations and local Project files remain preserved

#### Scenario: User deletes Project Conversations

- **WHEN** the Project owns one or more exact Workspace Conversations and the user confirms cleanup
- **THEN** Desktop submits that exact Project identity through the canonical Project Conversation cleanup contract
- **AND** its Project registration and local files remain preserved

#### Scenario: Project has no Workspace Conversations

- **WHEN** a Project item owns no exact Workspace Conversations
- **THEN** its Conversation cleanup action is disabled or omitted
- **AND** its Project removal action remains available
