## ADDED Requirements

### Requirement: Explicit text-file source classification

The system SHALL classify `.md` and `.markdown` sources as Markdown Text nodes and supported plain-text or screenplay-text extensions as plain Text nodes. Generic file addition SHALL NOT create Script nodes. Node format selection SHALL be extension-driven and explicit rather than inferred from content.

#### Scenario: Markdown file enters the document path

- **WHEN** a user drops or selects a `.md` or `.markdown` file for Canvas
- **THEN** the system creates a `TextCanvasNode` snapshot with durable `format: markdown`

#### Scenario: Plain-text file enters the document path

- **WHEN** a user drops or selects a supported plain-text file for Canvas
- **THEN** the system creates a `TextCanvasNode` snapshot with durable `format: plain`

#### Scenario: Fountain enters the plain-text path

- **WHEN** a user drops or selects a `.fountain`, `.nks`, or `.story` file through generic Canvas file addition
- **THEN** the system creates a plain `TextCanvasNode` and does not create or index a Script node

### Requirement: Editable imported text snapshot

The system SHALL persist imported text content in the created `TextCanvasNode` as an editable snapshot together with explicit format and portable source provenance. Absolute paths, Webview URIs, request state, and diagnostics MUST NOT be written to the Canvas document. Later source-file changes SHALL NOT silently overwrite Canvas-authored edits.

#### Scenario: Canvas save excludes projected content

- **WHEN** an imported Markdown or plain-text node is saved
- **THEN** the Canvas persists its content, explicit format, and portable source provenance without runtime handles or absolute paths

### Requirement: Bounded fail-visible text projection

The Extension Host SHALL authorize and resolve text-file sources through the existing Canvas project/path boundary, SHALL reject unsupported, missing, unreadable, oversized, or invalid UTF-8 sources, and SHALL return decoded text only as part of the correlated add-source result used to create the Text node.

#### Scenario: Valid text source is projected

- **WHEN** the Webview requests a supported text file within the byte limit using matching request and node identities
- **THEN** the Extension Host returns decoded text and the Webview creates one Text node snapshot

#### Scenario: Oversized source fails visibly

- **WHEN** the resolved text file exceeds the configured projection byte limit
- **THEN** the Extension Host returns an error diagnostic and no partial or empty-success content

#### Scenario: Invalid UTF-8 fails visibly

- **WHEN** a supported text file cannot be decoded as strict UTF-8
- **THEN** the Extension Host returns an encoding diagnostic and the node displays an error state

#### Scenario: Failed import creates no empty node

- **WHEN** bounded text reading fails
- **THEN** the Webview displays the diagnostic and does not create an empty Text, Document, or Script node

### Requirement: Explicit Markdown and plain-text rendering

The system SHALL render Markdown only when the durable node or document format is Markdown and SHALL render plain text with whitespace preserved when the format is plain. The renderer MUST NOT infer format from content.

#### Scenario: Authored Markdown text displays formatted content

- **WHEN** a `TextCanvasNode` has `format: markdown` and is not in edit mode
- **THEN** headings, lists, emphasis, code, tables, and other supported normalized Markdown semantics are displayed as formatted content

#### Scenario: Authored plain text remains literal

- **WHEN** a `TextCanvasNode` has `format: plain` and contains Markdown punctuation
- **THEN** the punctuation remains literal and whitespace is preserved

#### Scenario: Imported format controls rendering

- **WHEN** an imported text snapshot is displayed
- **THEN** the Text node uses its explicit Markdown or plain format to select the renderer

### Requirement: Safe normalized Markdown display

The shared Markdown document renderer SHALL use the public normalized Markdown contract, SHALL keep raw HTML inert, SHALL prevent unsafe link schemes from becoming navigable, and SHALL NOT fetch embedded images or local resources without an authorized projection.

#### Scenario: Raw HTML remains inert

- **WHEN** Markdown contains raw HTML or a script element
- **THEN** the content is displayed as inert text and no HTML is executed

#### Scenario: Unsafe link is not navigable

- **WHEN** Markdown contains a link with an unsafe scheme
- **THEN** the label remains readable but the renderer does not expose an active unsafe link

#### Scenario: Embedded image performs no implicit fetch

- **WHEN** Markdown contains an image or workspace-relative resource reference without an authorized projection
- **THEN** the renderer displays a non-fetching representation and does not request the referenced resource

### Requirement: Low-chrome text resource layout

The Canvas SHALL use the `BaseNode` boundary as the only resource-card frame for authored text and file-backed text resources. Display mode SHALL let content occupy the node body on an opaque theme surface and SHALL NOT add a permanent nested preview border, divided header/footer, field label, or in-content Open button. A lightweight file label and semantic content borders remain permitted.

#### Scenario: Text resource content fills the node

- **WHEN** a Markdown or plain-text resource node is rendered on Canvas
- **THEN** its scrollable content uses the node body without an additional card shell or permanent toolbar, and Canvas grid or connections do not show through its background

#### Scenario: Open remains accessible without permanent chrome

- **WHEN** a user activates a file-backed text resource or opens its context actions
- **THEN** the resource can be opened without an always-visible Open button inside the content plane

#### Scenario: Editing makes input chrome temporary

- **WHEN** a user explicitly enters edit mode for an authored text node
- **THEN** an editor boundary may appear for the edit session and disappears when display mode resumes

### Requirement: Explicit Script index outcomes

Script resource nodes SHALL track `idle`, `loading`, `ready`, `empty`, and `error` as runtime states. A zero-scene success SHALL render the empty state, and an indexing failure SHALL render the error diagnostic; neither SHALL remain loading.

#### Scenario: Empty Script completes

- **WHEN** Script indexing succeeds with zero scenes
- **THEN** the node leaves loading and displays an empty-state message

#### Scenario: Failed Script reports error

- **WHEN** the Extension Host fails to read or index a Script resource
- **THEN** the node leaves loading and displays the returned error diagnostic

#### Scenario: Ready Script remains content-first

- **WHEN** Script indexing succeeds with one or more scenes
- **THEN** the scene content occupies the node body without a nested header/footer card frame

### Requirement: Semantic low-chrome node headers

The Canvas SHALL use the existing canonical node header path to present a compact, content-first label. Foundational headers SHALL have no gradient strip or divider. Imported Text snapshots SHALL show their explicit source title with a file icon, while authored Text without a title SHALL retain the localized generic label. Spatial group labels SHALL show the group name and an `xN` child count in one floating capsule.

#### Scenario: Imported text exposes source identity

- **WHEN** an imported Text snapshot has a durable title and source provenance
- **THEN** its header displays the source title and file icon without adding a nested content-card border

#### Scenario: Foundational header stays visually quiet

- **WHEN** a foundational Text node is rendered
- **THEN** its header has a transparent background with no gradient strip or bottom divider

#### Scenario: Group label summarizes its children

- **WHEN** a spatial group contains children
- **THEN** its floating label renders the editable group name followed by `xN`
