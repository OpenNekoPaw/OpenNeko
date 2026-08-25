# agent-conversation-execution-mode Specification

## Purpose
Define approval-mode defaults and exact decision ownership for new, restored and waiting Agent conversations.
## Requirements
### Requirement: New Agent conversations default to approval mode

The Agent SHALL use `ask` as the canonical execution mode for new conversation configuration, new drafts and recoverable presentation state when no explicit or persisted execution mode exists.

#### Scenario: New conversation has no execution-mode override

- **WHEN** a user starts a new Agent conversation without selecting an execution mode
- **THEN** the effective execution mode SHALL be `ask`
- **AND** a non-read-only Tool SHALL request an identity-bound user decision before execution

#### Scenario: Existing conversation has a persisted execution mode

- **WHEN** an existing conversation is restored with a valid persisted `plan`, `ask` or `auto` mode
- **THEN** the Agent SHALL preserve that exact mode
- **AND** SHALL NOT replace it with the fresh-state default

### Requirement: Approval waits for a user or owner decision

An ask-mode Tool confirmation SHALL remain pending without a user-decision deadline. It SHALL settle only when the exact ToolCall is approved or denied, or when the owning turn, conversation or Agent controller is explicitly cancelled or disposed.

#### Scenario: User does not decide within five minutes

- **WHEN** an ask-mode Tool confirmation remains visible for more than five minutes
- **THEN** the confirmation SHALL remain pending
- **AND** the Tool SHALL NOT execute or fail solely because elapsed time passed

#### Scenario: Owning turn is cancelled while approval is pending

- **WHEN** the user cancels the owning turn or the owning runtime is disposed
- **THEN** the exact pending confirmation SHALL resolve as not approved
- **AND** the Tool SHALL NOT execute

#### Scenario: User approves after a long wait

- **WHEN** the exact identity-bound approval remains pending and the user later approves it
- **THEN** the Tool SHALL continue through the canonical execution path
- **AND** no stale or replacement confirmation SHALL participate
