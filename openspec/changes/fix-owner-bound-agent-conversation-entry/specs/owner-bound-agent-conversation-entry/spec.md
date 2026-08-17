# Owner-bound Agent Conversation Entry

## ADDED Requirements

### Requirement: Entry draft submission is surface-scoped

The system MUST expose `submitDraft` only to an Agent Director / Entry Surface. A Workspace, Character, Room, or World Surface with an authoritative owner MUST NOT attach an Agent Launch adapter or call `submitDraft`.

#### Scenario: Workspace initial composer

- **WHEN** a user opens a new Agent conversation from an exact Workspace Surface
- **THEN** the Surface projects an owner-bound Composer with the exact Workspace identity
- **AND** no empty Conversation is created or persisted before the first send
- **AND** model configuration, `$` Skill, `/` Command, mention, and index capabilities resolve from that exact owner
- **AND** poisoned Agent Launch attach and draft submit operations are not invoked

#### Scenario: Other owner-bound composers

- **WHEN** a user starts a new conversation from an exact Assistant, Character, Room, or World Surface
- **THEN** that Surface owns its Composer and exact domain identity
- **AND** it does not reuse Entry Draft state or Entry target selection

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

### Requirement: Presentation phases preserve ownership

The system MUST distinguish Entry Draft, owner-bound Composer, and Conversation Session as separate canonical presentation phases.

#### Scenario: Owner-bound presentation without Conversation

- **WHEN** an exact owner Surface has no active Conversation
- **THEN** its phase is `composer`
- **AND** its binding is complete and non-unbound
- **AND** only `conversationId` is absent

#### Scenario: Entry presentation

- **WHEN** the Agent Director Entry is choosing an Assistant, Workspace, Character, Room, or World target
- **THEN** its phase remains `draft`
- **AND** Entry alone may replace the target binding before submission

#### Scenario: Owner-bound creation failure

- **WHEN** the exact owner or Conversation cannot be created
- **THEN** the current request fails visibly
- **AND** the system does not fall back to Entry submit, active Workspace, or another owner
