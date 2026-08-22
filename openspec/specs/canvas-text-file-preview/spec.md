# canvas-text-file-preview Specification

## Purpose
TBD - created by archiving change preview-text-files-on-canvas. Update Purpose after archive.
## Requirements
### Requirement: Authorized bounded text projection

The system SHALL obtain Canvas File-node text previews only through the active workspace's authorized `ContentLocator` and the canonical Host content-read service. The Canvas-owned service MUST enforce a fixed byte limit, and the Webview MUST NOT receive a raw local path or choose a larger limit.

#### Scenario: Eligible referenced text file is read

- **WHEN** an active Canvas File node references an eligible text resource with a valid `ContentLocator`
- **THEN** the Host SHALL validate the exact Canvas identity, node identity and current locator before returning a bounded preview projection

#### Scenario: Oversized source is requested

- **WHEN** an eligible referenced text resource exceeds the Canvas preview byte limit
- **THEN** the affected node SHALL receive an explicit local size diagnostic without an unbounded read or a fallback source

#### Scenario: Request attempts to use a stale locator

- **WHEN** a request locator does not exactly match the current authoritative locator of the specified File node
- **THEN** the Host SHALL reject that request without reading the resource or affecting another node

### Requirement: Format-specific read-only presentation

The system SHALL present valid JSON as formatted structured text, referenced Markdown through the shared read-only Markdown renderer, and supported plain text as a line-preserving excerpt. It MUST keep the existing generic file-icon presentation for unsupported or binary files and MUST NOT convert a File node into an editable Markdown snapshot.

#### Scenario: Valid JSON file is previewed

- **WHEN** the Host reads a valid UTF-8 JSON File-node resource
- **THEN** the node SHALL show a bounded two-space-indented JSON excerpt with a JSON format indication

#### Scenario: Referenced Markdown file is previewed

- **WHEN** the Host reads a valid UTF-8 Markdown File-node resource
- **THEN** the node SHALL render the bounded content read-only while the filename remains in the existing external label

#### Scenario: Plain-text file is previewed

- **WHEN** the Host reads a supported UTF-8 plain-text File-node resource
- **THEN** the node SHALL show a bounded monospace excerpt that preserves line breaks

#### Scenario: Empty text file is previewed

- **WHEN** an eligible text File-node resource contains no text
- **THEN** the node SHALL show an explicit empty-file state rather than a blank card

#### Scenario: Unsupported file is displayed

- **WHEN** a File node references a binary or unknown format
- **THEN** the node SHALL retain the generic file icon and SHALL NOT attempt an alternative content renderer

### Requirement: Local and visible projection failure

The system MUST keep missing, unauthorized, unreadable, malformed, invalid UTF-8 and oversized preview failures visible within the affected File node. A failed preview MUST NOT become a successful raw-text result, clear sibling content or make the Canvas workspace unavailable.

#### Scenario: JSON is malformed

- **WHEN** a JSON File node contains malformed JSON
- **THEN** that node SHALL show an invalid-JSON diagnostic and SHALL NOT fall back to displaying the raw source as a successful preview

#### Scenario: Content access is denied

- **WHEN** the content service rejects a File-node locator as unauthorized
- **THEN** that node SHALL show an unavailable diagnostic while sibling nodes remain usable

#### Scenario: One preview read fails

- **WHEN** one File-node preview returns a read diagnostic
- **THEN** the Canvas SHALL retain valid previews and interactions for all unrelated nodes

### Requirement: Projection lifecycle isolation

The Webview MUST bind each preview response to the exact node, locator and request identity that initiated it. It MUST ignore stale responses after locator replacement, node removal, workspace change or unmount, and MUST NOT retain preview presentation state after the owning node is disposed.

#### Scenario: Locator changes during a read

- **WHEN** a File node receives a new authoritative locator before an earlier preview request completes
- **THEN** the Webview SHALL ignore the earlier response and display only the result for the current locator

#### Scenario: File node unmounts during a read

- **WHEN** a File node is removed or its Canvas Root unmounts before a preview request completes
- **THEN** the pending presentation SHALL be disposed without updating another node or retaining a hidden UI owner

### Requirement: Preview remains a disposable projection

The system MUST NOT store source text, formatted excerpts, loading state or preview diagnostics in `FileCanvasNode` durable data or the Canvas document. Existing editable Markdown nodes MUST retain their current Canvas-owned snapshot semantics.

#### Scenario: Canvas document is saved after previewing a file

- **WHEN** a user previews one or more referenced text File nodes and saves the Canvas document
- **THEN** the persisted File-node facts SHALL remain limited to the existing canonical fields without preview content or status

#### Scenario: Existing Markdown node is used

- **WHEN** a Canvas contains an editable Markdown snapshot node
- **THEN** its rendering, editing and persistence behavior SHALL remain unchanged by File-node preview support
