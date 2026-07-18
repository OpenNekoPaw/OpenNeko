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

### Requirement: Model viewport navigation has a stable front-view contract

The first rendered projection SHALL frame the complete model from its canonical front direction. Once the creator orbits or zooms, applying non-camera staging changes from the inspector MUST preserve the live camera position, target, and orbit distance. Camera pose SHALL change only when the active preset identity changes or the creator explicitly requests reset view; field-of-view changes MAY update projection without replacing the current orbit pose.

#### Scenario: Open a model for the first time

- **WHEN** a source has no compatible recoverable staging state and finishes loading
- **THEN** Preview selects the canonical front camera preset and frames the complete model from the front

#### Scenario: Adjust inspector controls after orbiting

- **WHEN** the creator orbits or zooms and then changes lights, background, capture dimensions, node selection, transforms, or field of view
- **THEN** Preview applies the requested staging change while preserving the current camera position, target, and orbit distance

#### Scenario: Explicitly reset the view

- **WHEN** the creator selects another camera preset or invokes reset view
- **THEN** Preview applies the selected canonical camera pose and reframes the complete model deterministically

### Requirement: Model viewport exposes spatial orientation guides

The model Webview SHALL show a bounds-scaled ground grid at the model's lowest Y bound and a screen-space XYZ indicator that follows the live camera orientation. Both guides SHALL default to visible, remain package-local viewport state, and MUST NOT enter the source model, recoverable staging contract, capture metadata, or Agent context. The viewport toolbar SHALL expose accessible controls for navigation, node inspection, transforms, guide visibility, and explicit reframing.

#### Scenario: Inspect spatial orientation

- **WHEN** a model finishes loading and the creator orbits around it
- **THEN** the ground grid remains anchored below the model and the XYZ indicator updates to reflect the live view orientation

#### Scenario: Toggle viewport guides

- **WHEN** the creator uses the bottom toolbar to toggle grid or axes visibility
- **THEN** only the panel-local guide projection changes and the model staging revision and source bytes remain unchanged

#### Scenario: Use the viewport tool rail

- **WHEN** the model viewport renders its navigation, transform, guide, and reframe controls
- **THEN** Preview presents them as one vertical floating rail composed from the shared toolbar primitives, with grouped navigation modes and visible active states, without changing the existing control behavior

### Requirement: Every model preview session owns independent mutable state

Each open model preview panel SHALL own an explicit session identity, source fingerprint, staging revision, renderer, scene, controls, message channel, cancellation scope, and resource projection. Messages lacking the current identity or carrying a stale revision MUST be rejected and MUST NOT fall back to the active or most recently focused panel.

#### Scenario: Open two model previews

- **WHEN** two model files are open in separate Preview panels and the creator changes the camera or lights in one panel
- **THEN** only that panel's staging revision and renderer state change

#### Scenario: Receive a stale panel message

- **WHEN** the Extension or Webview receives a staging, capture, or send request with a missing, mismatched, disposed, or stale session identity
- **THEN** the request fails with a protocol diagnostic and no other model preview session participates

### Requirement: Scene hierarchy and inspector follow one contextual selection

The model Webview SHALL project scene, camera preset, and model-node entries through one package-local hierarchy selection. The right inspector SHALL render only controls owned by the selected kind: scene facts/light/background/output for scene, preset name/position/target/field of view for camera, and temporary transform controls for a model node. Context selection MUST NOT create another shared DTO or alter source bytes.

#### Scenario: Switch inspector context

- **WHEN** the creator selects the scene, a camera preset, or a model node in the hierarchy
- **THEN** the inspector changes to the matching scene, camera, or node panel without resetting the live orbit view

#### Scenario: Select a source model node

- **WHEN** the creator selects a model node and changes its temporary transform
- **THEN** Preview updates the existing transform staging for that stable node path while duplicate, rename, and delete source operations remain unavailable

### Requirement: Camera presets support explicit hierarchy operations

Camera hierarchy rows SHALL expose accessible edit, duplicate, view-through, and remove operations. Duplicate and remove SHALL update only recoverable camera preset staging, preset identifiers SHALL remain unique, at least one camera SHALL always remain, and removing the active camera SHALL select a deterministic remaining preset. Merely selecting or editing a camera SHALL preserve the live orbit pose; only view-through-camera SHALL apply the preset pose.

#### Scenario: Inspect and adjust a camera

- **WHEN** the creator selects a camera and edits its name, position, target, or field of view
- **THEN** Preview updates the camera preset and its temporary viewport helper while preserving the current orbit position, target, and distance

#### Scenario: Duplicate and remove cameras

- **WHEN** the creator duplicates a preset and later removes a removable preset
- **THEN** Preview creates a uniquely identified copy, keeps selection deterministic, and refuses removal when it would leave no camera

#### Scenario: View through a selected camera

- **WHEN** the creator invokes the view-through action for a selected preset
- **THEN** Preview explicitly applies that preset to the live camera and records it as the active staging camera

#### Scenario: Capture while a camera helper is visible

- **WHEN** a selected camera helper is visible and the creator captures the staged model view
- **THEN** the helper is excluded from the capture and restored afterward as editor-only chrome

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
