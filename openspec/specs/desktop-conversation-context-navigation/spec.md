# desktop-conversation-context-navigation Specification

## Purpose
Define exact owner-qualified Conversation navigation for the currently supported Assistant and Workspace contexts.
## Requirements
### Requirement: Every conversation navigation item has one exact context owner

The Agent conversation catalog SHALL project each conversation with one exact owner identity and MUST NOT encode Assistant conversations as synthetic Workspace Projects. The supported visible navigation owner kinds SHALL be `assistant` and `workspace`.

#### Scenario: Assistant conversation is projected

- **WHEN** a persisted conversation context binds an exact Assistant Space
- **THEN** its navigation owner is `assistant` with that `assistantSpaceId`
- **AND** no `projectId`, `workspaceId`, Character or Room identity is fabricated

#### Scenario: Workspace conversation is projected

- **WHEN** a persisted conversation context binds an exact Workspace
- **THEN** its navigation owner is `workspace` with that `workspaceId`
- **AND** Project grouping is resolved separately from the Host Project catalog

### Requirement: Project grouping is optional and does not change context authority

A conversation MAY carry an explicit Project grouping association. Grouping SHALL control only navigation placement and MUST NOT change the conversation owner, capability scope, resource grants, memory scope, transcript ownership or Workbench Scene qualification.

#### Scenario: Assistant conversation has no Project association

- **WHEN** an Assistant conversation omits Project grouping
- **THEN** it appears under its standalone Assistant group
- **AND** it remains fully restorable without a Project catalog record

#### Scenario: Assistant conversation is associated with a Project

- **WHEN** an exact Assistant conversation carries a valid Project association
- **THEN** it appears below that Project in PrimarySidebar
- **AND** its original context owner remains unchanged
- **AND** it gains no Workspace file or domain mutation capability from the association

#### Scenario: Project association is removed

- **WHEN** a non-Workspace conversation's Project association is explicitly cleared
- **THEN** the conversation returns to its owner-qualified standalone group
- **AND** its transcript, owner, memory and runtime configuration are unchanged

### Requirement: Host produces one authoritative grouped navigation projection

The Host Shell service SHALL combine the complete Project catalog, the existing Desktop stored recent Project context and the owner-qualified Agent Conversation catalog into one grouped navigation projection. Renderer MUST consume that projection and MUST NOT independently infer grouping from current, first or recent Project state. The projection SHALL contain Conversation-owning groups and exact recent Project groups, while omitting catalog-only Projects that have neither a Conversation nor a recent context identity.

#### Scenario: Project has multiple Workspace conversations

- **WHEN** several Conversations have a Workspace owner matching one exact Project
- **THEN** the Project appears once with those Conversations as ordered children
- **AND** the separate flat recent-Conversation section is absent

#### Scenario: Recent Project has no conversations

- **WHEN** a Desktop stored recent Project has no matching Conversation
- **THEN** it remains visible in PrimarySidebar with zero Conversation children
- **AND** no empty Conversation is created

#### Scenario: Catalog-only Project has no conversations

- **WHEN** a complete Project catalog record has no matching Conversation and no recent context identity
- **THEN** it remains available in Project Management but is absent from PrimarySidebar
- **AND** Renderer does not infer its visibility from catalog order or active state

#### Scenario: Workspace owner has no exact Project

- **WHEN** a Workspace Conversation resolves to zero or multiple Project catalog entries
- **THEN** Host projects an unavailable Workspace group with a visible identity diagnostic
- **AND** it does not attach the Conversation to another Project or fail unrelated navigation groups

#### Scenario: Group contains many conversations

- **WHEN** a navigation group exceeds the bounded initial child count
- **THEN** PrimarySidebar offers explicit expand/collapse behavior
- **AND** dynamic children do not resize or overlap window-level controls

### Requirement: Container activation and conversation restoration are distinct

Project container activation SHALL create or expose an owner-bound Draft without selecting an arbitrary historical conversation. Conversation selection SHALL restore the exact persisted conversation and its complete qualified Workbench Scene.

#### Scenario: User opens a Project header

