## ADDED Requirements

### Requirement: Built-in presets come from one code-owned catalog

Preview SHALL expose built-in 3D reference assets through one immutable code-owned catalog. Every catalog entry MUST declare a stable preset ID, schema version, asset fingerprint, preset kind, supported reference purposes, default scale, capability descriptor, license/provenance, and packaged asset location; runtime registration and directory discovery are forbidden in the initial capability.

#### Scenario: Enumerate bundled presets

- **WHEN** Preview opens the built-in preset selector
- **THEN** it presents only catalog-declared entries with stable identity, purpose badges, and license/provenance metadata

#### Scenario: Reject an unknown preset

- **WHEN** a restored session names an absent or version-incompatible preset
- **THEN** Preview rejects the state visibly and does not select the first preset, scan the asset directory, or construct a default success value

### Requirement: Guide presets cannot become appearance references

Every guide-only mannequin, blockout prop, studio, marker, and neutral panoramic grid SHALL omit appearance from its allowed purposes. UI selection, capture construction, Agent context validation, Canvas projection, and media request construction MUST all reject attempts to use those presets as subject, style, IP-Adapter, or generic appearance reference input.

#### Scenario: Attempt to enable mannequin appearance

- **WHEN** the creator or a stale message requests appearance output for a guide-only mannequin
- **THEN** the system returns a role-violation diagnostic and produces no appearance resource

### Requirement: Bundled assets are immutable authorized extension resources

Built-in presets SHALL be packaged with Preview, projected through the existing Extension/Webview resource authorization boundary, and addressed in staging by preset identity rather than absolute path, raw extension path, Webview URI, blob URL, or cache path. The Webview MUST NOT infer asset locations or fetch network resources.

#### Scenario: Load a bundled mannequin

- **WHEN** a live guide session selects a catalog mannequin
- **THEN** the Extension validates its catalog entry and fingerprint, projects the exact packaged files with `webview.asWebviewUri()`, and sends only the identity-bearing descriptor to that panel

### Requirement: The initial catalog is intentionally small, neutral, and proportionally useful

The initial catalog SHALL include only the bounded assets needed for the four reference workflows: high-quality neutral adult-male, adult-female, and child articulated mannequins; primitive/blockout props; a simple room or studio guide; and a neutral panoramic orientation grid. Each mannequin SHALL use a smooth, complete human silhouette with age/body-proportion differences that are useful for staging while avoiding detailed identity, hair, clothing, textures, or style cues that could be mistaken for intended appearance.

#### Scenario: Inspect the initial mannequin

- **WHEN** the neutral mannequin is rendered or captured for pose control
- **THEN** its head, torso, hands, feet, limbs, and joints form a visually complete smooth guide silhouette, and it remains visibly labeled as a guide rather than a character design

#### Scenario: Choose a body proportion

- **WHEN** the creator opens a no-source 3D Reference guide
- **THEN** Preview offers adult-male, adult-female, and child mannequin presets as explicit choices without opening multiple characters or silently substituting one variant

### Requirement: Preset capabilities are declared rather than guessed

Articulation, joint constraints, full joint-valued pose presets, landmarks, render passes, environment support, and appearance eligibility SHALL be declared by the catalog and validated against the packaged asset. A pose preset ID without declared joint rotations is invalid. Preview MUST NOT infer stable pose semantics from arbitrary mesh or node names.

#### Scenario: Load a preset with invalid capability metadata

- **WHEN** catalog metadata references a joint, render pass, or purpose unsupported by the packaged asset
- **THEN** build validation or runtime validation fails visibly before the preset is offered as usable

### Requirement: Presets load lazily with measured package impact

Preset binaries, textures, and panoramic resources SHALL load only when selected and SHALL remain isolated from document, audio, video, and ordinary model entry execution. The change MUST record measured per-asset and aggregate packaged size, parse/load timing on the supported development host, and GPU/resource disposal evidence before enabling the catalog by default.

#### Scenario: Open a non-3D Preview entry

- **WHEN** the creator opens a document, audio, video, or ordinary panoramic preview without starting 3D Reference
- **THEN** the entry does not fetch, decode, or instantiate any built-in 3D preset asset

### Requirement: Third-party preset provenance is auditable

Every non-project-authored built-in asset SHALL have redistribution-compatible license terms, attribution when required, source provenance, modification notes, and an included notice. Assets with missing, incompatible, or ambiguous rights MUST NOT enter the catalog or package.

#### Scenario: Validate package notices

- **WHEN** the Preview package is built for distribution
- **THEN** automated ownership checks prove every catalog asset has matching provenance and license notice metadata
