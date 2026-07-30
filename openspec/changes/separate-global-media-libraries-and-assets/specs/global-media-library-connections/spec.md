## ADDED Requirements

### Requirement: Media libraries are directory connections

The Desktop application SHALL represent every global Media Library as a connection to one external directory. Adding a connection MUST NOT copy the directory into the Asset Library or create asset membership.

#### Scenario: Connect a local directory

- **WHEN** the user selects an accessible local directory and confirms a Media Library type and name
- **THEN** the Host creates a managed directory link and the original directory remains the file authority

#### Scenario: Connect mounted NAS or synchronized cloud storage

- **WHEN** the user selects an accessible mounted NAS directory or cloud-synchronized directory
- **THEN** the Host records the connection as the selected location type while continuing to use ordinary filesystem access

#### Scenario: Reject unsupported remote URL

- **WHEN** the user provides a remote location for which no provider and credential owner exists
- **THEN** the operation fails visibly and does not create a placeholder library

### Requirement: Media libraries preserve directory structure

The Desktop application SHALL expose a connected Media Library as a hierarchy of its root, directories, and files. Search results MUST retain the owning connection identity and library-relative path.

#### Scenario: Browse a connected directory tree

- **WHEN** the user opens a Media Library and enters a child directory
- **THEN** the application lists that directory's immediate children without flattening or copying them into the Asset Library

#### Scenario: Search connected files

- **WHEN** the user searches across Media Libraries
- **THEN** matching files identify their library and relative directory while remaining external file resources

### Requirement: Removing a Media Library removes only the connection

The Desktop application SHALL remove a global Media Library by deleting only its managed link. It MUST NOT trash, delete, move, or modify the target directory or its contents.

#### Scenario: Remove an available connection

- **WHEN** the user confirms removal of an available Media Library
- **THEN** the managed link is removed and every target file remains unchanged

#### Scenario: Remove an unavailable connection

- **WHEN** the user removes a broken or offline Media Library connection
- **THEN** the managed link is removed without requiring target availability

### Requirement: Media Library identity does not expose targets

Renderer-facing contracts SHALL identify a Media Library by safe type, name, and relative locator. They MUST NOT expose absolute targets, credentials, Webview URLs, or asset IDs.

#### Scenario: Project a Media Library card

- **WHEN** Main returns a Media Library search result
- **THEN** the result contains safe display metadata and availability but no absolute target path
