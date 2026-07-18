## ADDED Requirements

### Requirement: Preview supports a fixed standard 3D source allowlist
The Preview Extension SHALL register one read-only model preview surface for GLB, glTF, OBJ, STL, and PLY source files. MTL SHALL be accepted only as a declared OBJ companion resource. The system MUST NOT define a new model, scene, sidecar, or project format and MUST NOT expose a runtime format-registration API.

#### Scenario: Open an allowed model source
- **WHEN** a creator opens a GLB, glTF, OBJ, STL, or PLY file with the model preview editor
- **THEN** Preview selects the model Webview entry and begins the authorized source-loading path for that standard format

#### Scenario: Reject an unsupported source
- **WHEN** a creator attempts to open a model format outside the fixed allowlist
- **THEN** Preview reports an unsupported-format diagnostic and does not invoke an Engine action, external Viewer fallback, generic binary reader, or dynamic loader registry

### Requirement: Model resources are projected through exact panel-scoped authorization
The Extension Host SHALL validate the primary source and enumerate only the local companion resources declared by the standard source format. Every projected file MUST remain inside an authorized root, MUST be exposed through a panel-scoped Webview URI mapping, and MUST be revoked when the panel session closes. Remote HTTP(S) dependencies, traversal, absolute dependency references, undeclared companion reads, oversized dependency graphs, and unsupported MIME or extension combinations MUST fail visibly before Three.js loads them.

#### Scenario: Load a GLB source
- **WHEN** a valid GLB file is opened from an authorized source root
- **THEN** the Extension projects exactly the GLB source through a panel-scoped URI and sends the Webview a typed source descriptor containing its stable `ResourceRef`, fingerprint, format, and authorized entry URI

#### Scenario: Load a glTF bundle
- **WHEN** a valid glTF file declares relative buffers or image resources inside the authorized source root
- **THEN** the Extension enumerates those declared resources, projects each through `webview.asWebviewUri()`, and supplies a URL mapping that resolves only those dependencies

#### Scenario: Reject an unsafe model dependency
- **WHEN** a glTF, OBJ, or MTL source declares a remote URL, an absolute dependency, traversal outside the authorized root, or a missing companion file
- **THEN** the Extension returns a source-projection diagnostic and the Webview does not attempt a network request or substitute an unrelated resource

### Requirement: Three.js rendering is browser-only and isolated from the Media Engine
The model preview renderer SHALL run only inside the dedicated Preview Webview entry. Three.js, its loaders, renderer state, scene graph, cameras, lights, controls, and GPU resources MUST NOT be imported by the Extension Host, shared Layer 0/1 packages, Agent runtime, or Rust Engine. Opening a model preview MUST NOT activate or dispatch the removed Engine `models`, `model-preview`, `scenes`, `viewport`, or `cameras` groups.

#### Scenario: Render a standard model
- **WHEN** the Webview receives a valid authorized source descriptor
- **THEN** its format adapter loads the source into one panel-owned Three.js scene, frames the model bounds, and renders through the panel-owned browser renderer

#### Scenario: Audit Engine isolation
- **WHEN** Preview and Engine dependency and action guards run
- **THEN** no model preview code imports `EngineClient` model/scene APIs, registers removed Engine groups, or reports Engine-backed model rendering as available

### Requirement: Preview staging does not mutate the source model
The model preview surface SHALL allow orbit navigation, node inspection, temporary node transforms, multiple temporary camera presets, and temporary light-rig adjustments without writing the source model or creating a durable project artifact. Recoverable state MUST be treated as local UI state keyed by source fingerprint and schema version; it MUST NOT become Asset, Entity, project, or Engine truth.

#### Scenario: Adjust a model before sending
- **WHEN** a creator changes the selected node transform, active camera preset, or light rig
- **THEN** the Webview updates only the panel staging state and rendered projection while the source file remains byte-for-byte unchanged

#### Scenario: Restore compatible preview state
- **WHEN** a creator reopens the same unchanged source and compatible recoverable Preview state exists
- **THEN** Preview restores the staging projection after matching the source fingerprint and state schema version

#### Scenario: Reject stale recoverable state
- **WHEN** the source fingerprint or state schema version does not match stored Preview state
- **THEN** Preview reports or discards the stale projection explicitly and initializes canonical default staging without applying stale transforms, cameras, or lights

### Requirement: Every model preview session owns independent mutable state
Each open model preview panel SHALL own an explicit session identity, source fingerprint, staging revision, renderer, scene, controls, message channel, cancellation scope, and resource projection. Messages lacking the current identity or carrying a stale revision MUST be rejected and MUST NOT fall back to the active or most recently focused panel.

#### Scenario: Open two model previews
- **WHEN** two model files are open in separate Preview panels and the creator changes the camera or lights in one panel
- **THEN** only that panel's staging revision and renderer state change

#### Scenario: Receive a stale panel message
- **WHEN** the Extension or Webview receives a staging, capture, or send request with a missing, mismatched, disposed, or stale session identity
- **THEN** the request fails with a protocol diagnostic and no other model preview session participates

### Requirement: Model preview capture is bounded and deterministic
The Webview SHALL capture the current authorized model projection as a bounded image with the active staging camera, lights, transforms, background, and output dimensions represented in the capture metadata. Capture MUST fail visibly when the renderer is unavailable, the panel identity is stale, the dimensions exceed the configured limit, or the canvas cannot produce an untainted image.

#### Scenario: Capture the staged model view
- **WHEN** the creator requests model context delivery from a valid rendered session
- **THEN** the Webview produces one bounded preview image and a matching staging snapshot for the same session identity and revision

#### Scenario: Reject an invalid capture
- **WHEN** capture dimensions exceed the configured limit or the renderer cannot produce a valid image
- **THEN** Preview returns a capture diagnostic and does not send a partial or source-only context as if the requested evidence were complete

### Requirement: Closing a model preview releases all runtime resources
Closing, reloading, or replacing a model preview SHALL cancel in-flight loads and captures, revoke projected source URIs, remove listeners, stop animation frames, dispose controls and loaders, and dispose every panel-owned geometry, material, texture, render target, and renderer resource. Disposal MUST be idempotent and MUST NOT affect another open model preview.

#### Scenario: Close during model loading
- **WHEN** a model preview closes while source or companion resources are still loading
- **THEN** its cancellation scope terminates the load, its authorization is revoked, and no late completion mutates a disposed or different panel

#### Scenario: Close after rendering
- **WHEN** a rendered model preview closes
- **THEN** all panel-owned browser and Extension resources are released exactly once and no animation loop, GPU resource, message listener, or authorization remains active
