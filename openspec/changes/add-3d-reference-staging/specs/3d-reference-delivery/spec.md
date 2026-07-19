## ADDED Requirements

### Requirement: Delivery uses one purpose-aware 3D reference contract

The system SHALL deliver staged 3D reference context through one versioned `3d-reference` payload containing exact session identity, revision, selected purposes, subject/environment descriptors, structured staging, and purpose-specific output resources. The prelaunch `model-preview` discriminator and generic staged-image success path MUST be removed or poisoned and MUST NOT remain as fallback.

#### Scenario: Deliver an independently captured purpose

- **WHEN** the creator invokes the camera capture action while appearance and camera are both enabled in the live session
- **THEN** Preview immediately sends a valid camera-only payload for the exact live revision and does not wait for an appearance capture or retain cross-action pending state

#### Scenario: Reject legacy context

- **WHEN** Agent, Preview, or a fixture receives the removed `model-preview` discriminator after migration
- **THEN** contract parsing fails visibly instead of mapping it to `3d-reference` or returning legacy success

### Requirement: Each reference purpose has a distinct output type

The contract SHALL model appearance, pose, camera, and panoramic scene outputs as a discriminated union. Appearance SHALL use an authorized RGB preview resource; pose SHALL use declared joint semantics plus a pose/skeleton or supported depth control resource; camera SHALL use structured camera parameters with optional composition evidence; panoramic scene SHALL use the stable panorama resource, orientation, and optional bounded viewport evidence.

#### Scenario: Build pose output from a mannequin

- **WHEN** Preview captures a guide-only mannequin for pose delivery
- **THEN** it produces pose/control output and no appearance output, even though the interactive viewport itself displays shaded geometry

### Requirement: Appearance and control routing remain separate

Preview, Agent, Canvas, and media adapters MUST preserve the declared role of every output. Appearance output may populate ordinary visual reference or explicitly supported IP-Adapter fields; pose/depth output may populate only control-image fields with the matching control mode; camera output remains structured camera/shot metadata; panoramic output remains environment/scene evidence. No consumer may reinterpret a control output as appearance based only on its image MIME type.

#### Scenario: Route a pose control to image generation

- **WHEN** Canvas or Agent builds an image request from a pose output
- **THEN** it binds the resource to `controlImage` with `controlMode: pose` and does not add it to IP-Adapter, subject, style, or ordinary reference collections

### Requirement: Unsupported controls fail before provider submission

Agent/media capability negotiation SHALL validate the selected provider/model against every requested 3D reference output before task submission. Unsupported pose, depth, camera, or panoramic controls MUST return typed diagnostics and MUST NOT be dropped, converted to prompt-only success, attached as ordinary appearance reference, or submitted through another provider without explicit user intent.

#### Scenario: Provider lacks pose control

- **WHEN** the creator requests generation with pose output and the selected provider/model does not declare pose-control support
- **THEN** the operation stops before provider submission and reports that pose control is unsupported

### Requirement: Delivery is exact, bounded, and source-safe

The Extension SHALL validate session identity, subject/environment fingerprints, revision, selected purposes, output dimensions, MIME, role eligibility, and resource consistency before materialization or delivery. Payloads MUST use stable `ResourceRef` identities and MUST NOT contain raw model binaries, absolute local paths, Webview URIs, blob URLs, Engine tokens, renderer objects, cache layout, or unauthorized source bytes.

Rebuildable capture bytes SHALL be materialized inside the owning workspace resource cache before PreviewAsset registration. Preview extension-private global storage MUST NOT be used as a cross-extension capture source. If no owning workspace can be selected unambiguously, materialization MUST fail before any file write.

#### Scenario: Reject stale mixed outputs

- **WHEN** an output resource was captured from a different revision, preset version, source, environment, or camera than the current staging snapshot
- **THEN** Preview rejects the entire delivery and retains the live staging for an explicit retry

#### Scenario: Materialize a capture for Agent handoff

- **WHEN** Preview captures a selected purpose in a workspace-owned 3D Reference session
- **THEN** it writes the bounded PNG under that workspace's managed resource cache, registers the workspace-local file as a PreviewAsset, and sends only the stable `ResourceRef`

#### Scenario: Reject capture without an owning workspace

- **WHEN** a capture is requested without a workspace or in an ambiguous multi-root guide session
- **THEN** Preview reports a visible materialization error before writing bytes instead of falling back to extension global storage

### Requirement: Preview does not choose a provider or submit generation

Preview SHALL only construct validated reference context and invoke the existing Agent context boundary or an explicit shared consumer contract. Preview MUST NOT select provider/model identity, build provider-specific parameters, upload source models, or create media tasks.

#### Scenario: Send reference context to Agent

- **WHEN** the creator sends a validated 3D reference session
- **THEN** Agent receives typed purpose outputs and remains responsible for capability negotiation and any later generation decision

### Requirement: Consumers expose role evidence to creators

Agent and Canvas projections SHALL visibly identify which of appearance, pose, camera, and panoramic scene outputs are active and how they will be used. A guide-only asset MUST retain a visible non-appearance label from Preview through conversation/context chips and generation controls.

#### Scenario: Inspect a mannequin context chip

- **WHEN** a built-in mannequin contributes pose and camera outputs
- **THEN** the consumer displays pose and camera roles plus a clear statement that the mannequin is not an appearance reference
