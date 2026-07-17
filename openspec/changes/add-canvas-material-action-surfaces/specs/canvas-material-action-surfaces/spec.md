## ADDED Requirements

### Requirement: Source-aware material action projection

The Canvas Webview SHALL derive material actions from the selected node's real media capabilities and stable source identity, and SHALL NOT render actions whose owning execution path is unavailable.

#### Scenario: Referenced image material is selected

- **WHEN** a Media node with a resolvable image resource or persistent asset path is selected
- **THEN** the top action surface SHALL expose image editing, system preview, Canvas-node duplication, AssetLibrary promotion, and descriptor-backed fullscreen actions

#### Scenario: Non-image material has no image editor action

- **WHEN** a selected Media node is video or audio
- **THEN** the top action surface SHALL omit image editing while retaining each supported preview, duplication, promotion, and fullscreen action

#### Scenario: Generic edit has no implementation

- **WHEN** a selected node has no registered editing capability
- **THEN** the system SHALL omit the edit action rather than dispatching a no-op selection update

### Requirement: Host-owned material side effects

The Extension Host SHALL resolve Canvas material identity through existing content-access and local-resource boundaries before opening, editing, or promoting a material, and the Webview SHALL NOT perform local filesystem or AssetLibrary writes.

#### Scenario: Save material to AssetLibrary

- **WHEN** the user invokes save-to-asset-library for a material backed by a stable resource reference or persistent asset path
- **THEN** the Extension Host SHALL resolve an authorized local file and invoke the existing AssetLibrary import capability

#### Scenario: Edit referenced image

- **WHEN** the user invokes edit on a resolvable image material
- **THEN** the Extension Host SHALL resolve and read the authorized image file and invoke the existing Sketch image-edit command with Canvas source context

#### Scenario: Material cannot be resolved

- **WHEN** a requested material cannot be materialized or resolved to an authorized local file
- **THEN** the operation SHALL fail visibly and SHALL NOT report a successful preview, edit, or AssetLibrary import

### Requirement: Durable generated-material context

New generated-material projections SHALL preserve portable generation context needed for creator review without persisting runtime resource locations.

#### Scenario: Generated asset is projected to Workspace Board

- **WHEN** a GeneratedAsset with prompt, model, source node, generation time, or stable generation parameters is projected as a Media node
- **THEN** the Media node SHALL preserve the available values in optional `generationContext` data and SHALL preserve the generated ResourceRef as its material identity

#### Scenario: Runtime identity is supplied as generation context

- **WHEN** generation context contains a Webview URI, cache path, temporary path, token, or other runtime-only location
- **THEN** Canvas validation SHALL reject the projection rather than persisting that value

#### Scenario: Existing generated node lacks context

- **WHEN** an older generated Media node has generated provenance but no stored prompt or model
- **THEN** the UI SHALL identify it as generated and show that prompt provenance is unavailable without inventing values from its title or runtime path

### Requirement: Generated-material context surface

The Canvas Webview SHALL show a lower generation context surface for a selected generated material and SHALL keep that surface separate from the node's content and persisted geometry.

#### Scenario: Generated Shot material is selected

- **WHEN** a selected Shot has a generated image or video asset and an available prompt source
- **THEN** the lower surface SHALL display its prompt, available model and parameter summary, and a quick action that opens the existing GenerationPromptPanel for that Shot

#### Scenario: Generated Media resolves to a source Shot

- **WHEN** a selected generated Media node records a sourceNodeId that resolves to a Shot in the current Canvas
- **THEN** its quick generation action SHALL target that Shot and SHALL reuse the existing Canvas creative-AI action path

#### Scenario: Generated Media has no valid creative target

- **WHEN** a selected generated Media node has no source Shot in the current Canvas
- **THEN** the surface SHALL display available provenance but SHALL omit a quick action that would necessarily fail

### Requirement: Material actions remain transient UI

Material action surfaces SHALL render in screen space and SHALL NOT add borders, child nodes, layout records, or geometry changes to the selected material.

#### Scenario: Selection changes or transform starts

- **WHEN** the selection is cleared, another node is selected, or a node transform begins
- **THEN** the corresponding material action surfaces SHALL close or hide without modifying the Canvas document
