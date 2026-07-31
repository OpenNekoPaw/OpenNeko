## ADDED Requirements

### Requirement: Users can import owned asset files

The Desktop Asset Library SHALL let the user select one or more supported regular files through a
native Host picker and import each selected file as OpenNeko-owned content. Renderer MUST NOT receive
the selected physical source paths, and import MUST NOT create a Media Library connection.

#### Scenario: Import one asset

- **WHEN** the user selects a supported regular file whose destination name is available
- **THEN** Host copies the bytes through an operation-owned staging file and publishes the owned asset without replacement
- **AND** the refreshed Asset Library returns a new stable asset identity

#### Scenario: Import multiple assets

- **WHEN** the user selects multiple supported regular files
- **THEN** Host returns an explicit per-file added, conflict, or rejected outcome
- **AND** the UI reports partial results without claiming failed files were imported

#### Scenario: Cancel asset selection

- **WHEN** the user cancels the native file picker
- **THEN** the operation returns an explicit cancelled outcome
- **AND** the Asset Library root remains unchanged

#### Scenario: Asset name conflicts

- **WHEN** an import destination already exists or becomes occupied before publication
- **THEN** Host reports a conflict and preserves both the existing asset and selected source
- **AND** it does not overwrite, merge, silently rename, or expose a partial destination as an asset

#### Scenario: Reject unsupported or unsafe input

- **WHEN** a selected input is a directory, symbolic link, unsupported material, missing file, or non-regular file
- **THEN** Host reports a rejected outcome without following or copying it
- **AND** other selected regular files retain their independent outcomes

### Requirement: Users can safely remove owned asset files

The Desktop Asset Library SHALL remove only a currently projected OpenNeko-owned regular file after
explicit user confirmation by moving it to the operating-system trash. Directory deletion,
permanent deletion, hidden staging deletion, and Media Library target deletion are outside this
operation.

#### Scenario: Remove a current owned asset

- **WHEN** the user confirms removal of a current Asset Library item
- **THEN** Main revalidates its identity, expected catalog revision, root containment, and regular-file ownership
- **AND** the operating-system trash receives that exact file before the refreshed projection omits it

#### Scenario: Cancel asset removal

- **WHEN** the user declines the confirmation
- **THEN** Renderer sends no remove command
- **AND** the asset remains unchanged

#### Scenario: Remove request is stale or unsafe

- **WHEN** the asset is missing, stale, a directory, a symbolic link, hidden staging content, outside the owned root, or not an Asset Library identity
- **THEN** Main rejects the request before invoking the system trash
- **AND** it does not return a successful removed result

#### Scenario: System trash fails

- **WHEN** the operating system cannot move the validated asset to trash
- **THEN** the operation returns a visible diagnostic and retains the current catalog projection
- **AND** it does not fall back to permanent deletion or optimistic success

### Requirement: Asset mutations are serialized and observable

Asset import and remove operations SHALL be serialized by the Asset Library owner and SHALL expose
pending, cancelled, partial, successful, conflict, rejected, and failed outcomes. A mutation result
MUST trigger a fresh owner projection before the UI claims the final catalog state.

#### Scenario: Mutation is pending

- **WHEN** an import or remove operation is in progress
- **THEN** conflicting Asset Library mutations are disabled in that browser instance
- **AND** Media Library read-only browsing remains independent

#### Scenario: Mutation completes with mixed import outcomes

- **WHEN** a multi-file import adds some files and rejects or conflicts with others
- **THEN** the UI refreshes the Asset Library and reports each non-added outcome
- **AND** it does not discard the successful results or represent the whole batch as success

#### Scenario: Legacy request is submitted

- **WHEN** Renderer submits an older Home asset request without the current exact identity and revision fields
- **THEN** the contract rejects it before native picker, copy, trash, or refresh effects
- **AND** no legacy Asset catalog, Media Library copy path, or fallback mutation participates
