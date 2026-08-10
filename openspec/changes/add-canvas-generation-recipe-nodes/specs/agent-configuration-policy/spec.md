## MODIFIED Requirements

### Requirement: Generation model routing remains owned by Generation

Canvas Prompt/Image/Video/Audio Generation Nodes and Agent-requested generation SHALL use the same
Generation application service, purpose-qualified model validation, GenerationJob identity and artifact
projection without creating a generation-specific AgentSession. The Agent composer SHALL expose only
the Agent conversation mode; generation purpose model bindings SHALL remain available to approved Agent
Tools and Canvas Generation execution rather than creating direct media composer modes.

#### Scenario: User starts parameterized generation in Canvas

- **WHEN** the user configures and runs a typed Canvas Generation Node
- **THEN** Generation creates the canonical Job directly without requiring an empty chat Conversation or hidden Agent Turn
- **AND** the Canvas node editor provides the exact model and legal kind-specific parameters

#### Scenario: User requests generation in Conversation

- **WHEN** the Agent resolves a natural-language request to an approved generation Tool call
- **THEN** the Tool invokes the same Generation application service and projects the exact Job and artifact identities into that Conversation

#### Scenario: Agent composer is rendered

- **WHEN** a Draft or Conversation composer becomes visible
- **THEN** it does not expose Image, Video or Audio as Agent session/direct-operation modes
- **AND** removing those controls does not remove Generation Tools or their purpose-qualified effective model facts

#### Scenario: Text-only main model uses a configured image generation Tool

- **GIVEN** the Agent main model is a text-only chat model
- **AND** the user explicitly selected an enabled model that supports `image.generate`
- **WHEN** the user submits either the entry Draft or a later Conversation message
- **THEN** the immutable Turn model policy contains the exact selected generation provider and model
- **AND** Tool discovery exposes the approved image generation Tool to the main model
- **AND** reopening the application before pending provider execution does not lose that purpose binding

#### Scenario: Explicit generation binding is invalid

- **WHEN** an Agent Turn carries a stale, disabled, provider-mismatched or capability-mismatched generation model binding
- **THEN** only that Turn fails with a visible model-policy diagnostic
- **AND** the runtime does not choose a default, another configured model, another provider or Canvas as a fallback

#### Scenario: Agent generation path fails

- **WHEN** the Agent Tool call cannot validate its generation model or Job request
- **THEN** the Tool call fails visibly in the same Conversation
- **AND** it does not retry through a removed direct UI path, Canvas, another provider or another Workspace
