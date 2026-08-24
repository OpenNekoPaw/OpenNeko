# DSH Draft Input Catalog Specification

## ADDED Requirements

### Requirement: Agent Drafts SHALL expose the effective DSH input catalog without a Conversation

The product SHALL expose the effective configured DSH preset command and user-invocable Skill catalog for an Entry or Workspace Agent Draft before a durable OpenNeko Conversation exists. Discovery MUST NOT require a `conversationId`, create a hidden Conversation, or publish a durable DSH Session.

#### Scenario: Entry Draft opens the command menu

- **GIVEN** the active Agent Surface is an Entry Draft with no Conversation identity
- **WHEN** the user types `/`
- **THEN** the composer displays the effective DSH preset command catalog
- **AND** no Conversation, binding, transcript event or persisted DSH Session is created

#### Scenario: Workspace Draft opens the Skill menu

- **GIVEN** the active Agent Surface is a Workspace-bound Draft with no Conversation identity
- **WHEN** the user types `$`
- **THEN** the composer displays the user-invocable Skills from the effective DSH preset catalog
- **AND** the same Draft identity and Workspace presentation binding remain active

#### Scenario: Pre-turn catalog discovery fails

- **WHEN** the DSH preset cannot be composed, catalog discovery fails, or probe disposal fails
- **THEN** the current composer snapshot fails with an explicit diagnostic
- **AND** it does not project an empty successful catalog or use another preset, Session, provider or legacy controller
- **AND** existing Conversations and sibling Workspaces remain usable

### Requirement: Draft catalog execution SHALL enter the exact durable Session path

A command or Skill selected from a Draft catalog SHALL execute only after the existing atomic first-submit path creates one durable Conversation and binds one exact DSH Session. The exact Session catalog SHALL remain authoritative at execution time.

#### Scenario: First Draft command submission

- **WHEN** the user submits a command selected from an Agent Draft
- **THEN** exactly one Conversation and one bound DSH Session are created
- **AND** the command is resolved and executed against that exact Session
- **AND** the catalog-only probe does not execute or receive transcript ownership

#### Scenario: First Workspace Skill submission

- **WHEN** the user submits a Skill selected from a Workspace Draft
- **THEN** exactly one Workspace-bound Conversation and one exact DSH Session are created
- **AND** the Skill is resolved from and invoked through that Session
- **AND** its turn, transcript, tools and terminal state remain owned by the exact Conversation/Session identities

#### Scenario: A discovered entry changes before execution

- **WHEN** the selected command or Skill is no longer available in the newly created exact Session catalog
- **THEN** the first submission fails visibly for that entry
- **AND** no alternative command, Skill, preset, provider or legacy path reports success

### Requirement: Mention discovery SHALL remain scoped independently from DSH catalog discovery

Workspace resource mentions SHALL continue to use the exact Workspace-bound Agent Surface authority. An unbound Entry Draft SHALL show the local empty mention state and MUST NOT borrow the active or recent Workspace.

#### Scenario: Workspace Draft mention lookup

- **WHEN** the user types `@` in a Workspace-bound Draft
- **THEN** results come only from that exact Workspace binding
- **AND** DSH command or Skill catalog state does not change mention authority

#### Scenario: Entry Draft mention lookup

- **WHEN** the user types `@` in an unbound Entry Draft
- **THEN** the composer shows the local empty state
- **AND** it does not fall back to an active, recent or previously selected Workspace
