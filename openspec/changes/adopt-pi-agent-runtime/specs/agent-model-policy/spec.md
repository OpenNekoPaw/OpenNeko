## ADDED Requirements

### Requirement: Every turn uses an immutable model-policy snapshot

At turn or durable-run start, the system MUST resolve and freeze one flat purpose map whose values contain an exact model reference and resolved parameters. `agent.main` MUST be present in the same map as every configured tool purpose. In-flight work MUST NOT observe later configuration changes.

#### Scenario: Change configuration during a turn

- **WHEN** the user changes a future model setting while a turn and its tools are running
- **THEN** the running turn continues with its captured model references and the new setting applies only at the next safe point

### Requirement: Model purpose configuration is flat

The runtime contract MUST NOT represent `main` as a sibling of a nested `purposes` object, nest operations under media types, or perform runtime inheritance through default model type, first compatible capability, or implicit main-model fallback. `llm.chat` SHALL remain a model capability and SHALL NOT be used as a purpose key.

#### Scenario: Resolve the main model and parameters

- **WHEN** a turn starts with model-catalog defaults, user parameters, and conversation overrides
- **THEN** the runtime normalizes them once into the `agent.main` entry and Pi consumes that exact model and parameter set without another fallback lookup

#### Scenario: Resolve a tool model and parameters

- **WHEN** an image-generation tool is registered for the turn
- **THEN** it closes over the exact `image.generate` entry from the same flat snapshot rather than reading a nested image group or model-type default

#### Scenario: Preserve config and wire model identities

- **WHEN** a provider catalog model has different OpenNeko config id and provider wire name
- **THEN** a Pi-executed purpose registers the wire name while a domain-executed purpose retains the config id for owning-runtime lookup, and neither identity is silently substituted for the other

### Requirement: Semantic tools resolve explicit model purposes

Generation and perception tools MUST resolve their provider/model and parameters from an explicit flat purpose binding and MUST NOT accept arbitrary provider/model identifiers from natural-language tool arguments.

#### Scenario: Use different main and perception models

- **WHEN** the main model selects an image-understanding tool bound to a different model
- **THEN** the tool uses the `image.understand` snapshot binding and returns structured evidence without changing the Pi Agent main model

#### Scenario: Understand a stable image resource

- **WHEN** `perception.image.understand` receives a valid `ResourceRef`
- **THEN** ContentAccess materializes the image internally, the Tool returns `neko.image-understanding.v1` evidence tied to the same reference, and no provider id, model id, absolute path, or cache locator is accepted from model-authored arguments

#### Scenario: Audio or video understanding is unavailable

- **WHEN** no retained domain Capability can understand the stable audio or video resource
- **THEN** the runtime reports the unsupported capability and does not encode the media as an invented Pi payload, ask `agent.main` to guess, or invoke legacy Platform chat

#### Scenario: Use different generation model

- **WHEN** the main model selects a video-generation tool bound to `video.generate`
- **THEN** the tool submits through that binding and returns a product `TaskRef` without changing the main model

#### Scenario: Freeze a domain-executed media model

- **WHEN** `image.generate` selects a model whose protocol is owned by the OpenNeko media runtime
- **THEN** the same flat turn snapshot stores its exact provider/model identity as domain-executed without fabricating a Pi chat model, context window, or token limits

#### Scenario: Submit durable generation

- **WHEN** an allowed generation Tool submits successfully through its frozen purpose entry
- **THEN** it promptly returns a `{ source: "media-task", sourceTaskId }` product `TaskRef`, while OpenNeko owns progress, cancellation, recovery, terminal continuation, and the final generated-output `ResourceRef`

### Requirement: Retained product model operations use explicit flat purposes

Canvas prompt generation/optimization, Canvas candidate judging, Character dialogue/profile inference, and text embedding MUST resolve `canvas.prompt`, `canvas.judge`, `character.dialogue`, `character.profile`, and `text.embed` as independent entries in the same flat policy. Pi-executed text operations MUST call Pi with the exact resolved model and parameters. Canvas MUST depend only on semantic prompt/judge operations and MUST NOT receive LLM chat messages, provider/model routing, credentials, token controls, or Pi runtime objects. A domain-owned embedding implementation MAY execute `text.embed` when Pi has no embedding protocol. None of these operations may use generic `IService.chat`, Platform chat registry lookup, `llm.chat` as a purpose, or `agent.main` fallback.

#### Scenario: Optimize a Canvas prompt

- **WHEN** Canvas requests prompt generation or optimization through its semantic port
- **THEN** the Canvas-owned adapter receives a frozen `canvas.prompt` binding from the application composition root, invokes the exact neutral purpose completion primitive, and Canvas receives only the semantic result without importing Agent runtime

#### Scenario: Judge a Canvas candidate

- **WHEN** a Canvas creative run requests candidate judging
- **THEN** it freezes `canvas.judge`, records that purpose/model in the work-item snapshot, and failure of that binding does not fall back to `canvas.prompt` or `agent.main`

#### Scenario: Embed product text

- **WHEN** a retained Capability requests embeddings
- **THEN** it freezes the domain-executed `text.embed` binding and the owning embedding runtime performs the request without retaining Platform chat methods or selecting the first embedding model

### Requirement: Missing or invalid bindings fail visibly

Missing purpose bindings, unknown providers/models, incompatible capabilities, and missing credentials MUST disable registration or return explicit diagnostics. The system MUST NOT fall back to the main model, another provider, or the legacy Platform/AI SDK chat path.

#### Scenario: Purpose is not configured

- **WHEN** a purpose has no explicit binding at tool-registration time
- **THEN** the corresponding model-backed tool is not registered for the turn

#### Scenario: Binding becomes invalid

- **WHEN** a registered tool encounters a stale model reference or missing credential during execution
- **THEN** it returns a diagnostic and no alternate model or legacy adapter is called

### Requirement: Parallel purpose tools preserve identity and isolation

Pi may schedule allowed tool calls concurrently, but every model-backed operation MUST carry explicit conversation, turn, tool-call, and run/task identity and use its own purpose binding.

#### Scenario: Execute two purpose models concurrently

- **WHEN** two independent semantic tools bound to different models execute in parallel
- **THEN** their cancellation, usage, results, and event projection remain correlated to the correct identities and do not mutate shared active-model state

### Requirement: Pi-executed chat and perception use streaming transport

The main Agent model and Pi-executed bounded perception models MUST use Pi streaming provider transport by default. Main-model deltas MUST be projected as they arrive. A bounded perception tool MAY aggregate the stream into one structured evidence result before returning, but MUST NOT switch to a non-streaming completion request or expose a second provider path.

#### Scenario: Aggregate a streamed perception result

- **WHEN** an image-understanding tool invokes its frozen Pi purpose model
- **THEN** the provider request uses Pi streaming transport, the tool awaits the terminal streamed result, and it returns one bounded evidence object without selecting another model or completion endpoint
