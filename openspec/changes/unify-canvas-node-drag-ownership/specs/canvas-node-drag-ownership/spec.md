## ADDED Requirements

### Requirement: Node frame owns ordinary drag gestures
Canvas Webview SHALL route a primary-button drag started from a node Header or non-interactive node content surface through the same node-level movement path.

#### Scenario: Drag ordinary node content
- **WHEN** a user presses and drags an ordinary non-interactive content surface inside a Canvas node
- **THEN** the owning node movement gesture starts with that node identity
- **AND** no content-level drag operation starts

#### Scenario: Drag a child node inside a container
- **WHEN** a user presses and drags a child node located within a spatial container
- **THEN** the child node movement gesture starts with the child node identity
- **AND** the rendered material inside the child node is not dragged independently

### Requirement: Node content cannot start native material dragging
Canvas Webview MUST cancel browser-native drag initiation originating anywhere inside a rendered node.

#### Scenario: Drag an image or rendered material
- **WHEN** browser-native `dragstart` originates from an image, text, link preview, or other rendered material inside a node
- **THEN** the event is canceled at the owning node boundary
- **AND** the Webview produces no native content drag payload or drag preview

### Requirement: Explicit content interactions retain gesture ownership
Canvas Webview SHALL exclude interactive controls, editable regions, scrollbar hit areas, and explicitly declared complex interaction surfaces from node movement initiation.

#### Scenario: Use an interactive control
- **WHEN** a user presses a button, input, textarea, select, link, slider, textbox, contenteditable region, or explicit drag-block surface inside a node
- **THEN** the control or surface retains the gesture
- **AND** the node movement gesture does not start

#### Scenario: Use a content scrollbar
- **WHEN** a user presses within a detected scrollbar hit area of scrollable node content
- **THEN** the scrollbar interaction remains available
- **AND** the node movement gesture does not start
