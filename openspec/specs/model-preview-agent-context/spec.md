# model-preview-agent-context Specification

## Purpose
TBD - created by archiving change add-standard-3d-model-preview. Update Purpose after archive.
## Requirements
### Requirement: Model Preview uses one canonical typed Agent context
Preview SHALL send model evidence through the canonical `AgentContextPayload` discriminator `model-preview`. The payload data MUST include a contract version, stable source `ResourceRef`, source fingerprint, standard source format, normalized model facts, an identity-bearing staging snapshot, and a stable bounded preview-image `ResourceRef`. It MUST NOT contain Three.js instances, Webview URIs, panel authorization tokens, raw absolute user paths, provider credentials, or provider/model routing arguments.

#### Scenario: Build a model preview context
- **WHEN** a valid model preview session submits a capture and staging snapshot for Agent delivery
- **THEN** the Extension materializes the bounded capture as a derived preview resource and constructs one `model-preview` context whose source, preview image, facts, and staging revision refer to the same source fingerprint and panel revision

#### Scenario: Reject an incomplete context
- **WHEN** the source `ResourceRef`, preview-image `ResourceRef`, fingerprint, contract version, session identity, or staging revision is missing or inconsistent
- **THEN** the bridge reports an invalid-context diagnostic and does not send a degraded payload as if the requested model evidence were complete

### Requirement: Model Preview context delivery validates the originating session
The Extension SHALL validate the send request against the live panel session before materializing evidence or invoking Agent. Missing, stale, disposed, or mismatched session identities and revisions MUST fail visibly and MUST NOT be redirected to the active panel or another model source.

#### Scenario: Send from a live panel
- **WHEN** the creator sends the current staged view from a live panel and all identities match
- **THEN** Preview delivers exactly that panel's source, capture, model facts, camera, lights, selected node, and temporary transforms

#### Scenario: Reject a stale send request
- **WHEN** a delayed send request references an earlier staging revision or a disposed panel
- **THEN** Preview returns a stale-context diagnostic and neither materializes a preview resource nor invokes `neko.agent.sendContext`

### Requirement: Agent receives model evidence without treating the source as text
Agent SHALL project the preview image as multimodal evidence, the stable model source as a referenced resource, and camera/light/transform staging as bounded semantic context. Agent MUST NOT read GLB, glTF, OBJ, STL, PLY, or MTL bytes through the generic text-attachment path and MUST NOT claim that the configured media provider natively accepts the 3D source unless an explicit provider capability says so.

#### Scenario: Attach model evidence to a conversation
- **WHEN** Agent accepts a valid `model-preview` payload
- **THEN** the conversation receives a model-preview reference with the staged image and semantic summary while the original binary remains a stable source reference

#### Scenario: Provider lacks native 3D input
- **WHEN** an Agent workflow targets a video provider that does not declare native 3D-source support
- **THEN** the workflow can use the preview image, camera/light semantics, and other explicitly supported controls but does not upload the source model through an undeclared or fallback parameter

### Requirement: Preview does not own provider routing or video generation
The Model Preview Agent bridge SHALL end at `neko.agent.sendContext`. It MUST NOT select an AI provider or model, create media-generation tasks, translate controls into provider-specific parameters, poll tasks, or promote generated output. Those responsibilities remain in Agent and the owning media capability using an immutable purpose-model snapshot.

#### Scenario: Send context while multiple video providers are configured
- **WHEN** Preview delivers model evidence and several video providers are available
- **THEN** the payload contains no provider selection and Agent retains responsibility for capability validation and explicit generation submission

### Requirement: Agent unavailability is visible to the Preview user
If the Agent extension or `neko.agent.sendContext` command is unavailable, rejects the payload, or fails during delivery, Preview SHALL surface a panel-visible diagnostic correlated with the originating session and MUST NOT report that the model was sent successfully.

#### Scenario: Agent command is unavailable
- **WHEN** the creator requests Agent delivery without an available Agent command
- **THEN** Preview shows an actionable delivery diagnostic and retains the current staging state for retry

### Requirement: The legacy model-scene context path is absent
The retained workspace MUST use `model-preview` as the only Agent context discriminator for standard 3D model preview evidence. The unused `model-scene` discriminator and its parser, validator, and presenter acceptance branches MUST be removed rather than retained as aliases or fallback paths.

#### Scenario: Inspect Agent context contracts
- **WHEN** shared and Agent context contracts are typechecked and boundary guards run
- **THEN** `model-preview` is accepted through the canonical path and `model-scene` cannot compile or parse as a supported context type

#### Scenario: Receive a legacy model-scene payload
- **WHEN** an untyped or external caller submits a `model-scene` payload
- **THEN** Agent rejects it with an unknown-context diagnostic and does not reinterpret it as `model-preview`
