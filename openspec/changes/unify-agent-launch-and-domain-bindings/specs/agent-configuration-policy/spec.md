## ADDED Requirements

### Requirement: Model catalog distinguishes discovery from executable availability

The Agent configuration owner SHALL validate provider/model identity, required context-window and output-token metadata, credentials and purpose capability before marking a model executable, and SHALL retain unavailable discovered models only with an explicit diagnostic.

#### Scenario: Model metadata is complete

- **WHEN** a configured chat model has a valid provider binding, context window, maximum output tokens and required capability metadata
- **THEN** Draft and eligible Conversations can select it as an available model

#### Scenario: Model lacks required limits

- **WHEN** a discovered model lacks context-window or maximum-output-token metadata
- **THEN** the model is disabled with a configuration diagnostic before submit and the application does not create a Turn that can only fail during provider invocation

#### Scenario: Credential is unavailable

- **WHEN** the selected provider credential is missing or unreadable
- **THEN** the exact model request is unavailable or rejected without exposing the secret, switching provider, or disabling unrelated configured models

### Requirement: Configuration policy is projected per field

Draft and Conversation configuration SHALL project each supported dimension with its effective value, source and `editable`, `locked`, or `unavailable` policy; locked or unavailable fields SHALL include the owning policy and a user-visible reason.

#### Scenario: General Assistant Draft allows model selection

- **WHEN** an unbound or Assistant Draft has multiple executable chat models and no domain restriction
- **THEN** its model field is editable and its selected value remains a Draft-scoped request until first submit

#### Scenario: Domain policy locks a field

- **WHEN** an explicitly composed domain interaction requires a fixed purpose binding, interaction profile or model constraint
- **THEN** the affected field displays the effective locked value and reason and an override request is rejected rather than silently ignored

#### Scenario: One configuration dimension is invalid

- **WHEN** temperature, token limit, thinking budget or another dimension violates the selected model or domain policy
- **THEN** only that request is rejected with an exact field diagnostic and other Drafts, Conversations and models remain usable

### Requirement: Draft configuration does not mutate global or Conversation settings

Configuration edited in a Draft SHALL belong only to that exact Draft and SHALL become authoritative Conversation future-turn configuration only when first submit commits successfully.

#### Scenario: Draft is abandoned

- **WHEN** the user closes or replaces a Draft after changing model parameters
- **THEN** no global user setting or existing Conversation configuration is changed

#### Scenario: Draft submit fails validation

- **WHEN** first submit fails before local Conversation commit
- **THEN** the Draft retains its requested configuration and diagnostic while no partial Conversation configuration is persisted

#### Scenario: Draft submit succeeds

- **WHEN** first submit commits a Conversation
- **THEN** the validated effective configuration and provenance are attached to that exact Conversation and initial Turn snapshot

### Requirement: Conversation configuration changes apply only to future Turns

Each Conversation SHALL own mutable future-turn configuration, and each Turn SHALL capture one immutable effective configuration snapshot when it starts.

#### Scenario: Model changes between Turns

- **WHEN** the user changes from one allowed chat model to another after a Turn completes
- **THEN** the same Conversation, owner, transcript and context continue and the next Turn uses the new effective model receipt

#### Scenario: Configuration changes during a running Turn

- **WHEN** the user changes an editable parameter while the current Turn is running
- **THEN** the running Turn retains its original immutable snapshot and only a later Turn can use the new value

#### Scenario: Conversation is reopened

- **WHEN** a Conversation is restored after UI unload or application restart
- **THEN** its exact future-turn configuration and prior Turn receipts are restored independently from current global defaults or another Conversation

### Requirement: Domain binding cannot be changed through configuration

Model and execution parameters SHALL NOT mutate the Assistant, Workspace, Character or World owner of an existing Conversation.

#### Scenario: User attempts to change domain identity from model settings

- **WHEN** a UI or request attempts to change Workspace, Character or World identity as though it were a configuration dimension
- **THEN** Agent rejects the request and requires a new bound Draft instead of rebinding the Conversation

#### Scenario: User changes provider in a Workspace Conversation

- **WHEN** Workspace policy permits another configured chat provider
- **THEN** the provider change affects only future Turns and the Workspace identity, grant, references and background work remain exact

### Requirement: Effective configuration never falls back to another successful path

Provider, model and parameter resolution SHALL use the exact user request and domain policy and SHALL fail visibly when they cannot produce one valid effective configuration.

#### Scenario: Selected provider fails at Turn start

- **WHEN** the exact configured provider is unavailable when a Turn begins
- **THEN** that Turn fails or waits according to the canonical provider policy and does not silently switch model, provider, purpose, profile or domain binding

#### Scenario: Selected model lacks the input modality required by a reference

- **WHEN** the current Turn contains an authorized image reference and the exact selected `agent.main` model does not declare image input
- **THEN** that Turn is rejected before provider execution with a modality diagnostic and no other model, provider, purpose or Tool path is attempted

#### Scenario: Stale model selection is submitted

- **WHEN** a Draft or Conversation submits a model catalog identity that is no longer current
- **THEN** the request fails with a stale-model diagnostic and does not resolve the same display name from another provider

### Requirement: Generation model routing remains owned by Generation

Explicit image, video and audio operations and Agent-requested generation SHALL use the same Generation application service, purpose-qualified model validation, GenerationJob identity and artifact projection without creating a generation-specific AgentSession.

#### Scenario: User directly starts media generation

- **WHEN** the user submits a typed generation operation from a dedicated generation control
- **THEN** Generation creates the canonical Job directly without requiring an empty chat Conversation or hidden Agent Turn

#### Scenario: User requests generation in Conversation

- **WHEN** the Agent resolves a natural-language request to an approved generation Tool call
- **THEN** the Tool invokes the same Generation application service and projects the exact Job and artifact identities into that Conversation

#### Scenario: Agent generation path fails

- **WHEN** the Agent Tool call cannot validate its generation model or Job request
- **THEN** the Tool call fails visibly in the same Conversation and does not retry through the direct UI path or another provider
