## ADDED Requirements

### Requirement: Delivery uses one purpose-aware 3D reference contract

The system SHALL deliver staged 3D reference context through one versioned `3d-reference` payload containing exact session identity, revision, selected purposes, subject/environment descriptors, structured staging, and purpose-specific output resources. The prelaunch `model-preview` discriminator and generic staged-image success path MUST be removed or poisoned and MUST NOT remain as fallback.

#### Scenario: Deliver selected purposes

- **WHEN** the creator sends a live session with pose and camera selected
- **THEN** the payload contains only validated pose and camera outputs for the exact live revision and excludes appearance and panoramic outputs

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

#### Scenario: Reject stale mixed outputs

- **WHEN** an output resource was captured from a different revision, preset version, source, environment, or camera than the current staging snapshot
- **THEN** Preview rejects the entire delivery and retains the live staging for an explicit retry

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
