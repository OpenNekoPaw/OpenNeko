## MODIFIED Requirements

### Requirement: Each provider type has one canonical media executor

The AI SDK stack SHALL own `openai`, `newapi`, `oneapi`, `generic`, `xai`, `kling`, `minimax`, and
`bytedance`. The polling MediaAdapter stack SHALL own `runway`, `luma`, `liblib`, `suno`, `vidu`,
`midjourney`, `fal`, and `dashscope`. A provider type MUST NOT be reachable through both stacks.

#### Scenario: AI SDK type is not registered as a MediaAdapter

- **WHEN** `createMediaPlatform` registers built-in adapters
- **THEN** the MediaAdapter registry does not contain `openai`, `generic`, `newapi`, `xai`, `kling`,
  `minimax`, or `bytedance`

#### Scenario: MiniMax is selected

- **WHEN** an exact MiniMax-H3 model runs video generation
- **THEN** the AI SDK H3 VideoModelV4 owner is invoked
- **AND** no MiniMax V1 MediaAdapter or endpoint is reachable

### Requirement: A canonical failure never switches stacks

When a provider's canonical executor fails, the request MUST fail with the canonical diagnostic and MUST
NOT switch to the other stack, another provider, or a shadowed adapter.

#### Scenario: AI SDK provider fails terminally

- **WHEN** an H3 or Seedance provider returns a terminal failure
- **THEN** the exact Job records that failure
- **AND** no MediaAdapter, second AI SDK provider or default model is attempted

#### Scenario: Unsupported provider type fails visibly

- **WHEN** a provider type has no owning media runtime
- **THEN** the executor returns an explicit unsupported-provider diagnostic
- **AND** it does not infer or select another provider

### Requirement: Explicit provider and model selection is preserved

Routing SHALL return the exact provider and model when both are supplied and valid, and SHALL NOT rewrite
an explicit selection or fall back to a default. External-task status and recovery SHALL use the same
frozen provider/model binding as submission.

#### Scenario: Persisted video task is recovered

- **WHEN** Generation recovers a provider task for an explicit provider and model
- **THEN** status is queried through that exact provider/model runtime
- **AND** active, current, first-compatible and default model selection are not consulted
