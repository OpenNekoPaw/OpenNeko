# agent-conversation-branching Specification

## Purpose

Allow a user to continue from an exact completed Agent reply in a new Conversation while DSH remains authoritative for transcript history and branch lineage.

## Requirements

### Requirement: Completed Agent replies can branch a Conversation

The system SHALL allow the user to branch from an exact final Agent reply. DSH SHALL create the child Session from the stable authoritative event prefix through the selected reply's completed turn, preserve fork lineage, and leave the source Session unchanged. OpenNeko MUST NOT replay visible messages, re-run prior turns, or copy a transcript projection to simulate the branch.

#### Scenario: Branch a completed reply

- **WHEN** the user invokes Branch on a final Agent reply whose turn has ended
- **THEN** DSH creates one child Session containing the authoritative history through that turn
- **AND** the source Session and its later history remain unchanged

#### Scenario: Reject an unavailable branch point

- **WHEN** the selected message is missing, duplicated, streaming, or belongs to a turn without a matching completion boundary
- **THEN** the system rejects only that branch request with an explicit diagnostic
- **AND** it does not clip to an earlier turn, create an empty Session, or alter any Conversation

### Requirement: A successful branch is published as an independent Conversation

The Agent application SHALL publish a successful child Session as one new Conversation with an independent Conversation identity, the source Conversation's exact owner context, and one exact child Session binding. Desktop SHALL navigate to that Conversation after publication succeeds.

#### Scenario: Publish and open a branch

- **WHEN** DSH returns a child Session for a valid source Conversation and reply
- **THEN** the Agent application publishes exactly one new Conversation and binding for that child
- **AND** Desktop opens the new Conversation through canonical owner-qualified navigation

#### Scenario: Branch publication fails

- **WHEN** child creation, Conversation reservation, binding, or navigation cannot complete
- **THEN** the current request reports the owning failure and any already-created child identity
- **AND** the source and sibling Conversations remain available
