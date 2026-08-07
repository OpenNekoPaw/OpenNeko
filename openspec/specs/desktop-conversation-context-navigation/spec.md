# desktop-conversation-context-navigation Specification

## Purpose
TBD - created by archiving change group-desktop-conversations-by-context. Update Purpose after archive.
## Requirements
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

Delete, restore and future association operations SHALL carry exact conversation identity, owner identity and applicable revision fences. Host SHALL compare them with the authoritative projection before delegating and MUST NOT require a Project identity for standalone owners. Project removal SHALL NOT act as a conversation lifecycle operation.

#### Scenario: Assistant conversation is deleted

- **WHEN** the user confirms deletion of an exact Assistant conversation with current revisions
- **THEN** Host validates its Assistant owner and delegates canonical Agent lifecycle/Pi deletion
- **AND** no Project record is required

#### Scenario: Owner identity is stale or mismatched

- **WHEN** an operation supplies the right `conversationId` but the wrong owner identity
- **THEN** Host rejects the operation visibly
- **AND** neither transcript nor grouping metadata is modified

#### Scenario: Project is removed while conversations remain

- **WHEN** a Project is removed while Workspace, Assistant, Character or Room conversations remain
- **THEN** the Project catalog operation does not delete those conversations
- **AND** Workspace conversations remain under an unavailable Workspace group
- **AND** standalone-owner conversations remain accessible under their exact owner grouping

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

#### Scenario: Retired embedded-context Pi table is migrated

- **WHEN** startup finds the exact retired `pi_conversations` shape with embedded context columns
- **THEN** Agent Runtime transactionally rebuilds it into the canonical Pi catalog shape before opening any writer
- **AND** existing conversation, branch and Pi Session identities remain unchanged
- **AND** an old Workspace row keeps its exact `workspace_id`
- **AND** an old Scratch row retains its exact `context_id` only as Pi runtime scope and is not assigned to the default Assistant Space
- **AND** the obsolete context columns and indexes are absent after migration

#### Scenario: Pi table shape is unknown

- **WHEN** the existing `pi_conversations` table is neither canonical nor the exact retired embedded-context shape
- **THEN** startup fails visibly before writing or rebuilding the table
- **AND** Agent launch does not retry with a compatibility INSERT or partial default values

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
- **AND** acceptance drives the UI controls rather than creating the conversation through fixture automation or a direct bridge call

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

#### Scenario: Room contains participant AgentSessions

- **WHEN** a future Room runtime uses multiple internal participant AgentSessions
- **THEN** those sessions remain Room-owned runtime participants
- **AND** they are not projected as user-visible Agent Tabs or unrelated sidebar conversations

### Requirement: Agent development acceptance uses visible and batch real-provider lanes

Agent user-feature acceptance SHALL use actual visible Electron controls with a real provider API.
Batch behavior evaluation SHALL run without a visible UI while retaining the complete Desktop
session owner, public Agent input path and real provider API. Neither lane SHALL use bridge-created
conversation setup, a direct turn runner, mock provider or alternate session assembly as behavior
evidence.

#### Scenario: Conversation lifecycle behavior is accepted

- **WHEN** Agent session, persistence, generation or projection behavior changes
- **THEN** visible feature evidence covers the affected user controls and presentation
- **AND** batch evidence covers the affected cells among conversation, compaction, reopen restoration, generation-record restoration, switching and isolation
- **AND** the verification record identifies covered, unaffected and blocked matrix cells
