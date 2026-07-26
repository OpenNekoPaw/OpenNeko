## ADDED Requirements

### Requirement: Canvas exposes one unified playback Overlay

The Canvas Webview SHALL render Storyline as the only route presentation inside one unified playback Overlay component. The component SHALL own Storyline, the single playback control presentation, collapsible Preview and footer as one visual surface. These elements MUST NOT be split across sibling persistent/transient panels or separately visible Storyline and Preview components. Canvas MUST NOT expose Matrix, route-comparison mode, grid projection, hidden compatibility path, or fallback renderer.

#### Scenario: Playback Overlay opens

- **WHEN** the user reveals the Canvas playback workspace
- **THEN** one Overlay displays Storyline followed by the playback controls
- **AND** the same Overlay component owns the collapsed Preview region
- **AND** no persistent Storyline or Preview panel remains outside the Overlay
- **AND** no Matrix projection or Matrix runtime state is created

### Requirement: Overlay lifecycle controls Preview expansion

The unified Overlay SHALL keep Storyline at the top and playback controls directly below it. Preview media content SHALL start collapsed each time the Storyline Overlay is shown. Starting playback, activating the explicit show-Preview action, or entering Webview-full-bleed presentation SHALL reveal Preview below the controls for the remainder of that Overlay component lifetime. Pausing, ending playback, becoming stale, or restoring from full-bleed MUST NOT automatically hide Preview. Closing and subsequently showing the Storyline Overlay SHALL create a new collapsed lifecycle. In all states, the Overlay SHALL retain the same top dock, width, shell, Storyline geometry and non-modal semantics without a dimming backdrop. Canvas SHALL remain interactive outside the Overlay.

#### Scenario: User opens the Overlay while not playing

- **WHEN** the Overlay opens with playback state idle, paused or stale
- **THEN** Storyline and exactly one playback control presentation are visible
- **AND** Preview media content is not mounted
- **AND** the Overlay is docked at the top without a dimming backdrop or modal semantics
- **AND** Canvas remains interactive outside the Overlay strip
- **AND** the Overlay title, show-Preview, full-bleed and close actions remain available

#### Scenario: User explicitly reveals Preview

- **WHEN** Preview is collapsed and the user activates the show-Preview action
- **THEN** Preview appears below the controls without starting playback
- **AND** the same Overlay, playback session and current unit are preserved
- **AND** the show-Preview action is removed after Preview becomes visible
- **AND** no hide-Preview action replaces it

#### Scenario: Playback starts

- **WHEN** the user starts playback from the collapsed Overlay
- **THEN** the same Overlay expands without opening another surface
- **AND** Preview media content appears below Storyline and controls
- **AND** the Overlay keeps its top anchor, width, Storyline geometry and non-modal semantics
- **AND** no dimming backdrop or centered modal presentation is introduced
- **AND** Storyline, controls and Preview consume the same playback session

#### Scenario: Playback stops after Preview was revealed

- **WHEN** active playback pauses, ends or becomes stale
- **THEN** Preview media content remains visible
- **AND** Storyline and playback controls remain in the same Overlay
- **AND** the unchanged top-docked shell remains expanded in place

#### Scenario: User closes and reopens the Overlay

- **WHEN** the user closes an Overlay whose Preview was revealed and later shows Storyline again
- **THEN** the new Overlay lifecycle displays Storyline and controls with Preview collapsed
- **AND** no persisted Preview-visibility state is restored from the playback session or store

#### Scenario: User toggles Preview full-bleed presentation

- **WHEN** the Overlay is open and the user activates its fullscreen action
- **THEN** the same Overlay expands to fill the Canvas Webview content area
- **AND** Preview is visible even if playback has not started
- **AND** playback state and current media are preserved
- **AND** activating the action again restores the top-docked Overlay
- **AND** Preview remains visible after restoring the top-docked Overlay
- **AND** full-bleed presentation does not expose an action that hides Preview independently
- **AND** the implementation does not invoke the browser Fullscreen API

#### Scenario: Canvas context UI intersects the expanded Overlay

- **WHEN** selection or generation controls are visible on the Canvas while Preview expands
- **THEN** controls geometrically beneath the Overlay are not painted above Storyline, transport controls or Preview
- **AND** Canvas UI outside the Overlay remains visible and interactive

#### Scenario: User closes the Overlay

- **WHEN** the user closes the Overlay or presses Escape
- **THEN** Storyline, Preview and the control presentation are removed together
- **AND** active playback is paused
- **AND** Canvas remains available

### Requirement: Storyline presents ordered story nodes

