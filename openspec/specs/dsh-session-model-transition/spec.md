# dsh-session-model-transition Specification

## Purpose
Preserve exact DSH Session ownership and sibling availability while replacing a Session model runtime.
## Requirements
### Requirement: Model replacement SHALL preserve one visible exact Session owner

When an idle DSH Session applies a different effective model configuration, the bridge SHALL retain one exact owner record until the same persisted Session identity has been rebuilt. It MUST NOT expose an intermediate missing owner, create another Session identity or select another provider.

#### Scenario: Composer reads during model replacement

- **WHEN** a permission, input-catalog or other async Session request arrives while the exact Session is applying its model configuration
- **THEN** the request waits for the published replacement
- **AND** it executes against the rebuilt Agent for the same DSH Session identity
- **AND** it does not return `Unknown or inactive session` solely because replacement is in progress

#### Scenario: Model replacement fails

- **WHEN** flush, disposal or resume fails while replacing the Agent
- **THEN** the affected Session becomes locally unavailable with the original diagnostic
- **AND** waiting requests fail from the same replacement
- **AND** no new Session, provider, binding or legacy runtime reports success
- **AND** sibling Sessions remain available

### Requirement: Replacement waiting SHALL NOT deadlock event settlement

The bridge SHALL continue draining already-owned Session events needed by flush and prompt settlement while a model replacement is in progress.

#### Scenario: Existing output drains during replacement

- **WHEN** the old Agent has an existing output tail while replacement begins
- **THEN** event publication completes through the current exact owner record
- **AND** replacement can dispose and resume without waiting on itself
