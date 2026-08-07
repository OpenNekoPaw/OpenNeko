# project-conversation-cleanup Specification

## Purpose
TBD - created by archiving change separate-project-removal-and-conversation-cleanup. Update Purpose after archive.
## Requirements
### Requirement: Project conversation cleanup uses exact Workspace ownership

The Host SHALL expose an explicit Project-scoped conversation cleanup operation that accepts a non-empty unique collection of Project identities and deletes only conversations whose exact owner is the matching Project Workspace.

#### Scenario: Project owns multiple Workspace conversations

- **WHEN** the user confirms conversation cleanup for an available Project
- **THEN** Host validates the exact Project and resolves every conversation owned by its Workspace
- **AND** Agent conversation authority deletes those exact conversation identities
- **AND** the Project registration, Tabs, Views and files remain unchanged

#### Scenario: Non-Workspace conversation is visually grouped under the Project

- **WHEN** an Assistant, Character or Room conversation carries a presentation association with the selected Project
- **THEN** Project conversation cleanup does not delete that conversation
- **AND** its owner, transcript and grouping association remain unchanged

#### Scenario: Selected Project identity is invalid

- **WHEN** any requested Project identity is missing, empty or duplicated
- **THEN** Host rejects the complete cleanup request visibly before invoking Agent conversation authority
- **AND** no conversation is deleted

### Requirement: Project conversation cleanup is independently confirmed

The Project catalog and each available Project sidebar group SHALL expose Project conversation cleanup separately from Project removal and SHALL require an explicit destructive confirmation before sending the cleanup request.

#### Scenario: User confirms cleanup

- **WHEN** the user invokes Project conversation cleanup and confirms it
- **THEN** Renderer sends only the selected Project identities through the canonical cleanup contract
- **AND** the refreshed projection retains the Projects without the deleted Workspace conversations

#### Scenario: User cancels cleanup

- **WHEN** the user cancels the cleanup confirmation
- **THEN** Renderer sends no cleanup request
- **AND** Project selection and navigation remain unchanged

#### Scenario: Project has no Workspace conversations

- **WHEN** an available Project has no exact Workspace-owned conversations
- **THEN** the cleanup action is disabled or omitted
- **AND** no empty mutation is sent
