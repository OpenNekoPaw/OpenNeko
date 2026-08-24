## ADDED Requirements

### Requirement: Primary controls consume canonical button semantics

Renderer and Webview primary controls SHALL consume the canonical button background, foreground and hover tokens. Accent and focus tokens SHALL remain available for selection, emphasis and focus presentation and SHALL NOT be the primary control background when canonical button tokens are present.

#### Scenario: Character or World management renders a primary action in the light theme

- **WHEN** Desktop projects the resolved light theme tokens
- **THEN** create/import primary actions SHALL use `--neko-button-background` and `--neko-button-foreground`
- **AND** SHALL NOT use the neutral focus/accent value as their successful primary background

#### Scenario: A shared default Button renders in a Desktop Webview

- **WHEN** a consumer renders the default `@neko/ui` Button or IconButton variant
- **THEN** the primitive SHALL use the canonical button tokens
- **AND** its focus indication SHALL continue to use the canonical focus token

### Requirement: Actionable secondary controls remain visually distinct from disabled state

Enabled secondary controls SHALL use the canonical secondary button foreground and background semantics. Muted text and opacity SHALL be reserved for non-actionable metadata or true disabled/unavailable states.

#### Scenario: User views enabled management or Composer controls

- **WHEN** an enabled secondary action, model control or mode control is visible in the light theme
- **THEN** its label SHALL use the canonical secondary action foreground
- **AND** SHALL NOT receive disabled-state opacity merely because it is not the primary action

### Requirement: Light-theme supporting copy preserves canonical contrast

Package-local light-theme presentation SHALL preserve canonical secondary and muted foreground tokens without additional alpha dilution that makes ordinary supporting copy unreadable.

#### Scenario: Agent empty or supporting copy renders in the light theme

- **WHEN** Agent presentation resolves its light-theme semantic variables
- **THEN** ordinary supporting copy SHALL resolve from the canonical secondary foreground
- **AND** muted copy SHALL resolve from the canonical muted foreground
- **AND** SHALL NOT re-mix the canonical foreground to a lower alpha as a second theme authority

#### Scenario: Character or World card presents description and metadata

- **WHEN** a management card is visible at the default Desktop font scale
- **THEN** meaningful description text SHALL use secondary foreground semantics
- **AND** compact metadata SHALL remain legible without combining the muted foreground with an unnecessarily smaller presentation size
