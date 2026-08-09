## ADDED Requirements

### Requirement: Home modes are Window Scene navigation

Desktop SHALL expose Assistant, Workspace, Character, and World in a top-centered segmented selector
on entry and management Scenes. The selected mode SHALL be projected only from the current
authoritative Window Scene. The system MUST NOT persist a parallel experience mode in Agent Draft,
presentation snapshot, global store, or durable record.

#### Scenario: Fresh entry selects Assistant

- **WHEN** a Window opens the canonical Agent Entry Scene
- **THEN** the top selector projects Assistant as selected
- **AND** no separate mode state is restored or created

#### Scenario: Reopening an entry derives selection from Scene

- **WHEN** the visible Scene is Project Management or Character Management
- **THEN** the selector projects Workspace or Character respectively
- **AND** Agent Webview snapshot state cannot override that selection

#### Scenario: Business Scene does not masquerade as an entry tab

- **WHEN** a Conversation, Project Workspace, or Character Interaction Scene is visible
- **THEN** the entry selector is not rendered over that business Scene
- **AND** the current business Root and runtime identity remain owned by their domain

### Requirement: Navigation uses one typed Scene path

Assistant, Workspace, and Character mode clicks SHALL emit the existing exact Window Scene intents
for Agent Entry, Project Management, and Character Management. A mode click MUST NOT bind an Agent
Draft, create a Conversation or Run, infer an active record, or retain a hidden business Root.

#### Scenario: Assistant navigation

- **WHEN** the user selects Assistant from Project or Character Management
- **THEN** Desktop transitions with `open-agent-entry`
- **AND** the resulting unbound Draft remains the only Assistant launch path

#### Scenario: Workspace navigation

- **WHEN** the user selects Workspace
- **THEN** Desktop transitions with `open-project-management`
- **AND** no `bindTarget`, active Project lookup, or Workspace Conversation creation occurs

#### Scenario: Character navigation

- **WHEN** the user selects Character
- **THEN** Desktop transitions with `open-character-management`
- **AND** a Character interaction is created only after an exact Chara-owned action

#### Scenario: Existing work is unaffected by entry navigation

- **GIVEN** another Conversation or task continues in its owning runtime
- **WHEN** the current Window changes entry Scene
- **THEN** the previous visible Root is unmounted
- **AND** the durable record and protected background task are not deleted, redirected, or cancelled

### Requirement: Workspace requires explicit Project authority

Workspace mode SHALL land on Project Management. A Workspace SHALL be opened only after the user
explicitly selects an exact valid Project or authorizes a directory through the existing Host-owned path. The selector
MUST NOT store or infer `workspaceId`, grant, raw path, active Project, or recent Project.

#### Scenario: Workspace has no selected Project

- **GIVEN** Project Management is visible with no Project selected
- **THEN** the catalog and its navigation remain usable
- **AND** no Workspace Draft or Conversation is materialized

#### Scenario: User selects a valid Project

- **WHEN** the user explicitly opens a Project from Project Management
- **THEN** `open-project-workspace(projectId)` resolves the exact current authority and grant
- **AND** the Workspace Scene and its Agent scope use that exact identity

#### Scenario: User authorizes a directory

- **WHEN** the user explicitly chooses a directory from Project Management
- **THEN** Host returns an exact Workspace grant and Desktop transitions with `open-workspace(workspaceGrantId)`
- **AND** raw filesystem path is not stored in selector or Agent Draft presentation

#### Scenario: Project cannot be opened

- **WHEN** the selected Project is invalid, missing, or cannot obtain authority
- **THEN** the failure remains visible and local to that operation or record
- **AND** no active/recent Project or unbound Assistant fallback is used

### Requirement: Assistant preserves the canonical first-submit transaction

The Agent Entry Scene SHALL expose one Assistant Draft with editable input and the canonical Plan,
Approve, and Auto execution selector. First submit SHALL continue through validation, Conversation
commit, exact Scene handoff, and provider execution in that order. Navigation simplification MUST NOT
add a direct runtime call, alternate submit handler, or legacy entry action.

#### Scenario: Assistant submits without Workspace

- **GIVEN** the unbound Assistant Draft has valid input and effective model configuration
- **WHEN** the user submits
- **THEN** the canonical transaction creates and attaches the configured Assistant Conversation
- **AND** no Project, directory, active Workspace, or recent Workspace is required

#### Scenario: Submit validation fails

- **WHEN** input, resource, binding, or model configuration validation fails
- **THEN** no Conversation or Scene handoff is committed
- **AND** the textarea, Window navigation, and layout remain operable

#### Scenario: Streaming does not lock unrelated presentation

- **WHEN** provider execution is streaming for an exact Conversation
- **THEN** the current composer may expose cancel/queue semantics owned by Agent runtime
- **AND** Window navigation and unrelated layout controls are not broadly disabled

### Requirement: World remains owner-qualified unavailable

Until a World-owned Scene and Run provider are composed, World SHALL remain visibly disabled with an
owner-qualified description. Activating the disabled item MUST NOT emit a transition, ordinary Agent
submit, generic chatroom creation, prompt encoding, or fallback handler.

#### Scenario: World provider is unavailable

- **WHEN** the entry selector is rendered before World composition exists
- **THEN** World is visibly disabled and identifies the missing World-owned experience
- **AND** Assistant, Workspace, and Character navigation remain available

### Requirement: Replaced entry paths are absent

Production code SHALL have no Agent Webview experience-mode snapshot/presenter/selector, no mode-click
Draft binding, no `start-chat | roleplay` Home action path, no `bind-agent-assistant` Window intent,
and no `bind-assistant` Agent launch operation.
Tests SHALL assert the unique Scene navigation and canonical first-submit path rather than retaining
compatibility fixtures for removed paths.

#### Scenario: Removed mode state cannot affect rendering

- **WHEN** an Agent Draft presentation snapshot is restored
- **THEN** only supported Draft presentation fields are read
- **AND** no experience-mode field or legacy action dispatch changes the current Window Scene
