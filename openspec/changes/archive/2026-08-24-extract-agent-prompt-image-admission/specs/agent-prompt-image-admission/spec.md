## ADDED Requirements

### Requirement: Agent owns prompt-image admission policy

The Agent application SHALL own supported MIME, model eligibility, normalization, count, total-byte,
and atomic batch admission for pasted and referenced prompt images.

#### Scenario: Authorized reference is admitted

- **WHEN** the Desktop byte port returns authorized image bytes and observed MIME
- **THEN** the Agent service normalizes and emits the canonical provider image payload
- **AND** Desktop does not duplicate Agent policy.

#### Scenario: Admission fails before prompt publication

- **WHEN** the selected model lacks image input or any image is invalid or over budget
- **THEN** the entire submit fails visibly before ACP prompt publication
- **AND** no image is dropped and no text-only fallback succeeds.

### Requirement: Desktop owns only authorized reference bytes

Desktop SHALL bind reference reads to the exact Conversation, Window, Workspace grant, and
Workspace-file ContentLocator and SHALL return only authorized bytes plus observed MIME.

#### Scenario: Reference authority is invalid

- **WHEN** context, grant, Workspace identity, locator authority, or Content read is invalid
- **THEN** the byte port rejects the current submit without exposing a path or partial batch.
