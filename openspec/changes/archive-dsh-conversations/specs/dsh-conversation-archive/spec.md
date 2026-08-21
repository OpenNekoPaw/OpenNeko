# DSH Conversation Archive Specification

## ADDED Requirements

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

#### Scenario: Archive target is invalid

- **WHEN** the Conversation binding is missing, cross-bound or names an unknown DSH Session
- **THEN** only the current archive command fails with an explicit diagnostic
- **AND** sibling Conversations and the existing Home projection remain available

### Requirement: Conversation deletion is not a product capability

The system MUST NOT expose a Conversation delete channel, contract, UI action, compatibility alias, raw Session deletion path or SQLite catalog deletion path.

#### Scenario: Inspect production registrations

- **WHEN** Desktop production registrations and bridge capabilities are inspected
- **THEN** exactly one Conversation archive path is present
- **AND** the retired Conversation delete channels and methods are absent

### Requirement: Archive projection is rebuilt from DSH authority

The system MUST read the DSH Workspace archive set when rebuilding Agent Home and MUST filter catalog records only by their exact bound DSH Session identity.

#### Scenario: Desktop restarts after archive

- **WHEN** Desktop and the DSH subprocess restart after a Conversation was archived
- **THEN** Agent Home rebuilds without the archived Conversation from current DSH archive authority
- **AND** no OpenNeko archive column, cache or active/recent Conversation fallback participates
