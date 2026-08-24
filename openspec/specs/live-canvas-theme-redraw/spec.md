# live-canvas-theme-redraw Specification

## Purpose
Keep the mounted Canvas grid synchronized with canonical live theme tokens and lifecycle cleanup.
## Requirements
### Requirement: Canvas bitmap background follows the resolved theme live

Canvas Webview SHALL repaint its canvas-backed background grid from the current canonical CSS theme tokens when the root resolved theme marker changes. The repaint SHALL preserve the mounted canvas element, Canvas document state, viewport state and host runtime identity.

#### Scenario: User switches from dark to light while Canvas is visible

- **WHEN** Desktop changes the root resolved theme marker from dark to light
- **THEN** the mounted Canvas background SHALL repaint from the light `--canvas-bg`, `--canvas-grid` and `--canvas-grid-major` tokens
- **AND** SHALL NOT require navigation, viewport mutation, page reload or application restart
- **AND** SHALL preserve the current canvas element and document presentation state

#### Scenario: System-resolved theme changes while Canvas is visible

- **WHEN** the selected theme follows the operating system and Desktop updates the root resolved theme marker
- **THEN** Canvas SHALL use the same canonical repaint path as an explicit theme selection
- **AND** SHALL NOT introduce a separate Canvas theme authority

### Requirement: Theme observation is scoped to the bitmap presentation lifecycle

Canvas Webview SHALL create theme observation only while the bitmap grid presentation is mounted and SHALL release that observation on unmount.

#### Scenario: Canvas grid is unmounted

- **WHEN** the CanvasGrid component leaves the visible composition
- **THEN** its root-theme observer SHALL be disconnected
- **AND** later theme changes SHALL NOT retain or update the unmounted Canvas presentation
