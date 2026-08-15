## MODIFIED Requirements

### Requirement: Media Library remains the ordinary external-file owner

The product SHALL retain `MediaLibraryContentLocator(libraryName, relativePath)` as the canonical portable
identity for project-authorized external media. Canvas, Cut, Entity, Search, Resource Browser, document
entry and packaging SHALL preserve this owner identity. Ordinary file discovery SHALL NOT create Asset or
Entity identity.

#### Scenario: Browse a project Media Library file

- **WHEN** a user browses a file in an available project Media Library
- **THEN** Resource Browser returns the exact Media Library locator and owner-preserving capabilities
- **AND** Renderer receives no binding, global connection, Workspace target or physical path

#### Scenario: Use media in another project domain

- **WHEN** Canvas, Cut or Entity stores a reference to the selected external media
- **THEN** it stores the logical Media Library locator
- **AND** it does not persist `neko/assets`, `.neko`, a global connection identity or absolute target

### Requirement: Project access requires exact global registration and local binding

Every successful Media Library operation SHALL resolve the exact project binding and exact registered
global connection before validating the matching managed Workspace link. The runtime MUST NOT resolve by
library name alone, active Workspace, recent target, raw path or a direct-target fallback.

#### Scenario: Binding is missing

- **WHEN** a project fact references a logical Media Library with no reconstructed or confirmed local
  binding
- **THEN** the library remains visible as `required-unlinked` and dependent reads are disabled
- **AND** Project open and unrelated resources remain available

#### Scenario: Global connection is missing

- **WHEN** the project binding references a global connection that no longer exists
- **THEN** the library reports `connection-missing`
- **AND** it does not use a same-named connection or the Workspace link as fallback authority

### Requirement: Resource Browser projections are structurally closed

Tree projections SHALL contain the parent identity referenced by every child and SHALL reject duplicate,
missing-parent or cyclic structures at the package contract boundary. Query results SHALL be standalone
flat rows.

#### Scenario: Expand a linked library root

- **WHEN** Resource Browser loads direct children of a Media Library root
- **THEN** every child references the included stable library-root identity
- **AND** deeper children reference their included directory parent

#### Scenario: Receive a malformed projection

- **WHEN** a projection contains a missing parent or cycle
- **THEN** Resource Browser reports a local unavailable diagnostic
- **AND** the containing Desktop panel and unrelated project surfaces remain mounted

### Requirement: Asset Library remains a distinct explicit package owner

Installed Assets SHALL remain distinct from ordinary Media Library files. Only explicit import/install
creates Asset identity, revision, manifest and package membership.

#### Scenario: Browse global Assets

- **WHEN** the user selects the Assets source
- **THEN** Resource Browser displays installed Asset identities and availability
- **AND** it does not reinterpret registered Media Library directories or their discovered files as Assets
