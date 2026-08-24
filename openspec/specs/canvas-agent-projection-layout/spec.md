# canvas-agent-projection-layout Specification

## Purpose

Define compact, non-overlapping placement and default sizing for newly projected Agent artifacts on Canvas.

## Requirements

### Requirement: Agent projections use a compact five-column row

Canvas SHALL place newly projected top-level Agent artifacts in rows containing at most five nodes. Horizontal candidates SHALL use the authored node's actual width plus a compact gap instead of a fixed role-lane width, and SHALL NOT overlap existing top-level nodes.

#### Scenario: Five independent image deliveries are projected

- **WHEN** Agent projects five independent image artifacts into an empty Workspace Board
- **THEN** all five nodes SHALL occupy distinct horizontal positions in one row
- **AND** adjacent image nodes SHALL use the compact content gap
- **AND** no projected rectangles SHALL overlap

#### Scenario: A sixth artifact is projected

- **WHEN** five candidate positions in the current row are occupied
- **THEN** Canvas SHALL place the sixth artifact on a later row
- **AND** SHALL preserve all creator-owned positions and sizes already present

### Requirement: Generated batches use at most five columns

Canvas SHALL lay out a generated media batch with `min(5, artifact count)` columns and compute the containing Group size from every child's uncropped canonical size.

#### Scenario: A batch contains five generated images

- **WHEN** Agent delivers five related generated images in one batch
- **THEN** the Group layout SHALL declare five columns
- **AND** every child SHALL appear in the same row inside the Group bounds

#### Scenario: A batch contains more than five generated images

- **WHEN** Agent delivers six or more generated images in one batch
- **THEN** the sixth image SHALL begin a second row
- **AND** no child SHALL be clipped by the Group bounds

### Requirement: Readable text nodes share one canonical authoring size

Canvas SHALL use a 240×160 canonical default size for newly created Markdown nodes and file references recognized as Markdown, JSON or plain text. Non-text files SHALL retain the generic file default, and an explicit creator size SHALL remain authoritative.

#### Scenario: Agent projects Markdown and a Markdown file reference

- **WHEN** Agent projects a Markdown artifact and a `text/markdown` file reference without explicit sizes
- **THEN** both nodes SHALL be created at 240×160
- **AND** their content SHALL remain scrollable inside the card

#### Scenario: Agent projects an unsupported binary file

- **WHEN** a file reference is not recognized as a text-preview kind
- **THEN** Canvas SHALL use the generic file default size
- **AND** SHALL NOT infer text eligibility from runtime availability or fallback content

#### Scenario: Creator supplies a size

- **WHEN** Headless authoring creates a text reference with an explicit finite positive size
- **THEN** Canvas SHALL preserve that size instead of applying the text default

### Requirement: Text titles remain visually subordinate to content

Canvas Webview SHALL render Markdown and text-reference titles at a smaller visual size than their primary document content, without shrinking media labels globally.

#### Scenario: Markdown and image nodes render together

- **WHEN** the Webview renders a Markdown node and an image node
- **THEN** the Markdown title SHALL use the compact text-title presentation
- **AND** the image label SHALL retain the media label presentation
