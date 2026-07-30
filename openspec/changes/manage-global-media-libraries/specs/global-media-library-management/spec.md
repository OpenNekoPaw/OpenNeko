## ADDED Requirements

### Requirement: Import a global media library

The Desktop application SHALL let the user select a local directory and import it as a physical direct child of the user-level global media root without exposing the selected absolute path to the Webview.

#### Scenario: Successful directory import

- **WHEN** the user selects a valid local directory whose library name does not exist
- **THEN** the system copies the complete directory through a staging path, atomically publishes it under the global media root, and refreshes the media-library catalog

#### Scenario: Directory selection is cancelled

- **WHEN** the user cancels the native directory picker
- **THEN** the system returns an explicit cancelled result and does not mutate the global media root

#### Scenario: Library name already exists

- **WHEN** the selected directory basename conflicts with an existing child of the global media root
- **THEN** the system fails visibly and does not overwrite, merge, or silently rename either library

#### Scenario: Source contains a symbolic link

- **WHEN** the selected directory tree contains a symbolic link
- **THEN** the system rejects the import without following the link outside the selected tree

### Requirement: Safely remove a global media library

The Desktop application SHALL remove a confirmed global media library by moving its complete physical directory to the operating-system trash rather than permanently deleting it.

#### Scenario: Confirmed removal

- **WHEN** the user confirms removal of an available library returned by the global catalog
- **THEN** the main process validates the library identity and direct-child path, moves the directory to system trash, and refreshes the catalog

#### Scenario: Removal is cancelled before dispatch

- **WHEN** the user declines the removal confirmation
- **THEN** the Renderer sends no removal command and the library remains unchanged

#### Scenario: Invalid or stale library identity

- **WHEN** a removal command names a missing, non-directory, symbolic-link, malformed, or out-of-root target
- **THEN** the system fails visibly and does not treat the operation as successful

#### Scenario: System trash fails

- **WHEN** the operating system cannot move the validated directory to trash
- **THEN** the application presents a visible error and retains the original library directory

### Requirement: Reveal and refresh global media libraries

The Desktop application SHALL let the user reveal an available global media library in the host file manager and refresh the current global catalog.

#### Scenario: Reveal a library

- **WHEN** the user invokes reveal for a valid available library
- **THEN** the main process validates the same direct-child invariant and asks the host file manager to reveal that directory

#### Scenario: Refresh the catalog

- **WHEN** the user invokes refresh
- **THEN** the Renderer re-runs the current facet, query, and sort projection without creating another project-scoped catalog

### Requirement: Global library management contract is strict

The Desktop Home Management bridge SHALL use one versioned exact-shape contract for global media-library mutations and SHALL reject legacy, unknown, or mismatched payloads.

#### Scenario: Legacy contract request

- **WHEN** a Renderer sends a v3 media-library mutation payload after the v4 contract is active
- **THEN** the main process rejects the request before performing any filesystem effect

#### Scenario: Unknown mutation fields

- **WHEN** a mutation request or result contains unknown fields or a mismatched request identity
- **THEN** the corresponding contract parser rejects the payload visibly

### Requirement: Mutation state is user-visible and serialized

The Desktop asset center SHALL expose pending, cancelled, successful, and failed management outcomes and SHALL prevent conflicting global media-library mutations from running concurrently in one page instance.

#### Scenario: Mutation is pending

- **WHEN** an add, remove, or reveal operation is in progress
- **THEN** conflicting management controls are disabled and the operation remains visibly pending

#### Scenario: Mutation fails

- **WHEN** a main-process management operation rejects
- **THEN** the asset center presents the diagnostic without clearing or fabricating catalog items
