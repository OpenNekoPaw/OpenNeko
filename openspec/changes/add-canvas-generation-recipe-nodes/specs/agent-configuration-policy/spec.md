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

#### Scenario: Agent generation path fails

- **WHEN** the Agent Tool call cannot validate its generation model or Job request
- **THEN** the Tool call fails visibly in the same Conversation
- **AND** it does not retry through a removed direct UI path, Canvas, another provider or another Workspace
