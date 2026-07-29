## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the single user-visible library model for browsing,
searching, opening, and diagnosing reusable linked file resources. Desktop MAY expose Directory as a
workspace hierarchy view, but it MUST NOT treat Directory files as Media Library membership or expose
a separate Asset Library, Asset Source catalog, or membership workflow.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below `neko/assets/<libraryName>/`
- **THEN** Media Library returns an entry keyed by the exact workspace-relative locator without
  requiring an AssetEntity or catalog record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been imported
- **THEN** the file can be read, previewed, or referenced directly through the normal content locator
  path
- **AND** it appears in Directory rather than becoming implicit Media Library membership

## ADDED Requirements

### Requirement: Desktop manages filesystem-derived library roots explicitly

Desktop Media Library SHALL expose root availability and distinct add, relink and remove operations
through the canonical linked-library helper. Renderer MUST NOT receive or persist physical link
targets.

#### Scenario: Add a Desktop Media Library

- **WHEN** the user selects a local directory and confirms a portable non-conflicting library name
- **THEN** Host creates the canonical direct link and refreshes the root projection
- **AND** only the safe library name and workspace locator enter renderer state

#### Scenario: Relink an unavailable library

- **WHEN** the user explicitly selects relink for an unavailable root and chooses a replacement target
- **THEN** Host atomically replaces only that library link after validation
- **AND** existing workspace-relative descendant references remain unchanged

#### Scenario: Remove a Desktop Media Library

- **WHEN** the user confirms removal of a library root
- **THEN** Host removes only the link and refreshes the projection
- **AND** target contents, Entity facts, bindings and generated outputs remain unchanged
