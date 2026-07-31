## ADDED Requirements

### Requirement: Media Library connections expose only visible content

Global Media Library connections SHALL project their available external target as a hierarchy of
visible immediate children and bounded visible search results. A dot-prefixed target basename MUST
be rejected when creating or relinking a connection so that every managed connection remains
discoverable and removable.

#### Scenario: Connect a dot-prefixed directory

- **WHEN** the selected external directory basename starts with `.`
- **THEN** the Host rejects the connection with a visible diagnostic
- **AND** it does not create a managed link that the normal browser would hide

#### Scenario: Browse connected visible content

- **WHEN** an available connection contains visible and dot-prefixed child entries
- **THEN** the connection projects only the visible immediate children
- **AND** the external target contents remain unchanged

### Requirement: Media Library visual operations do not change external ownership

The Desktop MUST NOT modify connected external target contents while performing list/grid
presentation, directory activation, thumbnail generation, hover preview, refresh, or search.
Removing a connection MUST continue to remove only the managed link.

#### Scenario: Generate a thumbnail for connected media

- **WHEN** the user views or hovers a supported file below a Media Library connection
- **THEN** Host reads the exact file only to produce a transient thumbnail representation
- **AND** it does not copy, rename, write metadata into, or create Asset Library membership for the file

#### Scenario: Remove a connection after browsing

- **WHEN** the user confirms removal of a Media Library after navigating or previewing its contents
- **THEN** the Host unlinks only the managed connection
- **AND** every external directory and file remains unchanged

#### Scenario: Reject Asset deletion against connected media

- **WHEN** a connected Media Library item identity is submitted to an Asset Library remove command
- **THEN** the Host rejects the ownership mismatch before invoking the system trash
- **AND** the external target remains unchanged
