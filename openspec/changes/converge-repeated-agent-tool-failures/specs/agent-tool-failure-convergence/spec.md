## ADDED Requirements

### Requirement: ReadDocument always receives an explicit short source reference

Every provider-facing `ReadDocument` definition SHALL require the Conversation-issued `input_ref`. A continuation request SHALL also carry its issued `cursor_ref`, and both references MUST resolve to the same structured document before content execution. The runtime MUST NOT infer a source from attachment count, active state, path or cursor alone.

#### Scenario: Model reads an attached document

- **WHEN** the model submits `ReadDocument` with the exact attached `input_ref`
- **THEN** the protocol resolves that reference through the current Conversation binding
- **AND** no locator, absolute path or implicit attachment selection is exposed to the model

#### Scenario: Model omits the source reference

- **WHEN** the model submits an initial or continuation `ReadDocument` call without a non-empty `input_ref`
- **THEN** the current Tool call fails visibly before content execution
- **AND** no attachment, cursor source, active Workspace or alternate reader is inferred

#### Scenario: Continuation references another source

- **WHEN** `input_ref` and `cursor_ref` resolve to different documents
- **THEN** only the current Tool call is rejected with an explicit source mismatch diagnostic
- **AND** sibling bindings and Tools remain usable

### Requirement: Consecutive identical Tool failures terminate locally

The Agent Conversation owner SHALL allow one provider correction after a failed Tool call. If the immediately following assistant turn repeats the same single Tool name, arguments and failure unchanged, the owner SHALL stop before a third provider request, project an explicit failed terminal diagnostic and checkpoint only the current turn as failed.

#### Scenario: Model corrects a failed Tool call

- **WHEN** one Tool call fails and the next assistant turn changes its arguments or Tool selection
- **THEN** the Agent continues through the canonical Tool path
- **AND** no repeated-failure terminal diagnostic is emitted

#### Scenario: Model repeats an unchanged failed Tool call

- **WHEN** two consecutive assistant turns contain the same single failed Tool call with unchanged arguments and error
- **THEN** exactly two failed Tool results are retained
- **AND** no third provider request starts
- **AND** the current turn ends failed with an explicit repeated-failure diagnostic

#### Scenario: Another Conversation runs after convergence

- **WHEN** one turn is stopped for a repeated Tool failure
- **THEN** sibling Tools, Conversations and Workspaces remain registered and executable
- **AND** no global runtime, registry or capability is disabled
