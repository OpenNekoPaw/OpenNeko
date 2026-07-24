## ADDED Requirements

### Requirement: Shared Job infrastructure contains only lifecycle mechanics

The system SHALL provide a host-neutral shared Job lifecycle contract for typed identity, base phase,
monotonic revision, timestamps, terminal immutability, failure summary, retry provenance and versioned
observation. The shared infrastructure MUST NOT own domain submit commands, provider or Engine identity,
generic payload/result, retry policy, reconciliation, artifacts or a central domain handler registry.

#### Scenario: Two domains reuse lifecycle mechanics

- **WHEN** Generation and Cut persist their concrete Job snapshots
- **THEN** both use the shared identity, revision and transition invariants
- **AND** each keeps its own schema, detailed state, external adapter and result commit

#### Scenario: A central generic manager is proposed

- **WHEN** an implementation attempts to register arbitrary domain executors behind generic payload/result
- **THEN** architecture validation fails
- **AND** no compatibility export or fallback can make the generic manager a successful production path

### Requirement: Job snapshots are the versioned authority

Each concrete Domain Job MUST have one owning-domain snapshot authority. Every accepted mutation MUST
advance its revision exactly once and publish observation only after commit. Reconnect MUST begin with
`get/describe` and continue with `observe(afterRevision)`; an event alone MUST NOT establish Job state.

#### Scenario: An observer reconnects

- **WHEN** an Agent Tool, Host presenter or direct UI reconnects to an existing Job
- **THEN** it installs the exact current snapshot and consumes only later revisions
- **AND** a revision gap causes explicit replacement/reconciliation rather than local state fallback

#### Scenario: A stale command arrives

- **WHEN** cancel or retry carries an expected revision older than the authoritative snapshot
- **THEN** the domain rejects the command before changing state
- **AND** it does not target the active, latest or nearest Job

### Requirement: Terminal and retry semantics are strict

Succeeded, failed and cancelled Jobs MUST be immutable. Retry MUST create a new Job identity with
`retryOf` provenance. An outcome-unknown external operation MUST require owning-domain reconciliation
and MUST NOT be automatically resubmitted by shared infrastructure.

#### Scenario: Retry a failed generation

- **WHEN** Generation accepts a retry command for a failed Job
- **THEN** it creates a new GenerationJob with a distinct jobId and `retryOf` pointing to the original
- **AND** the original snapshot remains failed and unchanged

#### Scenario: Provider submission outcome is unknown

- **WHEN** the provider may have accepted a paid request but local submission loses its terminal response
- **THEN** Generation records outcome-unknown with provider reconciliation evidence
- **AND** neither Agent, Webview nor shared kernel automatically submits a duplicate request

#### Scenario: Host restarts during generation

- **WHEN** a new Host scans a non-terminal GenerationJob with a persisted provider task identity
- **THEN** Generation reconciles and continues observing the exact provider task from its stored revision
- **AND** it does not submit the frozen generation request again

#### Scenario: Host restarts after ambiguous submission

- **WHEN** a persisted running GenerationJob has no provider task identity
- **THEN** Generation records outcome-unknown and exposes a fail-visible reconciliation diagnostic
- **AND** startup recovery does not resubmit a potentially charged request

### Requirement: Domains own commands, reconciliation and result commit

Each Job kind MUST expose a concrete domain port and coordinator for supported commands. The domain MUST
own detailed stages, progress validation, external capability selection, cancellation semantics,
reconciliation, result validation and atomic commit. Unsupported operations MUST fail visibly.

#### Scenario: A provider does not support cancellation

- **WHEN** cancel is requested for a GenerationJob whose provider exposes no cancel capability
- **THEN** Generation returns an explicit unsupported-cancellation diagnostic
- **AND** no adapter success no-op or local cancelled snapshot hides the still-running provider operation

#### Scenario: Cut export completes