- **WHEN** the user activates a Project group header
- **THEN** Host opens or reuses that exact Workspace container and owner-bound Draft
- **AND** no first, active or recent conversation is restored as fallback

#### Scenario: User opens a Workspace conversation child

- **WHEN** the user activates an exact Workspace conversation child
- **THEN** Host restores that conversation's Agent session and matching Workspace Scene atomically
- **AND** same-Workspace Main/Resources runtime is reused where identity permits

#### Scenario: User opens an Assistant conversation child

- **WHEN** the user activates an exact standalone or Project-grouped Assistant conversation
- **THEN** Host restores the Assistant session without requiring a Project
- **AND** any Project grouping grants no Workspace capability

### Requirement: Lifecycle operations validate exact conversation and owner identity

Delete, restore and association operations SHALL carry exact conversation identity, owner identity and applicable revision fences. Host SHALL compare them with the authoritative projection before delegating and MUST NOT require a Project identity for standalone owners. Project removal SHALL NOT act as a conversation lifecycle operation.

#### Scenario: Assistant conversation is deleted

- **WHEN** the user confirms deletion of an exact Assistant conversation with current revisions
- **THEN** Host validates its Assistant owner and delegates to the canonical Agent lifecycle owner
- **AND** no Project record is required

#### Scenario: Owner identity is stale or mismatched

- **WHEN** an operation supplies the right `conversationId` but the wrong owner identity
- **THEN** Host rejects the operation visibly
- **AND** neither transcript nor grouping metadata is modified

#### Scenario: Project is removed while conversations remain

- **WHEN** a Project is removed while Workspace or Assistant conversations remain
- **THEN** the Project catalog operation does not delete those conversations
- **AND** Workspace conversations remain under an unavailable Workspace group
- **AND** standalone-owner conversations remain accessible under their exact owner grouping

### Requirement: PrimarySidebar is the user-visible conversation switcher

PrimarySidebar SHALL provide the user-visible grouped conversation navigation for the Window. Agent presentation MUST NOT expose a second top-level conversation Tab system that can switch transcript independently of the complete owner-qualified Scene.

#### Scenario: User switches conversations from PrimarySidebar

- **WHEN** the user selects another conversation in PrimarySidebar
- **THEN** the complete exact context transition is coordinated by Host
- **AND** Agent, conversation-scoped Preview/artifacts and owner Scene remain identity-consistent

#### Scenario: User starts a conversation from the visible composer

- **WHEN** the user enters a message in the visible Entry or Workspace Draft composer and submits it
- **THEN** Desktop launches and materializes the exact owner-bound Agent conversation
- **AND** the user message and real provider response become visible in the Agent panel
- **AND** the new exact conversation appears in PrimarySidebar without a global launch error

#### Scenario: Initial provider port crosses the Desktop composition boundary

- **WHEN** lifecycle materializes an exact owner-bound conversation and delegates its first turn through the Agent controller application port
- **THEN** the port executes against that same materialized runtime without relying on an object method receiver
- **AND** a missing port or mismatched conversation/runtime identity fails visibly
- **AND** Desktop does not retry against an active, recent or default Workspace runtime

#### Scenario: Visible connection attaches while the initial turn is running

- **WHEN** the Entry authority starts a turn before the visible Agent connection is attached
- **THEN** the visible connection hydrates the exact Conversation's current running state from its Workspace runtime
- **AND** completion publishes the terminal state removal to that connection
- **AND** the completed response is not displayed together with a stale Thinking or Stop state
- **AND** the launch lifecycle records the exact initial turn as completed rather than leaving it running

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

The Projects section count SHALL equal the number of visible Project-context groups, including unavailable Workspace context groups. The Conversations section count SHALL equal the total Personal Assistant Conversation records. Project row counts SHALL equal their exact child Workspace Conversation count. An owner kind without a visible section SHALL NOT expose a UI count.

#### Scenario: Mixed navigation is counted

- **WHEN** two valid Project groups, one unavailable Workspace context group, and five Personal Assistant Conversations are visible
- **THEN** the section counts are Projects `3` and Conversations `5`
- **AND** the count does not represent a mixture of group kinds
