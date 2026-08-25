# generation-video-task-lifecycle Specification

## Purpose
TBD - created by archiving change adopt-ai-sdk-video-task-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: GenerationJob owns asynchronous generation lifecycle

Every asynchronous provider submission SHALL be owned by one exact GenerationJob. The provider task
identity SHALL be persisted before status polling starts, and Provider, AI SDK, DSH Tool, Renderer and a
generic TaskManager MUST NOT become a second durable lifecycle owner.

#### Scenario: Provider accepts a billable video submission

- **WHEN** the AI SDK provider returns an external operation identity
- **THEN** Generation persists that identity in the exact Job before the first status query
- **AND** closing the invoking Tool or UI does not transfer ownership or erase the Job

#### Scenario: The application restarts while the provider is running

- **WHEN** a persisted GenerationJob contains a provider task identity
- **THEN** Generation resolves the frozen provider/model binding and queries that task
- **AND** it does not submit the generation again or select an active/default model

### Requirement: AI SDK asynchronous video execution exposes start and status

The H3 and Seedance execution path SHALL use AI SDK VideoModelV4 start/status primitives. It MUST NOT
use an internal generate-and-poll call that withholds the task identity until completion.

#### Scenario: Seedance starts through the official provider

- **WHEN** an exact ByteDance/Seedance model is selected
- **THEN** the official ByteDance AI SDK model starts one operation and returns its task identity
- **AND** Generation owns subsequent status scheduling

#### Scenario: H3 starts through MiniMax V2

- **WHEN** an exact MiniMax-H3 model is selected
- **THEN** the H3 VideoModelV4 implementation posts `/v2/video_generation`
- **AND** status uses `/v2/query/video_generation/{task_id}` without reaching the V1 adapter

### Requirement: Video reference inputs preserve explicit roles

The canonical video request SHALL distinguish first frame, last frame, reference image, reference video
and reference audio inputs using stable ContentLocators. Provider materialization SHALL preserve every
accepted role and MUST NOT flatten references into prompt text or silently drop invalid inputs.

#### Scenario: H3 reference-to-video request is submitted

- **WHEN** a request contains typed reference images, videos and audio within H3 limits
- **THEN** the provider payload contains the matching `reference_image`, `reference_video` and
  `reference_audio` content roles
- **AND** no credential, local path, materialized URL or Base64 is persisted in the Job

#### Scenario: Mutually exclusive inputs are supplied

- **WHEN** frame inputs and reference inputs are combined for a model that forbids the combination
- **THEN** the request fails before provider submission with a precise diagnostic
- **AND** it does not ignore references or retry as prompt-only generation

### Requirement: Provider execution remains single-path

MiniMax H3 and ByteDance Seedance SHALL each resolve to exactly one AI SDK execution owner. A provider
failure MUST NOT switch to a MediaAdapter, gateway, second model or default provider.

#### Scenario: H3 provider fails

- **WHEN** MiniMax rejects an H3 request or status query
- **THEN** the exact GenerationJob receives the mapped failure or outcome-unknown diagnostic
- **AND** the removed MiniMax V1 MediaAdapter is not invoked

#### Scenario: One provider configuration is invalid

- **WHEN** one H3 or Seedance provider cannot be resolved
- **THEN** only requests bound to that provider fail visibly
- **AND** sibling provider configurations and Jobs remain usable
