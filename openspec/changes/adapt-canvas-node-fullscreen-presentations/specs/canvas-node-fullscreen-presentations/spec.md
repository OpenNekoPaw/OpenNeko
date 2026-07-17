## ADDED Requirements

### Requirement: Node descriptors declare fullscreen eligibility and presentation

The Canvas SHALL expose fullscreen only when the current node's descriptor resolves a supported fullscreen presentation, and both NodeHeader and selection-toolbar entry points SHALL use that same resolver. A descriptor MAY return a static presentation or derive the final presentation from durable material metadata on the current node.

#### Scenario: Supported node exposes fullscreen consistently

- **WHEN** a selected node descriptor declares a fullscreen presentation
- **THEN** every applicable Canvas fullscreen entry point SHALL open the same presentation for that node

#### Scenario: Material selects a specialized presentation

- **GIVEN** one node type can carry multiple media kinds
- **WHEN** its descriptor resolves fullscreen for the current node
- **THEN** the final presentation SHALL be selected from durable material metadata rather than from Canvas card chrome
- **AND** the resolved presentation SHALL remain transient UI state

#### Scenario: Unsupported node has no no-op fullscreen action

- **WHEN** a node descriptor does not declare a fullscreen presentation
- **THEN** Canvas SHALL NOT expose a generic fullscreen action for that node
- **AND** attempting to resolve an unsupported overlay programmatically SHALL fail visibly instead of presenting empty content

### Requirement: Text fullscreen preserves the durable format contract

The Canvas SHALL render generic Text nodes in fullscreen according to `TextCanvasNode.data.format`, with preview as the default state and editing entered explicitly.

#### Scenario: Markdown text opens as a formatted document

- **GIVEN** a Text node whose durable format is `markdown`
- **WHEN** the user opens it fullscreen
- **THEN** the overlay SHALL use the shared safe Markdown renderer
- **AND** Markdown headings, lists, block quotes, code, links, and tables SHALL NOT appear as raw source syntax

#### Scenario: Plain text opens literally

- **GIVEN** a Text node whose durable format is `plain`
- **WHEN** the user opens it fullscreen
- **THEN** the overlay SHALL display the literal content
- **AND** whitespace and line breaks SHALL be preserved
- **AND** Markdown-looking characters SHALL NOT be interpreted as formatting

#### Scenario: User explicitly edits text

- **GIVEN** a Text node is open in fullscreen preview
- **WHEN** the user activates edit mode and changes the content
- **THEN** Canvas SHALL update that node's content through the existing node-data update path
- **AND** returning to preview SHALL render the updated content according to the same durable format

#### Scenario: Fullscreen uses the resource display title

- **GIVEN** an imported Text node has an explicit or provenance-derived resource name
- **WHEN** the user opens it fullscreen
- **THEN** the overlay title SHALL match the Canvas node header title instead of falling back to the generic localized node type

### Requirement: Visual media uses an immersive fullscreen stage

The Canvas SHALL render fullscreen visual media on an opaque dark stage that uses the available overlay body and preserves the media aspect ratio.

#### Scenario: Portrait image fills available height without cropping

- **GIVEN** a portrait image Media node
- **WHEN** the user opens it fullscreen
- **THEN** the stage SHALL center the image within the available body
- **AND** the image SHALL use contain sizing without cropping
- **AND** the fullscreen path SHALL NOT apply the contained preview's `52vh` height cap

#### Scenario: Image uses a frameless zoomable viewer

- **GIVEN** a Media node whose durable media type is `image`
- **WHEN** the user opens it fullscreen
- **THEN** Canvas SHALL resolve the `image-viewer` presentation
- **AND** the viewer SHALL NOT render the Canvas node frame or generic node header
- **AND** a close control SHALL remain visible at the top-right
- **AND** bottom-centered controls SHALL show the current zoom percentage with zoom-out and zoom-in actions
- **AND** zoom SHALL remain bounded and transient

#### Scenario: Non-image media keeps the visual stage

- **GIVEN** a Media node whose durable media type is video or audio
- **WHEN** the user opens it fullscreen
- **THEN** Canvas SHALL resolve the existing `visual-stage` presentation
- **AND** image-only zoom controls SHALL NOT be rendered

#### Scenario: Embedded media sizing remains unchanged

- **WHEN** the same Media node is rendered inside the Canvas or a contained workbench block
- **THEN** the existing embedded sizing contract SHALL remain in effect

### Requirement: Creator nodes use explicit workbench presentations

The Canvas SHALL preserve specialized creator overlays and SHALL constrain generic structured fullscreen content to a readable opaque workbench with one vertical scroll owner.

#### Scenario: Shot uses its specialized creator workbench

- **GIVEN** a Shot node declares the Shot workbench presentation
- **WHEN** the user opens it fullscreen
- **THEN** Canvas SHALL render the existing Shot creator overlay
- **AND** SHALL NOT route it through the generic text or media presentation

#### Scenario: Generic structured content has one scroll owner

- **GIVEN** a node declares the generic workbench presentation
- **WHEN** its content exceeds the viewport
- **THEN** the workbench body SHALL own vertical scrolling
- **AND** its content SHALL be centered within a bounded readable width
- **AND** nested generic containers SHALL NOT create a competing full-panel vertical scrollbar

### Requirement: Fullscreen overlay remains dismissible and transient

Fullscreen presentation state SHALL remain transient UI state and SHALL not change the persisted Canvas node schema.

#### Scenario: User dismisses fullscreen

- **WHEN** the user activates the close control or presses Escape
- **THEN** the overlay SHALL close
- **AND** transient presentation state SHALL be discarded
- **AND** saved node content SHALL remain unchanged
