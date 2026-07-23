## ADDED Requirements

### Requirement: Agent-owned work uses Tool Call execution

Work invoked by an Agent that requires no independent lifetime MUST execute as a Tool Call owned by the originating Agent Run. The Tool Call MUST remain active until it produces a terminal result, failure, or cancellation and MUST NOT create a semantically equivalent generic Task or return a TaskRef merely because the operation is long-running.

#### Scenario: A media Tool waits for a generated result

- **WHEN** an Agent invokes media generation that should stop with the Agent and requires no cross-process recovery
- **THEN** the Tool Call observes provider progress, materializes the result, and returns the final ResourceRef or diagnostic
- **AND** no generic TaskManager, TaskRef, task continuation, or parallel TaskCard participates

#### Scenario: The Agent Run is interrupted

- **WHEN** an Agent Run is cancelled while one of its Tool Calls is pending
- **THEN** the Tool Call receives cancellation, stops or reconciles its provider operation according to the provider contract, rejects late updates, and reaches a terminal cancelled state
- **AND** all Tool-scoped resources are released

### Requirement: Background continuation uses explicit Agent Runs

Work that intentionally continues after the creating surface closes MUST use a BackgroundAgentRun or SubagentRun owned by an application-level Agent supervisor. The child run MUST retain creator provenance and MUST expose an explicit interrupt operation. It MUST NOT be represented as a generic Task.

#### Scenario: A Tab creates a background Agent

- **WHEN** a foreground Tool successfully creates and commits a BackgroundAgentRun identity
- **THEN** live ownership transfers to the application Agent supervisor while creator Agent Run and Tool Call identities remain provenance
- **AND** closing the Tab does not cancel the BackgroundAgentRun

#### Scenario: The user interrupts a Subagent

- **WHEN** the user invokes interrupt for an identified SubagentRun
- **THEN** the Agent supervisor cancels that exact run and its owned Tool Calls
- **AND** unrelated foreground, background, and domain executions continue

### Requirement: Independent work is owned by a concrete domain Job or Session

Work that can be created without Agent, survives its caller, requires restart recovery, or owns independent queueing, retry, billing, artifact commit, or audit semantics MUST use a concrete owning-domain Job or Session. Agent MAY create, observe, cancel, or reattach to it through Tools but MUST NOT become its fact authority.

#### Scenario: Cut exports a timeline

- **WHEN** Cut submits an export from a frozen OTIO revision
- **THEN** Cut ExportJob owns progress, cancellation, output validation, and atomic commit
- **AND** Agent, if involved, observes it through a Tool without copying the Job into a generic Task

#### Scenario: A provider Job is recovered

- **WHEN** a recoverable GenerationJob outlives the Tool Call that first observed it
- **THEN** a later Agent Run uses a new Tool Call and the stable domain job identity to reattach
- **AND** the cancelled or completed original toolCallId is never resumed

### Requirement: Runtime ownership is unified without centralizing domain state

The Host SHALL provide one host-neutral ownership mechanism for transient owner-child attachment, explicit transfer, cascade cancellation, and release. It MUST NOT store domain progress, results, provider identities, recovery checkpoints, retry policy, or artifacts.

#### Scenario: A foreground surface closes

- **WHEN** a Tab, Webview, or Window owner is disposed
- **THEN** the ownership mechanism cancels its foreground Agent Runs and their Tool Calls
- **AND** application-owned background Agents, Subagents, and explicitly detached domain Jobs are not selected by active UI state or cancelled by proximity

#### Scenario: An execution identity is stale

- **WHEN** a cancel, event, or transfer request carries a missing, stale, or mismatched owner or execution identity
- **THEN** the operation fails visibly
- **AND** it does not fall back to the active Tab, active conversation, latest Tool Call, or nearest Job

### Requirement: UI projections expose exact execution semantics

The product MUST distinguish message queue, plan progress, Tool execution, Agent/Subagent activity, and domain Job activity. Each cancel, retry, open, or resume action MUST address the exact owning execution type and identity.

#### Scenario: Tool progress streams in the Timeline

- **WHEN** a Tool emits confirmation, progress, partial observation, result, or failure
- **THEN** the Host projects those states into one Timeline item identified by the same toolCallId
- **AND** it does not append a generic TaskCard or a second assistant message as another authority

#### Scenario: The Activity view lists ongoing work

- **WHEN** foreground Tools, background Agents, Subagents, GenerationJobs, or ExportJobs are active
- **THEN** the Activity view labels each by its concrete kind and exposes only operations supported by that owner
- **AND** it does not synthesize a generic cancelTask or retryTask operation

## MODIFIED Requirements

### Requirement: Product boundaries remain OpenNeko-owned

The system SHALL keep Capability, MCP, permission, workspace trust, ResourceRef, concrete creative domain Jobs, package-owned apply, and host projection outside the Pi generic runtime. OpenNeko MUST NOT add a generic Agent Task authority beside Pi Tool Call execution.

#### Scenario: Long generation returns product identity

- **WHEN** a Pi Tool invokes long-running media generation that remains coupled to the Agent Run
- **THEN** the Tool remains active, projects progress under its toolCallId, and returns a terminal ResourceRef or diagnostic
- **AND** cancellation follows the originating Agent Run without a TaskRef or task continuation

#### Scenario: Long generation needs independent recovery

- **WHEN** media generation must survive the Agent Run or support restart recovery
- **THEN** the owning media domain creates a GenerationJob with a stable job identity
- **AND** Pi only invokes or observes that domain Job through Tool Calls

### Requirement: NewAPI remains supported without retaining the legacy chat path

Configured NewAPI/OneAPI-compatible endpoints, explicit protocol profiles, model catalogs, bearer credentials, and Neko account-gateway catalog/entitlement projections SHALL remain supported. Main/chat and bounded multimodal-understanding requests MUST use a Pi OpenAI-compatible provider/model projection. NewAPI-specific image, video, speech, music, and asynchronous provider protocols SHALL remain in the owning OpenNeko media runtime and MUST NOT require the legacy Platform, Vercel AI SDK chat path, or generic Agent TaskManager.

#### Scenario: Use NewAPI for media generation

- **WHEN** a flat media purpose selects a configured NewAPI image, video, speech, or music model
- **THEN** the owning media executor uses the exact NewAPI endpoint and returns a terminal ResourceRef/diagnostic inside the Tool Call or a stable Media-owned GenerationJob identity when independent recovery is explicitly required
- **AND** it does not change the Pi main model or fall back to a chat adapter or generic Task runtime
