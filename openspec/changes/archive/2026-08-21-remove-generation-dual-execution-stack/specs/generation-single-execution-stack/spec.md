## ADDED Requirements

### Requirement: Each provider type has one canonical media executor

The AI SDK stack SHALL own `openai`, `newapi`, `oneapi`, `generic`, `xai`, and `kling`. The polling
MediaAdapter stack SHALL own `runway`, `luma`, `minimax`, `liblib`, `suno`, `vidu`, `midjourney`, `fal`,
and `dashscope`. A provider type MUST NOT be reachable through both stacks.

#### Scenario: AI SDK type is not registered as a MediaAdapter

- **WHEN** `createMediaPlatform` registers the built-in adapters
- **THEN** the MediaAdapter registry does not contain `openai`, `generic`, `newapi`, `xai`, or `kling`

#### Scenario: MediaAdapter type executes through its canonical adapter

- **WHEN** a `runway` provider runs image/video generation
- **THEN** the Runway adapter's submitter is invoked and the result metadata records
  `providerResolutionSource: 'media-adapter'`

### Requirement: A canonical failure never switches stacks

When a provider's canonical executor fails, the request MUST fail with the canonical diagnostic and MUST
NOT switch to the other stack, another provider, or a shadowed adapter.

#### Scenario: MediaAdapter submitter fails terminally

- **WHEN** a MediaAdapter provider's submitter returns a terminal failure
- **THEN** `executeLinked` rejects or returns that error
- **AND** no AI SDK provider, second adapter, or default provider is attempted

#### Scenario: Unsupported provider type fails visibly

- **WHEN** a provider type has no owning media runtime
- **THEN** the executor returns "No owning media runtime is registered for provider type ..."
- **AND** it does not infer or select another provider

### Requirement: Explicit provider and model selection is preserved

Routing SHALL return the exact provider and model when both are supplied and valid, and SHALL NOT rewrite
an explicit selection or fall back to a default.

#### Scenario: Explicit provider and model are selected

- **WHEN** a request supplies a valid provider and model
- **THEN** the exact provider and model are used for execution
- **AND** the reason records a user-specified selection
