## ADDED Requirements

### Requirement: Character Management previews the exact immutable version

Character Management SHALL provide a read-only detail preview for the exact selected CharacterVersion, including identity and
setting, canon and knowledge boundary, behavior and expression policy, representation/model references and defaults, and
voice/TTS defaults when present. It MUST NOT expose Character fact editing or treat another version as fallback.

#### Scenario: User switches Character version

- **WHEN** the user selects another available immutable version in Character detail
- **THEN** every preview section SHALL update from that exact CharacterVersion
- **AND** Start Conversation and Export SHALL retain the same selected version identity

#### Scenario: Optional presentation defaults are absent

- **WHEN** the selected CharacterVersion has no representation default or voice/TTS default
- **THEN** the corresponding section SHALL visibly state that it is not configured
- **AND** the UI SHALL NOT invent a provider, model, voice or implicit latest reference

### Requirement: Character and Agent model ownership remain distinct

The preview SHALL identify Character-owned representation/model references and voice defaults separately from
Conversation-owned LLM provider/model configuration. It SHALL NOT persist or display an effective LLM model before an exact
Conversation/turn configuration exists.

#### Scenario: User looks for the chat model

- **WHEN** no Character Conversation has been created
- **THEN** Character Management SHALL explain that chat provider/model is selected in the Conversation
- **AND** it SHALL continue to show only CharacterVersion-owned representation and TTS facts

### Requirement: Management remains read-only

Character Management SHALL NOT render inputs or commands that mutate, publish or overwrite CharacterProject or
CharacterVersion facts. Editing SHALL remain in the owning Workspace authoring flow.

#### Scenario: User opens Character detail

- **WHEN** the immutable preview is visible
- **THEN** the available actions MAY navigate, start a Conversation or export the exact version
- **AND** no edit, save or publish control SHALL be present
