## MODIFIED Requirements

### Requirement: Every agent-controlled CharacterRun has one primary AgentSession

Every active agent-controlled CharacterRun SHALL bind one exact CharacterVersion and at most one primary DSH Agent
Conversation. Agent runtime SHALL remain the authority for turns, queue, Tool Calls, Approval, streaming, cancellation,
transcript and compaction. Development Character entry SHALL use the Chara-owned launch transaction and MUST NOT create or
fall back to an Assistant Conversation when Character launch fails.

#### Scenario: User starts a Dialogue from Character detail

- **WHEN** the user selects one exact CharacterVersion and submits the first message
- **THEN** Chara SHALL atomically create or resolve the exact CharacterRun, DialogueRun and bound primary DSH Conversation
- **AND** the first turn SHALL carry the frozen Character context for that CharacterRun
- **AND** the visible scene SHALL attach only to the returned exact Conversation identity

#### Scenario: Character launch fails

- **WHEN** publication validation, run commit, Conversation binding or first-turn submission fails
- **THEN** the current request SHALL return an owner-qualified diagnostic and preserve unrelated records
- **AND** no Assistant, active/recent Conversation or alternate provider path SHALL report success
