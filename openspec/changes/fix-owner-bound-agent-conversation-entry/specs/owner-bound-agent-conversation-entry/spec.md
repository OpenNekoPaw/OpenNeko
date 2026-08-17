# Owner-bound Agent Conversation Entry

## ADDED Requirements

### Requirement: Entry draft submission is surface-scoped

The system MUST expose `submitDraft` only to an Agent Director / Entry Surface. A Workspace, Character, Room, or World Surface with an authoritative owner MUST NOT attach an Agent Launch adapter or call `submitDraft`.

#### Scenario: Workspace initial composer

- **WHEN** a user opens a new Agent conversation from an exact Workspace Surface
- **THEN** the Surface uses the Conversation Host adapter
- **AND** it immediately creates exactly one owner-bound Conversation before composer capability use
- **AND** model settings, input catalog, and Workspace mention search bind to that exact Conversation
- **AND** poisoned Agent Launch attach and draft submit operations are not invoked

#### Scenario: Agent Entry composer

- **WHEN** a user submits an Agent Director / Entry draft
- **THEN** the Entry Surface may call `submitDraft`
- **AND** the committed Conversation is projected with the selected owner

### Requirement: First and later messages use one Conversation path

The system MUST create an exact owner-bound Conversation before accepting its first message, and MUST route the first and all later messages through the same canonical Conversation message contract.

#### Scenario: Workspace first message with files

- **WHEN** the first Workspace message includes attachments or file references
- **THEN** the accepted Conversation message preserves those inputs
- **AND** the same Conversation identity owns the first and subsequent turns

#### Scenario: Owner-bound creation failure

- **WHEN** the exact owner or Conversation cannot be created
- **THEN** the current request fails visibly
- **AND** the system does not fall back to Entry submit, active Workspace, or another owner
