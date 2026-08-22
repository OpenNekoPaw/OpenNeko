## ADDED Requirements

### Requirement: Right-pointer release distinguishes click from pan

Canvas SHALL treat a right-button press as a pending viewport gesture. It SHALL activate panning only after pointer displacement reaches 4 CSS pixels, and SHALL classify release without relying on the browser's native `contextmenu` timing.

#### Scenario: Right pointer is released without movement

- **WHEN** the user presses and releases the right mouse button within the movement threshold
- **THEN** Canvas SHALL open the existing context menu at the release coordinates
- **AND** SHALL preserve the exact release target for Canvas-versus-node menu selection
- **AND** SHALL NOT change the viewport

#### Scenario: Pointer jitter remains below the threshold

- **WHEN** the right pointer moves less than 4 CSS pixels before release
- **THEN** Canvas SHALL treat the gesture as a right click
- **AND** SHALL NOT apply a partial viewport pan

#### Scenario: Right pointer crosses the drag threshold

- **WHEN** right-pointer displacement reaches at least 4 CSS pixels
- **THEN** Canvas SHALL pan from the original press position
- **AND** SHALL NOT open a context menu during or after that gesture

### Requirement: Native mouse context-menu timing does not own the gesture

Canvas SHALL prevent and stop mouse-originated native right-button `contextmenu` events at the viewport, whether they occur after press or after release. Keyboard-originated context-menu events SHALL remain available to the existing menu owner.

#### Scenario: Chromium dispatches contextmenu immediately after mousedown

- **WHEN** a mouse `contextmenu` event occurs before pointer movement or release
- **THEN** Canvas SHALL suppress that native event
- **AND** SHALL keep the pending right-pointer gesture active

#### Scenario: Chromium dispatches contextmenu after a completed drag

- **WHEN** a mouse `contextmenu` event occurs after right-button panning ends
- **THEN** Canvas SHALL suppress that native event
- **AND** SHALL NOT open the application menu

#### Scenario: Keyboard requests a context menu

- **WHEN** the focused Canvas receives a keyboard-originated context-menu event
- **THEN** the event SHALL reach the existing Canvas menu owner
- **AND** SHALL NOT start viewport panning

### Requirement: Adjacent Canvas gestures remain unchanged

Middle-button pan, Space-plus-left-button pan, hand-tool pan, node drag, marquee selection, wheel pan and modifier-wheel zoom SHALL retain their existing owners and semantics.

#### Scenario: User pans with the middle button

- **WHEN** the user drags with the middle mouse button
- **THEN** Canvas SHALL pan immediately without applying the right-click threshold
- **AND** SHALL NOT request the context menu
