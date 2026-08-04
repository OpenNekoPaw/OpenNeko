## ADDED Requirements

### Requirement: Every conversation navigation item has one exact context owner

The Agent conversation catalog SHALL project each conversation with one closed owner identity and MUST NOT encode Assistant, Character or Room conversations as synthetic Workspace Projects. The supported navigation owner kinds SHALL be `assistant`, `workspace`, `character` and `room`; Character and Room identities MUST include their exact run identity.

#### Scenario: Assistant conversation is projected

- **WHEN** a persisted conversation context binds an exact Assistant Space
- **THEN** its navigation owner is `assistant` with that `assistantSpaceId`
- **AND** no `projectId`, `workspaceId`, Character or Room identity is fabricated

#### Scenario: Workspace conversation is projected

- **WHEN** a persisted conversation context binds an exact Workspace
- **THEN** its navigation owner is `workspace` with that `workspaceId`
- **AND** Project grouping is resolved separately from the Host Project catalog

#### Scenario: Character or Room owner is incomplete

- **WHEN** a Character conversation lacks `characterRunId` or a Room conversation lacks `roomRunId`
- **THEN** the strict catalog/context codec rejects it visibly
- **AND** it is not downgraded to Assistant or Workspace

### Requirement: Project grouping is optional and does not change context authority

A conversation MAY carry an explicit Project grouping association. Grouping SHALL control only navigation placement and MUST NOT change the conversation owner, capability scope, resource grants, memory scope, transcript ownership or Workbench Scene qualification.

#### Scenario: Assistant conversation has no Project association

- **WHEN** an Assistant conversation omits Project grouping
- **THEN** it appears under its standalone Assistant group
- **AND** it remains fully restorable without a Project catalog record

#### Scenario: Non-Workspace conversation is associated with a Project

- **WHEN** an exact Assistant, Character or Room conversation carries a valid Project association
- **THEN** it appears below that Project in PrimarySidebar
- **AND** its original context owner remains unchanged
- **AND** it gains no Workspace file or domain mutation capability from the association

#### Scenario: Project association is removed

- **WHEN** a non-Workspace conversation's Project association is explicitly cleared
- **THEN** the conversation returns to its owner-qualified standalone group
- **AND** its transcript, owner, memory and runtime configuration are unchanged

### Requirement: Host produces one authoritative grouped navigation projection

The Host Shell service SHALL combine the Project catalog and owner-qualified Agent conversation catalog into one versioned grouped navigation projection. Renderer MUST consume that projection and MUST NOT independently infer grouping from current, first or recent Project state.

#### Scenario: Project has multiple Workspace conversations

- **WHEN** several conversations have a Workspace owner matching one exact Project
- **THEN** the Project appears once with those conversations as ordered children
- **AND** the separate flat recent-conversation section is absent

#### Scenario: Project has no conversations

- **WHEN** a stored Project has no matching conversation
- **THEN** the Project remains visible as an activatable container
- **AND** no empty conversation is created

#### Scenario: Workspace owner has no exact Project

- **WHEN** a Workspace conversation resolves to zero or multiple Project catalog entries
- **THEN** Host returns a visible identity diagnostic
- **AND** it does not attach the conversation to another Project

#### Scenario: Group contains many conversations

- **WHEN** a navigation group exceeds the bounded initial child count
- **THEN** PrimarySidebar offers explicit expand/collapse behavior
- **AND** dynamic children do not resize or overlap window-level controls

### Requirement: Container activation and conversation restoration are distinct

Project/Character/Room container activation SHALL create or expose an owner-bound Draft without selecting an arbitrary historical conversation. Conversation selection SHALL restore the exact persisted conversation and its complete qualified Workbench Scene.

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

#### Scenario: Character or Room owner is not qualified

- **WHEN** the user requests restore for a Character/Room conversation before its owner runtime and public Scene surfaces are available
- **THEN** Desktop returns `desktop-scene-owner-unavailable` with the exact owner kind
- **AND** no placeholder, Assistant fallback or previous Scene transcript is shown

### Requirement: Lifecycle operations validate exact conversation and owner identity

Delete, restore and future association operations SHALL carry exact conversation identity, owner identity and applicable revision fences. Host SHALL compare them with the authoritative projection before delegating and MUST NOT require a Project identity for standalone owners.

#### Scenario: Assistant conversation is deleted

- **WHEN** the user confirms deletion of an exact Assistant conversation with current revisions
- **THEN** Host validates its Assistant owner and delegates canonical Agent lifecycle/Pi deletion
- **AND** no Project record is required

#### Scenario: Owner identity is stale or mismatched

- **WHEN** an operation supplies the right `conversationId` but the wrong owner identity
- **THEN** Host rejects the operation visibly
- **AND** neither transcript nor grouping metadata is modified

#### Scenario: Project is removed from recent navigation

- **WHEN** a Project is removed while associated Assistant/Character/Room conversations remain
- **THEN** the Project catalog operation does not delete those conversations
- **AND** they remain accessible under standalone owner grouping or a visible broken-association diagnostic

### Requirement: Existing valuable conversations migrate without synthetic fallback

The breaking navigation projection migration SHALL preserve supported Assistant and Workspace conversations by reading their exact canonical context metadata. Unknown versions, unknown owner kinds and unresolved legacy context SHALL fail visibly and MUST NOT be assigned to a recent Project or default Assistant Space.

#### Scenario: Existing Assistant conversation is migrated

- **WHEN** a current Assistant lifecycle context is read by the new catalog producer
- **THEN** it is projected with its exact Assistant Space owner and existing transcript identity
- **AND** the former synthetic `content:<assistantSpaceId>` Project identity is not emitted

#### Scenario: Existing Workspace conversation is migrated

- **WHEN** a legacy Workspace conversation has an exact resolvable Workspace identity and grant
- **THEN** the canonical context migration commits once and the conversation appears under the matching Project
- **AND** its Pi transcript and branch identities are unchanged

#### Scenario: Legacy context cannot be resolved

- **WHEN** a conversation lacks exact context and no migration authority can resolve it
- **THEN** catalog/restore exposes an unresolved-context diagnostic
- **AND** it does not return an empty success projection or another owner's conversation

### Requirement: PrimarySidebar is the user-visible conversation switcher

PrimarySidebar SHALL provide the user-visible grouped conversation navigation for the Window. Agent presentation MUST NOT expose a second top-level conversation Tab system that can switch transcript independently of the complete owner-qualified Scene.

#### Scenario: User switches conversations from PrimarySidebar

- **WHEN** the user selects another conversation in PrimarySidebar
- **THEN** the complete exact context transition is coordinated by Host
- **AND** Agent, conversation-scoped Preview/artifacts and owner Scene remain identity-consistent

#### Scenario: Room contains participant AgentSessions

- **WHEN** a future Room runtime uses multiple internal participant AgentSessions
- **THEN** those sessions remain Room-owned runtime participants
- **AND** they are not projected as user-visible Agent Tabs or unrelated sidebar conversations