- **WHEN** the Engine reports export completion for a frozen project revision
- **THEN** Cut validates and atomically commits the output before marking ExportJob succeeded
- **AND** shared lifecycle code does not inspect the project, codec, frames or output path

### Requirement: Agent accesses Domain Jobs only through Tool Calls

Agent MUST create, describe, observe, cancel or retry a Domain Job through a Tool Call invoking the exact
owning-domain port. Every Generation execution MUST be represented by a GenerationJob. A linked Tool Call
MUST remain pending while it consumes Job observations and MUST return only after the Job reaches a terminal
state. A detached Tool Call MUST return the committed JobRef and MUST NOT remain the Job authority.

#### Scenario: Agent creates a recoverable GenerationJob

- **WHEN** the user explicitly requests background/recoverable generation
- **THEN** one Tool Call submits the Job and returns its stable GenerationJob identity
- **AND** later observation or commands use new Tool Calls without giving Agent authority over the JobStore

#### Scenario: Agent waits for linked generation

- **WHEN** an Agent invokes generation and waits for the result
- **THEN** the media Tool submits one GenerationJob and consumes its event-driven revision stream
- **AND** progress remains in the original Tool Timeline item until the Job returns a terminal ResourceRef
- **AND** no direct provider execution, generic Task, TaskRef or continuation is created

#### Scenario: A Tool Call has already returned a JobRef

- **WHEN** the Agent needs a later observation, cancellation or retry
- **THEN** it uses a new Tool Call with the exact JobRef and expected revision
- **AND** no event revives the completed Tool Call or injects a second Tool result

### Requirement: Job observation is snapshot-first and event-driven

Every concrete Job port MUST expose versioned asynchronous observation. An accepted snapshot commit MUST
publish the new revision to current observers. Reconnection MUST load the authoritative snapshot before
waiting for later events. Callers MUST NOT poll provider or Engine state directly.

#### Scenario: A provider supports push progress

- **WHEN** the provider emits an authenticated progress event
- **THEN** the owning coordinator validates and commits a new Job snapshot before publishing it
- **AND** callers receive the committed revision rather than the raw provider event

#### Scenario: A provider supports only status queries

- **WHEN** reconciliation requires polling
- **THEN** the owning coordinator performs bounded internal polling and commits each accepted state
- **AND** Agent, Webview and domain callers continue using the same event-driven Job observation contract

### Requirement: Domains invoke Generation without Agent forwarding

Canvas, Cut, Character and other domains MUST invoke public Generation application ports directly when they
need media generation. Host composition MUST inject effective provider/model binding and credentials.
Agent MAY invoke the same ports through Tools but MUST NOT be a required forwarding hop or service locator.

#### Scenario: Canvas generates a candidate image

- **WHEN** a Canvas typed action requests an image candidate
- **THEN** Canvas submits through the public purpose-bound Generation Job port and stores exact target,
  revision, idempotency and JobRef association
- **AND** no Agent chat message, background Agent or Agent-owned media forwarding service participates

### Requirement: Webview consumes Host-owned concrete Job activity

Extension Host SHALL project independent Domain Jobs into a versioned read-only Activity snapshot/patch
contract. Webview MUST render concrete Job kinds and send exact identity plus expected revision for
supported commands. Webview MUST NOT own Job lifecycle, subscribe to providers/Engine or use active/latest
Job fallback.

#### Scenario: Webview displays a detached generation

- **WHEN** a detached GenerationJob advances
- **THEN** Host publishes one Generation activity item with monotonically increasing revision and stable refs
- **AND** the linked Tool Timeline remains a separate projection without duplicating Job authority

#### Scenario: Webview cancels an export

- **WHEN** the user cancels an identified ExportJob from Activity
- **THEN** Webview sends job kind, jobId and expected revision and Extension invokes the explicit Cut port
- **AND** an unknown kind, stale revision or unsupported command fails visibly without selecting another Job