Storyline SHALL project valid `CanvasPlaybackRouteCandidate` values as an ordered horizontal branch graph. Node position and width MUST express sequence rather than duration, and Storyline MUST NOT render a timeline ruler or display inferred fallback duration as authoritative metadata. Its viewport SHALL remain within a compact height that exposes approximately two to three route lanes in both top-docked and full-bleed presentations. Additional lanes SHALL remain reachable through the same scrollable viewport.

#### Scenario: A route contains multiple playback units

- **WHEN** Storyline renders the selected route
- **THEN** each valid route unit is displayed once in route order
- **AND** the nodes use stable structural spacing independent of `durationMs`
- **AND** the active node and sequence connections are visually identifiable
- **AND** each node visibly contains only its compact index and short label

#### Scenario: Routes branch and merge

- **WHEN** multiple routes share stable source-node identities before or after distinct units
- **THEN** Storyline renders distinct horizontal lane segments with visible branch and merge connectors
- **AND** shared nodes are rendered once at their stable graph position
- **AND** non-selected route paths remain visible with secondary emphasis

#### Scenario: Storyline contains more than three lanes

- **WHEN** the graph requires more vertical lanes than the compact viewport exposes
- **THEN** Storyline keeps the compact two-to-three-lane height
- **AND** the user can scroll the existing Storyline viewport to reach the remaining lanes
- **AND** expanding Preview or entering full-bleed does not increase Storyline height

#### Scenario: A playback unit lacks authoritative duration

- **WHEN** a Storyline node has no valid `durationMs`
- **THEN** Storyline does not display an invented duration for that node
- **AND** playback may continue using the controller's existing advance policy

### Requirement: Storyline navigation reveals source Canvas nodes once

Each Storyline node SHALL retain the selected route id, playback unit id and `CanvasPlaybackUnit.sourceNodeId`. Activating a Storyline node, choosing a route, or using previous/next navigation MUST reveal that exact source Canvas node once while updating the existing Preview and playback session. Reveal MUST NOT write Canvas selection or persistent playback-highlight state. Automatic playback advancement, play/pause and Seek MUST update the playback session without moving the Canvas viewport.

#### Scenario: User activates a Storyline node

- **WHEN** the user clicks or keyboard-activates a valid Storyline node
- **THEN** the corresponding route and playback unit become current
- **AND** the Canvas viewport reveals the node identified by `sourceNodeId` once inside the unobscured Canvas pane
- **AND** existing Canvas selection remains unchanged
- **AND** no node selection toolbar or persistent playback highlight is activated
- **AND** Preview updates through the existing playback path

#### Scenario: Playback advances without explicit navigation

- **WHEN** playback starts, advances automatically, pauses or seeks
- **THEN** Storyline and Preview session state remain synchronized
- **AND** Canvas selection and viewport remain unchanged

#### Scenario: Source identity is unavailable

- **WHEN** the current PlaybackPlan references a missing unit or source Canvas node
- **THEN** Storyline exposes an explicit diagnostic or stale state
- **AND** it does not select a different node or continue through a fallback mapping

### Requirement: Storyline preserves multiple route selection

Storyline SHALL preserve valid multiple `CanvasPlaybackRouteCandidate` values without introducing a separate comparison surface. A single route MUST NOT render a route selector. Multiple routes SHALL expose exactly one compact named route selector instead of a persistent Tab row, while every route branch remains visible and its nodes remain directly selectable. Shared or merged nodes MUST only be represented when stable source identity proves that the routes reference the same story node.

#### Scenario: Storyline has one route

- **WHEN** the PlaybackPlan contains one valid route
- **THEN** Storyline does not render a route selector or route Tab row
- **AND** the route graph remains directly visible

#### Scenario: Storyline has multiple routes

- **WHEN** the PlaybackPlan contains more than one valid route
- **THEN** Storyline renders exactly one compact route selector with an accessible name
- **AND** it does not render a persistent route Tab row
- **AND** every valid branch remains visible in the same graph

#### Scenario: User chooses another route

- **WHEN** more than one valid route exists and the user selects another route
- **THEN** Storyline emphasizes that route's nodes and connectors without hiding other branches
- **AND** the first valid node in that route becomes current
- **AND** Matrix or another route surface is not opened

#### Scenario: Routes contain similarly named but distinct nodes

- **WHEN** two routes contain nodes with the same label but different stable source identities
- **THEN** Storyline keeps those nodes distinct
- **AND** it does not infer a branch merge from their labels

### Requirement: Storyline owns route diagnostics and accessibility

Storyline SHALL expose route diagnostics, playback-unit media state and current selection without relying on Matrix. All routes and story nodes MUST remain keyboard reachable and MUST have accessible labels that identify their route/node state.

