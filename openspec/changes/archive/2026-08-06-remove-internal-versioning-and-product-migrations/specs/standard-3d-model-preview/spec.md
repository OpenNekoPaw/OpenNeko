## MODIFIED Requirements

### Requirement: Preview staging does not mutate the source model

The model preview surface SHALL allow orbit navigation, node inspection, temporary node transforms, multiple temporary camera presets, and temporary light-rig adjustments without writing the source model or creating a durable project artifact. Recoverable state MUST be version-free local UI state keyed only by the stable preview instance and source fingerprint; it MUST NOT become Asset, Entity, project, or Engine truth.

#### Scenario: Adjust a model before sending

- **WHEN** a creator changes the selected node transform, active camera preset, or light rig
- **THEN** the Webview updates only the panel staging state and rendered projection while the source file remains byte-for-byte unchanged

#### Scenario: Restore preview state

- **WHEN** a creator reopens the same unchanged source and valid recoverable Preview state exists
- **THEN** Preview restores the staging projection by stable source and instance identity without reading a schema version

#### Scenario: Reject one invalid recoverable state

- **WHEN** recoverable state for one Preview instance is malformed or belongs to another source
- **THEN** Preview rejects only that instance state, leaves its bytes unchanged, shows a panel diagnostic, and keeps other Preview panels operational

### Requirement: Every model preview session owns independent mutable state

Each open model preview panel SHALL own an explicit session identity, source fingerprint, renderer, scene, controls, message channel, cancellation scope, and resource projection. Messages lacking the exact current session and request identity MUST be rejected and MUST NOT fall back to the active or most recently focused panel. Session identity MUST NOT contain or depend on a schema revision, renderer epoch, or component generation.

#### Scenario: Open two model previews

- **WHEN** two model files are open in separate Preview panels and the creator changes the camera or lights in one panel
- **THEN** only that panel's state and renderer change

#### Scenario: Receive a mismatched panel message

- **WHEN** the Extension or Webview receives a staging, capture, or send request with a missing, mismatched, or disposed session or request identity
- **THEN** the request fails with a panel-local diagnostic and no other model preview session participates
