# dsh-conversation-archive Specification

## Purpose

Define user-controlled Conversation archival without changing DSH Session ownership or background execution.

## Requirements

### Requirement: DSH owns durable Conversation archive

The system MUST archive a published Conversation by resolving its exact DSH Session binding and invoking the public DSH Workspace archive operation. The system MUST retain the DSH Session log, OpenNeko catalog record, domain context and binding.

#### Scenario: Archive a published Conversation

- **WHEN** the user archives a valid Conversation
- **THEN** the exact bound DSH Session is added to the DSH Workspace archive set
- **AND** the Conversation no longer appears in the normal Home projection
- **AND** its catalog, context, binding and Session log remain intact

#### Scenario: Archive is repeated

- **WHEN** the same exact Conversation is archived more than once
- **THEN** the command succeeds idempotently without creating duplicate archive entries

#### Scenario: Archive target has a stale DSH Session

- **WHEN** the user explicitly archives a Conversation whose exact stored DSH Session no longer exists in authoritative `session/list`
- **THEN** the system removes the exact catalog, context and binding rows in one local transaction
- **AND** it does not invoke DSH archive or retain a Renderer-only hidden record
- **AND** sibling Conversations remain available

#### Scenario: Archive target has no DSH Session binding

- **WHEN** the user explicitly archives an unavailable Conversation whose catalog record has no binding
- **THEN** the system removes the exact catalog and context rows in one local transaction after proving the binding remains absent
- **AND** it does not invoke DSH archive or retain a Renderer-only hidden record
- **AND** a binding that appears concurrently causes the cleanup to roll back

#### Scenario: Archive target is otherwise invalid

- **WHEN** the Conversation binding is missing, cross-bound, changes concurrently or stale cleanup cannot match every expected row
- **THEN** only the current archive command fails with an explicit diagnostic
- **AND** sibling Conversations and the existing Home projection remain available

### Requirement: Conversation deletion is limited to unavailable local records

The system MUST expose deletion only for a Conversation whose exact DSH Session binding is missing or whose bound Session is absent from authoritative `session/list`. The owning application service MUST revalidate unavailability and remove the exact local catalog, context and optional stale binding in one transaction. A resolvable DSH Session MUST NOT be deleted through this path, and the system MUST NOT expose a generic DSH Session delete operation.

#### Scenario: Delete an unavailable Conversation

- **WHEN** the user deletes a Conversation currently projected as unavailable
- **THEN** Desktop revalidates the exact navigation and the Agent application revalidates DSH Session absence
- **AND** the exact unavailable local record is removed while sibling Conversations remain available

#### Scenario: Reject deletion of a resolvable Conversation

- **WHEN** a delete-unavailable request targets a Conversation whose exact DSH Session is resolvable
- **THEN** only that request fails with an explicit diagnostic
- **AND** the catalog, context, binding and DSH Session remain intact

### Requirement: Archive projection is rebuilt from DSH authority

The system MUST read the DSH Workspace archive set when rebuilding Agent Home and MUST filter catalog records only by their exact bound DSH Session identity.

#### Scenario: Desktop restarts after archive

- **WHEN** Desktop and the DSH subprocess restart after a Conversation was archived
- **THEN** Agent Home rebuilds without the archived Conversation from current DSH archive authority
- **AND** no OpenNeko archive column, cache or active/recent Conversation fallback participates
