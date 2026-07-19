## ADDED Requirements

### Requirement: Preview owns one explicit 3D reference session mode

The system SHALL create each 3D Reference session with exactly one explicit subject mode: an authorized user model, a selected built-in preset, or an environment-only session. A missing, unauthorized, unsupported, or failed user source MUST remain a visible source error and MUST NOT silently switch the session to a built-in preset.

#### Scenario: Start without a user model

- **WHEN** the creator explicitly opens a new 3D Reference guide session without selecting a user model
- **THEN** Preview starts a built-in-guide or environment-only session and identifies that mode visibly

#### Scenario: Reject source failure fallback

- **WHEN** an authorized-source session fails to inspect or load its selected model
- **THEN** Preview reports the typed source/load diagnostic and does not substitute any bundled mannequin or example model

### Requirement: A session exposes four independent reference purposes

The system SHALL represent appearance, pose, camera, and 720° panoramic scene as independent selectable purposes. Purpose availability MUST be derived from the active subject and environment capabilities; selecting one purpose MUST NOT implicitly enable another.

#### Scenario: Use a neutral mannequin

- **WHEN** a guide-only mannequin is active
- **THEN** pose and camera purposes are available, appearance is visibly unavailable, and panoramic scene is available only when an environment is present

#### Scenario: Use a real model and panorama

- **WHEN** an authorized model and panoramic environment are both active
- **THEN** the creator can independently include or exclude appearance, pose, camera, and panoramic scene outputs according to detected capabilities

### Requirement: Guide pose state is temporary and capability-bounded

Preview SHALL allow a guide mannequin or a supported articulated model to apply declared pose presets and bounded joint adjustments in panel-owned temporary state. The session MUST reject unknown joints, stale revisions, unsupported skeletons, and values outside declared joint constraints; it MUST NOT modify source bytes or claim guessed joint semantics as model facts.

#### Scenario: Apply a built-in pose preset

- **WHEN** the creator applies a declared pose preset to a compatible built-in mannequin
- **THEN** Preview applies that preset's complete declared joint rotations, updates the instance-scoped pose state and revision, and leaves the immutable preset asset unchanged

#### Scenario: Adjust a preset pose

- **WHEN** the creator selects a body, torso, head, arm, or leg joint and changes a bounded rotation after applying a preset
- **THEN** Preview changes only that panel's selected joint value while preserving the selected mannequin, the remaining preset joint values, and every other open panel

#### Scenario: Reject unsupported pose editing

- **WHEN** a static OBJ, STL, PLY, or non-articulated model is selected for pose editing
- **THEN** Preview keeps pose unavailable and reports an explicit unsupported-capability diagnostic instead of applying object transforms as a fake pose

### Requirement: Camera reference is structured staging state

Preview SHALL keep camera identity, position, target, field of view, aspect ratio, shot scale projection, and live orbit view as explicit temporary state. Editing non-camera purposes MUST preserve the live camera view unless the creator performs an explicit camera or reframe action.

#### Scenario: Stage a camera without changing appearance

- **WHEN** the creator adjusts the camera in a mannequin guide session
- **THEN** Preview advances the camera staging revision without enabling appearance reference or changing the mannequin's role restrictions

#### Scenario: Directly drag the camera object

- **WHEN** the creator selects and drags the rendered camera body in the viewport
- **THEN** Preview moves it on the camera-facing drag plane, updates its normalized staged position and frustum, and does not display or require an XYZ transform gizmo

### Requirement: The temporary light rig exposes spatial directional-light controls

Preview SHALL expose its fixed key, fill, and rim directional lights as selectable temporary scene entries. A selected light SHALL have a visible viewport object and inspector controls for color, intensity, and normalized position/direction toward the subject center. The light object SHALL support direct pointer dragging on a camera-facing plane without displaying or requiring an XYZ transform gizmo. Light objects, direction guides, and transform gizmos are editor chrome and MUST NOT appear in appearance, pose, camera, or panoramic-scene outputs. The initial capability MUST NOT add durable scene lights or reinterpret these controls as attenuating point lights.

#### Scenario: Reposition the key light

- **WHEN** the creator selects the key light and moves its viewport helper
- **THEN** Preview updates only that panel's normalized key-light position and revision while preserving the active camera, subject transform, other lights, and source bytes

#### Scenario: Capture with light helpers visible

- **WHEN** a light helper is visible in the interactive viewport and the creator captures any reference purpose
- **THEN** Preview excludes every light helper, guide line, label, and transform gizmo from the output

#### Scenario: Add a bounded temporary directional light

