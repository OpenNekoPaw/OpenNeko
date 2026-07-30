## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the single user-visible entry for browsing, searching, opening, copying, and diagnosing accessible file resources. It MUST NOT expose a separate Asset Library, Asset Source catalog, or membership workflow. Canvas and other authoring surfaces SHALL consume Media Library entries through their canonical ContentLocators rather than importing them into a catalog.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below `neko/assets/<libraryName>/`
- **THEN** Media Library returns an entry keyed by the exact workspace-relative locator without requiring an AssetEntity or catalog record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been imported
- **THEN** the file can be read, previewed, or referenced directly through the normal content locator path

#### Scenario: Add a linked media file to Canvas

- **WHEN** a Canvas action consumes a Media Library entry below `neko/assets/<libraryName>/`
- **THEN** it retains the exact workspace-file locator without copying bytes, creating per-file links, or recording the physical library target

#### Scenario: Add a global library resource to a project Canvas

- **WHEN** a Home global media-library resource has no locator authorized by the active project
- **THEN** the Host requires explicit library linking or file copying before Canvas receives a workspace locator

### Requirement: File mutations express explicit user intent

Adding, relinking, removing, copying into, copying to a global library, or deleting from Media Library SHALL use distinct operations with explicit source, destination scope, conflict policy, ownership, and authorization. Removing a library MUST delete only the link; copying or deleting through a linked directory MUST be treated as mutation of the external target. A Canvas action MUST name whether it copies to a selected project-linked library or to a selected global library and MUST NOT expose a generic AssetLibrary promotion operation.

#### Scenario: Remove a Media Library

- **WHEN** the user confirms removal of a linked library
- **THEN** the Host removes only the workspace link and never deletes or modifies target contents

#### Scenario: Copy a generated result into a project library

- **WHEN** the user explicitly selects a writable linked Media Library destination and conflict policy
- **THEN** the owning file operation copies bytes to that destination without creating Asset catalog membership or changing the generated source identity

#### Scenario: Copy a Canvas material to a global library

- **WHEN** the user explicitly selects a writable user-global library destination
- **THEN** the global media-library owner copies the bytes into its physical root and returns a global catalog projection without writing a global absolute path into the Canvas document

#### Scenario: Reject ambiguous save-to-asset action

- **WHEN** a Canvas material action does not identify project-linked versus global destination ownership
- **THEN** the Host rejects the mutation visibly and does not call a legacy Asset import or promotion API

#### Scenario: Reject implicit target mutation

- **WHEN** a workflow lacks an explicit writable target or delete intent
- **THEN** Media Library rejects the mutation with a visible diagnostic and does not infer permission from a link or previous catalog membership
