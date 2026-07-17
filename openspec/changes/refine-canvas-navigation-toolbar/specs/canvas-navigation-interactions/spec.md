## ADDED Requirements

### Requirement: Canvas displays a floating left-side toolbar

The Canvas Webview SHALL render its primary tool actions as a vertically centered, auto-height pill inside the left side of the Canvas surface. The toolbar MUST retain the existing Canvas theme colors, MUST remain bounded within the visible Canvas height, and MUST NOT expose a settings action. Active tool buttons MUST use a circular outline rather than a rounded-square outline, and the visible active circle MUST be smaller than the button hit target while remaining clearly distinguishable from inactive buttons.

#### Scenario: Toolbar does not consume a full-height rail

- **WHEN** the Canvas workspace is visible
- **THEN** the toolbar is overlaid inside the Canvas surface near the left edge
- **AND** its rendered height is based on its controls rather than the Canvas height

#### Scenario: Active tool uses a circular outline

- **WHEN** a Canvas toolbar tool is active
- **THEN** its interactive outline has equal width and height
- **AND** its border radius renders the outline as a circle
- **AND** the visible circle is inset within the button hit target
- **AND** theme-derived background, outline, and foreground colors provide contrast from inactive buttons
- **AND** no separate left-edge indicator is rendered

#### Scenario: Mutually exclusive navigation modes form one visual control

- **WHEN** the user inspects the Select and Hand tools
- **THEN** both buttons are enclosed by one shared segmented pill surface
- **AND** the shared surface visually distinguishes the mutually exclusive mode pair from independent toolbar actions
- **AND** only the active mode receives the inset circular highlight
- **AND** no separator is rendered between the two mode buttons

#### Scenario: Toolbar remains usable in a short viewport

- **WHEN** the visible Canvas height is smaller than the toolbar's natural height plus safety margins
- **THEN** the toolbar remains within the Canvas bounds and allows its controls to scroll

#### Scenario: Settings entry is absent

- **WHEN** the user inspects the Canvas toolbar
- **THEN** no settings button is rendered
- **AND** the removed button's Canvas settings panel is not mounted through a hidden fallback path

### Requirement: Wheel input pans by default and zooms explicitly

The Canvas viewport SHALL translate ordinary wheel input into two-dimensional pan updates. The viewport MUST only translate wheel input into pointer-anchored zoom when `Ctrl` or `Meta` is active, while dedicated zoom controls remain available.

#### Scenario: Vertical wheel pans the viewport

- **WHEN** the pointer is over the Canvas and the user sends an unmodified vertical wheel delta
- **THEN** the viewport pan changes using standard scroll direction
- **AND** viewport zoom remains unchanged

#### Scenario: Horizontal wheel pans the viewport

- **WHEN** the pointer is over the Canvas and the user sends an unmodified horizontal wheel delta
- **THEN** the viewport horizontal pan changes
- **AND** viewport zoom remains unchanged

#### Scenario: Modifier wheel zooms around the pointer

- **WHEN** the user sends wheel input with `Ctrl` or `Meta` active
- **THEN** the viewport zoom changes within the existing limits
- **AND** the canvas coordinate under the pointer remains anchored

### Requirement: Right-button drag pans without replacing context menus

The Canvas SHALL start viewport panning from a right-button drag using the same viewport state owner as existing pan gestures. It MUST suppress the context menu only after pointer movement crosses the configured drag threshold and MUST preserve the existing context menu for a stationary right-button click.

#### Scenario: Right-button drag pans the viewport

- **WHEN** the user presses the right mouse button and drags across the Canvas beyond the threshold
- **THEN** the viewport pan follows the pointer delta
- **AND** the subsequent context menu event is consumed

#### Scenario: Stationary right click opens the existing menu

- **WHEN** the user presses and releases the right mouse button without crossing the drag threshold
- **THEN** the context menu event continues to the existing Canvas context-menu handler

#### Scenario: Existing pan gestures remain available

- **WHEN** the user drags with the middle button, space plus left button, or the hand tool plus left button
- **THEN** the viewport continues to pan through the same canonical handler
