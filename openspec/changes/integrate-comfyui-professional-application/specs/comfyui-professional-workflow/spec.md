## ADDED Requirements

### Requirement: ComfyUI local API owns structured workflow execution

The ComfyUI integration SHALL validate and submit an exact bound workflow and authorized input snapshot
through the qualified local ComfyUI API. It SHALL correlate queue, progress, error, cancellation,
history and output retrieval with the exact returned `prompt_id` and the owning Generation Job. It
MUST NOT use visible UI state, process focus or output-directory scanning as execution authority.

#### Scenario: User or Agent runs a valid bound workflow

- **WHEN** the exact workflow/input snapshot passes profile, node, model and API validation
- **THEN** Generation creates one recoverable Job and submits it through the ComfyUI API
- **AND** the returned `prompt_id` becomes the exact external execution identity for that Job

#### Scenario: ComfyUI rejects the workflow

- **WHEN** submission returns validation or node errors
- **THEN** only that Generation Job fails with the provider diagnostic
- **AND** no Computer Use action, second submission or alternate provider starts automatically

### Requirement: Computer Use is an explicit visual complement

The ComfyUI integration SHALL preserve explicit Computer Use operations for inspecting the visible
graph, preview, custom-node diagnostics and qualified UI-only interaction. Each session MUST bind the
exact Tool Call, integration, Desktop host instance, process, window, allowed region, action traits,
grant and observation revision. Its evidence MUST be classified as visual/advisory unless an
independent qualified result confirms the domain outcome.

#### Scenario: User requests visible workflow inspection

- **WHEN** the exact ComfyUI window and grant are valid
- **THEN** Computer Use observes only the bound target and records an observation revision
- **AND** the observation may inform a later explicit API or UI operation without claiming Job success

#### Scenario: User takes over ComfyUI

- **WHEN** user input, process/window change, occlusion or an explicit Take over action invalidates the
  current target observation
- **THEN** the Computer Use session pauses before another mutation
- **AND** an independently running API Job continues under its own lifecycle unless explicitly cancelled

### Requirement: API and Computer Use never silently replace each other

Every ComfyUI operation SHALL declare one canonical transport and evidence policy. A composite workflow
MAY explicitly sequence Computer Use inspection and API execution as separate operations. API failure
MUST NOT trigger Computer Use fallback, and Computer Use failure MUST NOT cause an API mutation to be
guessed, repeated or reported successful.

#### Scenario: API becomes unavailable after visual inspection

- **WHEN** an explicit Computer Use inspection succeeded but the following API readiness or submission
  fails
- **THEN** the workflow stops with the API diagnostic
- **AND** no clicks attempt to queue the workflow as a fallback

#### Scenario: Visual inspection is unavailable

- **WHEN** the API operation does not require visual inspection and the user has not requested it
- **THEN** the exact API workflow may proceed without creating a Computer Use session
- **AND** the product does not describe Computer Use as disabled functionality or an error fallback

### Requirement: ComfyUI endpoints are locally bounded and explicit

The initial integration SHALL support only qualified ComfyUI Desktop discovery and user-configured
loopback local self-hosted endpoints. Endpoint validation MUST reject targets and redirects outside the
allowed local boundary. Arbitrary LAN/public endpoints and Comfy Cloud MUST NOT be inferred or used.

#### Scenario: User configures a loopback endpoint

- **WHEN** the endpoint resolves to the allowed loopback boundary and passes exact ComfyUI readiness
  probes
- **THEN** the profile reports only the operations verified by those probes
- **AND** no directory, process or service outside the profile is scanned

#### Scenario: Endpoint redirects to a remote host

- **WHEN** a configured or discovered endpoint redirects or resolves outside the allowed local boundary
- **THEN** readiness fails closed with a security diagnostic
- **AND** no request, credential or authorized input is sent to the remote target

### Requirement: Outputs become Assets only after authoritative verification and explicit ingest

Generation SHALL retrieve outputs identified by the exact ComfyUI history record, verify the returned
bytes through the authorized adapter and create a durable candidate with provider provenance. Assets
SHALL create a new durable record only after explicit user or owning-workflow acceptance. It MUST NOT
accept the newest file in an output directory, an older cached output or a screenshot as the result.

#### Scenario: Exact Job completes with output

- **WHEN** the exact `prompt_id` history identifies an output and the authorized retrieval succeeds
- **THEN** Generation records a verified candidate and provenance for that Job
- **AND** explicit acceptance ingests that candidate through the existing Assets owner

#### Scenario: Output retrieval fails after execution

- **WHEN** history reports completion but the exact output cannot be retrieved or verified
- **THEN** the Job retains a visible output-retrieval diagnostic
- **AND** no empty, stale, visually inferred or directory-scanned Asset is created

### Requirement: ComfyUI reuses existing Agent and task authorities

Agent-triggered ComfyUI operations SHALL flow through the official DSH Tool contribution, existing
approval/cancellation/transcript path and the same Generation Job service used by direct UI. Computer
Use SHALL remain the official DSH MCP contribution consuming the Automation safety kernel. The
integration MUST NOT create another Agent loop, MCP manager, Job store, active-window router or hidden
Conversation for direct UI actions.

#### Scenario: Agent composes visual inspection and generation

- **WHEN** the Agent explicitly chooses both operations
- **THEN** the transcript records separate exact Tool operations and evidence
- **AND** the Generation Job remains owned by the same recoverable Generation service as a direct UI run

#### Scenario: User starts generation without Agent

- **WHEN** the user runs a bound workflow from the product UI
- **THEN** it invokes the canonical Generation Job service directly
- **AND** no Conversation, Agent Tool Call or Computer Use session is fabricated
