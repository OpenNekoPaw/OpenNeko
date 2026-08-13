## ADDED Requirements

### Requirement: Generation owns the canonical Recipe contract

`@neko/generation` SHALL own the one strict Prompt/Text, Image, Video and Audio Recipe union, its typed defaults, validation, purpose mapping and projection to canonical GenerationJob requests. Canvas and other consumers MAY persist or display the public Recipe value but SHALL NOT define a parallel union, default catalog, validator or request mapper.

#### Scenario: Canvas authors and runs a Recipe

- **WHEN** Canvas creates, edits, validates or runs a Generation Node
- **THEN** it consumes the same generation-owned Recipe contract and request projection used at the Generation boundary
- **AND** changing a Recipe branch requires one atomic update of the canonical Generation producer, every consumer, fixture and test rather than Canvas-specific translation

#### Scenario: A Recipe is invalid

- **WHEN** one Recipe contains an illegal field, kind-specific parameter or purpose/model binding
- **THEN** the generation-owned validator rejects that Recipe at the current request or record boundary
- **AND** unrelated Recipes, Canvas nodes, Jobs and Workspaces remain usable

### Requirement: Prompt and media generation share one canonical Job lifecycle

Generation SHALL support strict Prompt/Text, Image, Video and Audio request/result branches through the same Workspace-qualified GenerationJob coordinator, persistence and observation lifecycle. Prompt execution SHALL use a narrow Host-injected completion port and SHALL NOT import Agent runtime or create a Conversation, Pi Session or Tool Call.

#### Scenario: Canvas submits Prompt generation

- **WHEN** a valid Prompt Generation Node submits its exact purpose/model binding and typed request
- **THEN** Generation creates one canonical recoverable GenerationJob and commits one durable generated text artifact
- **AND** the result uses stable content identity without being stored as Agent transcript or media bytes

#### Scenario: Selected model does not support the requested kind

- **WHEN** the exact model/provider binding cannot execute the Prompt, Image, Video or Audio request branch
- **THEN** Generation rejects the request before provider execution
- **AND** it does not choose another model, provider, request kind or Agent path

### Requirement: Caller submission identity prevents duplicate Generation Jobs

Generation SHALL accept one stable submission identity for a caller-owned authoring request and SHALL map equivalent repeated submissions within the exact Workspace to one JobRef. The identity SHALL be used only for idempotent submission and MUST NOT act as a schema version, Job generation counter or provider routing key.

#### Scenario: Equivalent submission is repeated

- **WHEN** the same Workspace repeats a submission identity with the same canonical request
- **THEN** Generation returns the existing JobRef and current authoritative snapshot
- **AND** it does not submit another provider task or commit duplicate output

#### Scenario: Submission identity conflicts

- **WHEN** the same Workspace repeats a submission identity with different request, model, provider or lifecycle facts
- **THEN** Generation rejects the conflict visibly
- **AND** the original Job remains unchanged and unrelated Workspace owners remain usable

#### Scenario: A synchronous paid submission loses its response without a provider task identity

- **WHEN** the owning provider adapter reports that a submitted request has an unknown outcome and no recoverable provider task identity exists
- **THEN** Generation terminates the exact Job as `outcome-unknown` with a non-retryable diagnostic
- **AND** it does not fabricate a provider task, report result success or automatically resubmit the request
- **AND** an explicit user rerun creates a distinct Job through the existing canonical submission path

## MODIFIED Requirements

### Requirement: Direct and Agent generation share the canonical Job path

Explicit Canvas Generation Node operations and Agent generation Tool calls SHALL submit through the
same exact Workspace Generation application runtime and purpose-qualified model binding. Agent composer
direct Image/Video/Audio modes SHALL NOT remain a successful generation consumer.

#### Scenario: Canvas Generation Node is submitted

- **WHEN** a user explicitly runs a Prompt, Image, Video or Audio Generation Node
- **THEN** Generation creates one detached canonical GenerationJob without creating a Conversation,
  Agent Turn, Pi Session or Tool Call
- **AND** Canvas retains the exact document/node run binding and Generation does not choose the result target

#### Scenario: Agent generation Tool is submitted

- **WHEN** an Agent Turn invokes an approved generation Tool
- **THEN** the Tool submits through the same Workspace GenerationJob port with its immutable Turn purpose
  binding and projects the exact Job and artifact identities into that Conversation

#### Scenario: Agent direct-mode submission is attempted

- **WHEN** a stale or forged Agent renderer request attempts to submit an Image, Video or Audio direct mode
- **THEN** the Agent boundary rejects the request before Job creation
- **AND** it does not route through Canvas, a hidden Conversation, another provider or another Workspace owner

#### Scenario: Either retained entry path fails

- **WHEN** the Canvas node operation or Agent Tool cannot validate its exact model or Job request
- **THEN** that operation fails visibly in its own Canvas/Tool boundary
- **AND** it does not retry through the other entry path, another provider or another Workspace owner