- **WHEN** the creator opens the bottom light action while fewer than eight temporary directional lights exist
- **THEN** Preview presents a keyboard-accessible list of fixed normalized light positions without changing staging state

- **WHEN** the creator selects one fixed light position
- **THEN** Preview creates exactly one panel-local directional light at that position, selects its viewport object and inspector, and preserves the subject, camera, environment, and existing lights

- **WHEN** the creator attempts to add a ninth light
- **THEN** Preview reports the bounded-light diagnostic and does not create a point, spot, area, shadow, or persistent light

### Requirement: Panoramic scene reference reuses authorized Preview content boundaries

Preview SHALL accept an authorized 720°/equirectangular panoramic image or supported panoramic video as a temporary environment, preserve its stable source reference and orientation, and project it into the Three.js reference viewport through an Extension-authorized URI. The Webview MUST NOT read arbitrary local paths, probe companion directories, or persist Webview URIs.

#### Scenario: Stage an authorized panoramic scene

- **WHEN** the creator selects an authorized panoramic source and adjusts yaw, pitch, or viewport field of view
- **THEN** Preview renders the environment and records the stable source identity plus orientation without copying the source into a model project

### Requirement: The bottom creation bar projects bounded session operations

Preview SHALL expose bottom-toolbar actions for mannequin, blockout object, camera, directional light, and 720° environment using the shared floating-toolbar, popover, theme, icon, focus, and keyboard primitives. Mannequin and object selection SHALL replace the single primary-subject slot only after Extension catalog validation; camera and light actions SHALL add temporary panel-local entries; the 720° action SHALL use the Extension-owned authorized file picker and replace the single environment slot. The toolbar MUST NOT create durable scene data, Webview-owned file access, multiple primary subjects, or an alternate preset registry.

#### Scenario: Select a different mannequin from the bottom bar

- **WHEN** the creator chooses a catalog mannequin from the bottom toolbar
- **THEN** the Extension validates and projects that preset, advances the same panel session revision, and replaces the primary subject without opening a fallback or retaining the previous subject as a hidden scene object

#### Scenario: Preserve Webview assets while replacing a source model

- **WHEN** the creator replaces an authorized source model with a built-in mannequin or blockout object
- **THEN** Preview releases the old model projection while keeping the provider-owned Webview CSS, JavaScript, and selected built-in dependencies authorized for the live panel

#### Scenario: Add a camera from the bottom bar

- **WHEN** the creator opens the bottom camera action
- **THEN** Preview presents a keyboard-accessible list of fixed front, rear, side, and three-quarter camera positions without changing staging state

- **WHEN** the creator selects one fixed camera position
- **THEN** Preview creates exactly one temporary camera with a deterministic identity, normalized position, target, and field of view, selects its viewport object, and preserves the current orbit until the creator explicitly views through it

#### Scenario: Add one basic blockout object

- **WHEN** the creator opens the bottom object action
- **THEN** Preview lists cube, sphere, and cylinder as separate catalog-backed choices rather than one combined primitive set

- **WHEN** the creator selects one blockout primitive
- **THEN** the Extension validates and projects only that preset into the single primary-subject slot and does not construct the other primitive shapes

#### Scenario: Choose a 720° environment from the bottom bar

- **WHEN** the creator invokes the 720° action and selects an authorized panoramic image
- **THEN** the Extension inspects and projects the exact resource into the existing environment slot while preserving the primary subject and other staging state

### Requirement: Every 3D reference session owns isolated mutable state

Every open 3D Reference panel SHALL own its own session identity, revision, subject mode, pose, camera, environment, selected purposes, renderer resources, message queue, cancellation scope, and disposables. Missing, stale, disposed, or mismatched identity MUST fail visibly and MUST NOT fall back to the active editor or another panel.

#### Scenario: Operate two guide sessions

- **WHEN** two 3D Reference panels use different presets, poses, cameras, or panoramas
- **THEN** each panel updates and disposes independently without sharing mutable Three.js objects or staging state

### Requirement: 3D reference staging remains non-durable

The system SHALL treat preset selection, pose, camera, environment orientation, and purpose selection as recoverable Preview-local staging rather than project or source truth. This change MUST NOT introduce a 3D project format, sidecar, hidden source writeback, or Rust Engine Model/Scene authority.

#### Scenario: Close a guide panel

- **WHEN** the creator closes a 3D Reference panel
- **THEN** Preview releases its GPU, loader, listener, and temporary session resources while any recoverable state remains explicitly rebuildable and non-authoritative
