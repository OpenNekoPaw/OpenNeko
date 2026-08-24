# authorized-epub-preview-publication Specification

## Purpose
Publish authorized EPUB resource trees through the Preview owner while keeping ordinary file preview on its canonical path.
## Requirements
### Requirement: Authorized EPUB Preview uses one virtual directory publication path

Every authorized EPUB Preview consumer SHALL publish the exact selected EPUB through the Preview-owned Node resource-tree publisher. The renderer-visible base URL SHALL end with `/`, and the consumer SHALL NOT use the ordinary single-file publication path for EPUB.

#### Scenario: User selects a valid Media Library EPUB

- **WHEN** Asset Center resolves an available file with media type `application/epub+zip`
- **THEN** Preview indexes the archive and publishes its entries as one authorized virtual resource tree
- **AND** the EPUB Viewer receives a trailing-slash opaque base URL
- **AND** the selected file path is not exposed to the renderer

### Requirement: EPUB publication validates the canonical container descriptor

The publisher SHALL require `META-INF/container.xml` before registering a successful resource tree.

#### Scenario: Selected archive is not a valid EPUB container

- **WHEN** the archive lacks `META-INF/container.xml`
- **THEN** publication rejects the current Preview with a clear diagnostic
- **AND** no single-file fallback or partial resource registration succeeds
- **AND** sibling records and management operations remain available

### Requirement: EPUB resource lifetime follows the exact Preview lease

The archive reader SHALL remain available only while the authorized resource-tree lease is active and SHALL be disposed on publication failure or exact session release.

#### Scenario: User replaces or closes the selected Preview

- **WHEN** the owning Preview session releases its resource registration
- **THEN** the corresponding archive reader is disposed
- **AND** no unrelated Preview session or library record is released

### Requirement: Non-EPUB files preserve their canonical publication path

The EPUB cutover SHALL NOT reroute ordinary previewable files through archive publication.

#### Scenario: User selects a PNG after an EPUB

- **WHEN** Asset Center resolves an available PNG file
- **THEN** the existing authorized single-file publisher is used
- **AND** no EPUB archive reader or virtual tree is created
