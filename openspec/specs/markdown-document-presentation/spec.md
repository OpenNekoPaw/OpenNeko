# markdown-document-presentation Specification

## Purpose
Keep Markdown table and document presentation readable, bounded and consistent across owning surfaces.
## Requirements
### Requirement: Wide Markdown tables preserve readable columns

Markdown Rich and read-only document surfaces SHALL preserve a stable minimum readable width for GFM table columns instead of compressing every table to the surrounding prose measure. When the table exceeds the visible content width, overflow SHALL remain local to the table presentation.

#### Scenario: A plan contains seven columns

- **WHEN** a Markdown document renders a seven-column planning table in a narrower document pane
- **THEN** every column SHALL retain the shared readable-width baseline
- **AND** the table SHALL expose local horizontal scrolling
- **AND** the surrounding document SHALL NOT acquire horizontal overflow from that table

#### Scenario: A compact surface renders the same table

- **WHEN** the table is rendered inside a compact Canvas or Agent surface
- **THEN** the same table presentation SHALL remain available within the local scroll container
- **AND** it SHALL NOT resize the durable Canvas node or change Markdown source

### Requirement: Markdown table hierarchy is consistent across document surfaces

Text Editor Rich, Canvas immersive Rich and authorized read-only Markdown preview SHALL distinguish table headers from body rows and SHALL use consistent cell padding, borders and vertical alignment derived from existing surface theme tokens.

#### Scenario: User compares edit and preview modes

- **WHEN** the same Markdown table is visible in an editable Rich surface and a read-only full preview
- **THEN** header emphasis, cell spacing and top alignment SHALL express the same hierarchy
- **AND** source text, table column order and row content SHALL remain unchanged

### Requirement: Table presentation does not create an alternate Markdown path

The scrolling presentation SHALL remain a disposable DOM projection of the canonical GFM table. It SHALL NOT introduce a private table schema, alternate parser or serializer, persisted layout metadata, or a second edit authority.

#### Scenario: Rich table is edited and serialized

- **WHEN** the user edits a table cell through the Rich Surface
- **THEN** the existing Milkdown parser and serializer SHALL produce the accepted Markdown source
- **AND** the presentation wrapper SHALL NOT appear in saved Markdown
