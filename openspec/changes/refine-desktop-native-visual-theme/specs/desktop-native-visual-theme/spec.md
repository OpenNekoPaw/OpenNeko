## ADDED Requirements

### Requirement: Desktop uses a native visual hierarchy

The Desktop renderer MUST default to the operating system's resolved light or dark appearance with
distinct window, chrome, primary surface, elevated control and overlay levels. Main, Primary Rail
and Docks MUST remain visually distinct without relying on a VS Code editor tab row, status bar or
full-height IDE divider treatment.

#### Scenario: Content Project opens

- **WHEN** a Content Project renders in the Desktop window
- **THEN** the window background, Primary Rail, Main Creative Surface and visible Dock use distinct
  semantic Desktop theme surfaces
- **AND** Main and Dock boundaries use Desktop spacing, radius and elevation rather than a global
  VS Code editor frame

### Requirement: Desktop extends the shared theme contract

Desktop MUST apply the shared `--neko-*` light or dark theme selected by the system appearance and
MAY add Desktop-owned composition tokens. It MUST NOT create a parallel component token system or
change the default VS Code Webview theme. VS Code compatibility variables required by package Roots
MUST map to the same Desktop semantics.

#### Scenario: Package Root mounts in Desktop

- **WHEN** Agent, Canvas, Assets, Cut or Preview mounts through its public Root
- **THEN** it consumes the shared theme semantics projected by Desktop
- **AND** Desktop does not copy its controls, commands or internal store to obtain the visual result

### Requirement: Desktop controls have consistent interaction states

Icon controls, segmented controls, inputs, popovers and floating toolbars MUST provide bounded
desktop-sized hit targets and visible hover, pressed, disabled and keyboard-focus states. State
MUST NOT be communicated by color alone.

#### Scenario: User navigates controls by keyboard

- **WHEN** keyboard focus enters Primary Rail, display controls, Agent input or a floating toolbar
- **THEN** the focused control exposes a visible accent focus ring without shifting layout
- **AND** its accessible name and selected or pressed state remain available

### Requirement: Creative surfaces preserve package ownership

Desktop MUST style only the host frame and shared theme projection around package-owned Roots.
Canvas and Model viewport tools MUST remain package-owned bottom-centered toolbars, and Agent
conversation controls MUST remain inside the Agent Root.

#### Scenario: Canvas and Agent are visible together

- **WHEN** a layout displays Canvas Main with an Agent Dock
- **THEN** Canvas commands continue through the Canvas Root and Agent commands continue through the
  Agent Root
- **AND** Desktop contributes only layout, clipping, surface and theme semantics

### Requirement: Theme remains usable across platform display modes

The Desktop visual theme MUST preserve supported minimum Main sizing, 1x/2x DPI clarity,
high-contrast focus visibility and reduced-motion behavior. Decorative translucency MUST have a
non-blurred fallback.

#### Scenario: Accessibility preferences reduce visual effects

- **WHEN** the operating environment requests reduced motion, increased contrast or reduced
  transparency
- **THEN** transitions and blur are removed or reduced while structure, focus and selection remain
  visible
- **AND** no domain surface or interaction becomes unavailable

### Requirement: Desktop follows the operating-system light and dark appearance

Desktop MUST resolve its visual theme from the operating-system color scheme at startup and MUST
update the existing renderer when that scheme changes. Light and dark modes MUST project matching
shared tokens, Desktop composition tokens, compatibility tokens, datasets and CSS `color-scheme`
through one canonical theme path.

#### Scenario: Operating-system appearance changes while Desktop is open

- **WHEN** the operating system changes from light to dark or dark to light
- **THEN** the existing Desktop window updates without reload
- **AND** Main, Primary Rail, Agent, Resource Browser, Canvas chrome and overlays consume the newly
  resolved semantic theme
- **AND** no light-only compatibility token remains active in dark mode

### Requirement: Native window background matches the resolved appearance

Electron Main MUST choose a light or dark native BrowserWindow background from
`nativeTheme.shouldUseDarkColors` and MUST synchronize that background for existing windows after a
system theme update.

#### Scenario: Desktop launches while macOS uses dark appearance

- **WHEN** Electron creates a Desktop BrowserWindow while the native theme is dark
- **THEN** the native background is dark before the renderer paints
- **AND** the renderer resolves the same dark appearance
- **AND** no light window flash is presented around the package-owned surfaces