#### Scenario: A route contains a missing-media diagnostic

- **WHEN** Storyline renders a playback unit whose media source is missing
- **THEN** the corresponding node exposes the missing-media state visibly and accessibly
- **AND** the route-level diagnostic remains available in Storyline

#### Scenario: User navigates Storyline with a keyboard

- **WHEN** keyboard focus enters Storyline
- **THEN** the user can traverse and activate story nodes in route order
- **AND** focus does not depend on Matrix row, column or cell state

### Requirement: Canvas Toolbar identifies the Storyline surface

The Canvas Toolbar SHALL use a dedicated Storyline branch icon for the action that opens or closes the unified playback Overlay. The action MUST NOT use the generic play triangle because opening the Overlay does not immediately start playback.

#### Scenario: User finds the Storyline action

- **WHEN** the Canvas Toolbar renders the unified playback Overlay action
- **THEN** the action displays the Storyline branch icon
- **AND** its accessible label identifies opening or closing the Storyline playback Overlay
- **AND** the action does not display the generic play triangle

### Requirement: Storyline playback reuses the existing runtime

Storyline SHALL use the single existing Canvas playback controller and on-demand Preview surface. Removing Matrix MUST NOT create another timer, request owner, media surface or persisted route model.

#### Scenario: Playback starts from Storyline

- **WHEN** the user opens the unified Overlay and starts playback
- **THEN** the existing Preview surface renders the selected unit inside the Overlay
- **AND** only one playback controller owns timers and media requests
- **AND** current route, unit and playback progress remain synchronized

### Requirement: Playback controls are centered and omit time labels

The unified Overlay SHALL center the previous-node, play/pause and next-node transport controls independently of route-position metadata. It SHALL NOT add previous-route or next-route controls, and SHALL NOT display current-time, total-duration or time-formatted Seek tooltip text. The controller MAY retain an unlabeled Seek progress bar and route-position count.

#### Scenario: Playback controls render

- **WHEN** the unified Overlay is collapsed or expanded
- **THEN** the previous, play/pause and next buttons are horizontally centered
- **AND** no route-switch button is added to the transport
- **AND** no current-time or total-duration text is visible
- **AND** the Seek bar does not reveal a formatted time tooltip
- **AND** playback timing remains available internally for seeking and media synchronization

### Requirement: Storyline Overlay has no redundant heading or Preview launch

The Storyline region SHALL NOT render a separate title row that repeats the surface name and current route. When Preview receives a `PreviewPlaybackControl`, the Overlay controller SHALL be the only control that can start the media lifecycle. The controlled Preview MUST NOT render an independent idle play button. Once the media stream is active, media-specific Seek and volume controls MAY remain available.

#### Scenario: Storyline Overlay renders

- **WHEN** the unified Overlay is visible
- **THEN** no separate “Storyline + current route” heading row is rendered
- **AND** the Storyline graph begins at the top of the Overlay content

#### Scenario: Controlled Preview is revealed before its stream starts

- **WHEN** full-bleed presentation reveals a video or audio Preview with `PreviewPlaybackControl`
- **THEN** the Preview does not render an independent play button
- **AND** the centered Overlay transport remains the only playback start action

#### Scenario: Independent media surface is idle

- **WHEN** a Canvas node or independent Preview renders without `PreviewPlaybackControl`
- **THEN** its existing direct play action remains available

### Requirement: Canvas audio layouts share one playback lifecycle

Canvas audio nodes and the Storyline Preview SHALL use the same audio stream, clock, pause/resume, Seek, completion and cleanup implementation. The Canvas node SHALL use an explicit node-card layout with a title row, seekable waveform silhouette, elapsed/total time, centered play/pause and right-side volume control. The Storyline Preview SHALL use the compact horizontal transport. Both layouts MUST render directly inside their existing owning surface without a second bordered, filled, rounded or shadowed playback card.

#### Scenario: Canvas audio node renders

- **WHEN** Canvas renders an audio source as a node
- **THEN** the node displays its audio title above a waveform silhouette
- **AND** the waveform exposes the playback position and Seek interaction
- **AND** elapsed/total time, centered play/pause and volume controls occupy one bottom control row
- **AND** no second card or pill surrounds the waveform and controls

#### Scenario: Storyline audio Preview renders

- **WHEN** the expanded Storyline Preview renders an audio source
- **THEN** it exposes play/pause, elapsed/total time, flexible Seek and mute controls in one horizontal row
- **AND** it does not render the Canvas node title row or waveform silhouette
- **AND** the Overlay footer owns the source title
- **AND** it uses the same playback lifecycle as the Canvas node
