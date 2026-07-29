## ADDED Requirements

### Requirement: Main view tabs use editor-native visual hierarchy

The system SHALL render Main view tabs through the shared Workbench editor-tab primitive with bounded labels, a distinct active state, hover and keyboard-focus feedback, and close affordances that do not dominate inactive tabs.

#### Scenario: Active and inactive tabs are distinguishable

- **WHEN** a Main group contains multiple open views
- **THEN** the active tab SHALL use the editor surface and an active indicator
- **AND** inactive tabs SHALL remain visually subordinate while retaining readable labels

#### Scenario: Long labels remain bounded

- **WHEN** a Main view label exceeds the available tab width
- **THEN** the label SHALL truncate without expanding the Main group beyond its available width
- **AND** the tab strip SHALL remain horizontally navigable when the complete set does not fit

#### Scenario: Close affordance remains accessible

- **WHEN** a closable tab is active, hovered, or keyboard-focused
- **THEN** its close action SHALL be visible and operable
- **AND** activating close SHALL not activate the underlying tab first

### Requirement: Project layout selection belongs to the primary sidebar

The system SHALL expose the Chat/Main display-mode selector from the project primary sidebar footer immediately before the Settings action, while retaining `DesktopWorkbenchLayoutProjection.display` as the only mutable state owner.

#### Scenario: Project layout menu opens from primary navigation

- **WHEN** a content project is active
- **THEN** the primary sidebar footer SHALL expose a display-mode button with an accessible label
- **AND** opening it SHALL show Chat plus Main, Chat-left, Chat-right, Chat-only, and Main-only choices

#### Scenario: Display selection uses the canonical Workbench mutation

- **WHEN** the user selects a display mode from the primary sidebar
- **THEN** the renderer SHALL submit the result of the existing Workbench display-mode operation
- **AND** it SHALL NOT write an application preference or create a second display-state owner

#### Scenario: Home does not expose project layout selection

- **WHEN** Home rather than a content project is active
- **THEN** the primary sidebar footer SHALL retain Settings
- **AND** it SHALL NOT render the project display-mode selector

### Requirement: Main content has no floating global layout toolbar

The system SHALL keep Main content chrome focused on document tabs and split actions and SHALL NOT overlay global display or Timeline buttons over the active document.

#### Scenario: Main content renders without floating controls

- **WHEN** a project Main view is rendered
- **THEN** no absolute-positioned Workbench display toolbar SHALL cover the document surface
- **AND** split-right and split-down actions SHALL remain in the owning Main group tab strip

#### Scenario: Timeline has no standalone global toggle

- **WHEN** project Workbench chrome is rendered
- **THEN** it SHALL NOT expose a standalone Timeline button
- **AND** Cut-owned Timeline presentation SHALL continue to render from explicit Workbench Timeline state

### Requirement: Sidebar layout control is accessible in compact and expanded modes

The system SHALL preserve the display-mode button's accessible name, tooltip, and operability in both expanded and compact primary-sidebar presentations.

#### Scenario: Compact sidebar retains layout access

- **WHEN** the primary sidebar is compact
- **THEN** the display-mode control SHALL remain available as an icon action
- **AND** its accessible label and tooltip SHALL identify it as the display-mode selector

### Requirement: Main tab activation preserves creative runtime identity

The system SHALL treat Main tab activation as a visibility selection and SHALL keep every open Main view's keyed runtime mounted until that view is closed or removed from its group.

#### Scenario: Switching away from Cut preserves its runtime

- **GIVEN** a Cut view owns both Preview and a docked Timeline
- **WHEN** the user activates another Main tab
- **THEN** the original Cut editor runtime SHALL remain mounted with the same view identity and epoch
- **AND** Desktop SHALL NOT create a second Timeline-only Cut runtime

#### Scenario: Timeline remains attached to its Cut owner

- **GIVEN** a docked Timeline names an open Cut view as its owner
- **WHEN** another view in the same Main group is active
- **THEN** the Timeline portal target SHALL remain attached to the owning Cut root
- **AND** Preview playback and Timeline commands SHALL continue through that single Cut bridge

#### Scenario: Closing a tab releases its runtime

- **WHEN** an open Main view is closed and removed from its group
- **THEN** its keyed runtime SHALL unmount and dispose
- **AND** no hidden orphan runtime SHALL remain
