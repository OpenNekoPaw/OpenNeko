## ADDED Requirements

### Requirement: Canvas presents playback routes in a top storyline Overlay

The Canvas Webview SHALL render its route surface as an Overlay anchored inside the Canvas pane below the top workspace controls. The Overlay MUST expand downward without changing the Canvas viewport dimensions, MUST remain independent from Canvas zoom and pan coordinates, and MUST NOT overlap an adjacent visible Preview pane.

#### Scenario: Storyline opens without resizing the Canvas

- **WHEN** the user reveals the Canvas route surface
- **THEN** a top Overlay appears above the Canvas content
- **AND** the Canvas pane retains its previous layout dimensions
- **AND** the Overlay does not move when the Canvas viewport pans or zooms

#### Scenario: Preview and Storyline are visible together

- **WHEN** the Canvas pane, Storyline Overlay and Preview pane are visible
- **THEN** the Overlay remains within the Canvas pane bounds
- **AND** the Preview pane remains fully visible and interactive
- **AND** resizing Preview does not require a second Overlay width state

#### Scenario: Overlay height is adjusted

- **WHEN** the user drags the Overlay's lower resize handle
- **THEN** the Overlay height changes within its configured viewport bounds
- **AND** the Canvas content remains available behind the Overlay

### Requirement: Storyline is the default route presentation

The route Overlay SHALL default to a compact storyline derived from the selected `CanvasPlaybackRouteCandidate`. Each visible story point MUST retain its source `CanvasPlaybackUnit` and source Canvas node identity. Story points MUST NOT create or persist a parallel Story, Scene, Shot, Beat, or Occurrence node model.

#### Scenario: A single route is revealed

- **WHEN** the PlaybackPlan contains a playable route and the route Overlay opens
- **THEN** the selected route is displayed as an ordered horizontal storyline
- **AND** each story point displays its title and duration
- **AND** the active story point and playhead are visible

#### Scenario: A story point is selected

- **WHEN** the user activates a story point
- **THEN** Preview seeks to that playback unit
- **AND** the source Canvas node is selected and revealed below the Overlay
- **AND** no new persisted Canvas node is created

### Requirement: Matrix is an explicit route comparison mode

The Overlay SHALL expose Matrix as an explicit route comparison mode while preserving the existing route-family, container-fold, row/cell selection, keyboard navigation, media-state and diagnostic projections. Matrix MUST NOT become the default presentation and MUST NOT persist private route order.

#### Scenario: User compares routes

- **WHEN** the user switches the Overlay from Storyline to Route Comparison
- **THEN** the Matrix displays the available route rows and aligned story-point columns
- **AND** selecting a row or cell updates the same selected route and playback unit used by Storyline

#### Scenario: User returns to Storyline

- **WHEN** the user switches back to Storyline
- **THEN** the previously selected route and playback unit remain selected
- **AND** no playback or route state is duplicated

### Requirement: Overlay playback uses the existing Preview runtime

The Storyline Overlay SHALL provide previous, play/pause, next and Seek controls for the selected route. Playback MUST be owned by one Canvas playback controller model and MUST render media through the existing Preview surface and Engine-backed media path.

#### Scenario: Playback starts while Preview is hidden

- **WHEN** the user starts route playback from the Overlay while Preview is hidden
- **THEN** the existing Preview pane becomes visible
- **AND** the selected playback unit renders through the existing Preview surface
- **AND** only one playback timer/request owner is active

#### Scenario: Overlay is hidden while Preview remains visible

- **WHEN** the user hides the route Overlay while Preview is visible
- **THEN** playback controls remain available in Preview
- **AND** playback state, current unit and progress are preserved

#### Scenario: Canvas projection becomes stale

- **WHEN** the active PlaybackPlan becomes stale during playback
- **THEN** playback pauses
- **AND** the existing stale diagnostic is visible
- **AND** the system does not continue through a cached fallback route

### Requirement: Overlay remains usable across supported viewport sizes

The Overlay SHALL keep its controls and story points within stable responsive bounds. It MUST allow horizontal or internal scrolling where necessary and MUST NOT overlap controls incoherently.

#### Scenario: Canvas width is narrow

- **WHEN** the Canvas Webview width cannot display all story points and controls
- **THEN** the storyline remains horizontally scrollable
- **AND** primary playback and close controls remain reachable
- **AND** text does not overflow its interactive container
- **AND** Preview moves below Canvas when a side-by-side layout would reduce Canvas below its supported control width

### Requirement: Storyline chrome follows the Canvas locale

The Storyline, Route Comparison, playback controls, resize control and accessible labels SHALL use the shared Canvas internationalization runtime. Persisted user-authored route and media titles MUST remain unchanged.

#### Scenario: Canvas opens in Simplified Chinese

- **WHEN** the Extension Host injects the `zh-cn` Canvas locale
- **THEN** Storyline and Route Comparison chrome is rendered in Simplified Chinese
- **AND** playback, close and resize accessible labels are rendered in Simplified Chinese
- **AND** persisted route and media titles are not translated
