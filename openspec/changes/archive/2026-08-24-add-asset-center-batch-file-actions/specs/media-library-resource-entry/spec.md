## MODIFIED Requirements

### Requirement: File mutations express explicit user intent

Adding, relinking, removing, copying into, moving within, or deleting from Media Library SHALL use distinct operations with explicit ownership and authorization. Removing a library MUST delete only the link; copying, moving, or deleting through a linked directory MUST be treated as mutation of the external target. A move MUST remain inside one exact authorized Media Library connection and MUST fail before mutation when any selected item, destination, or conflict check is invalid.

#### Scenario: Remove a Media Library

- **WHEN** the user confirms removal of a linked library
- **THEN** the Host removes only the workspace link and never deletes or modifies target contents

#### Scenario: Copy a generated result into a library

- **WHEN** the user explicitly selects a writable Media Library destination and conflict policy
- **THEN** the owning file operation copies bytes to that destination without creating Asset catalog membership or changing the generated source identity

#### Scenario: Move files inside a linked library

- **WHEN** the user explicitly selects regular files from one Media Library connection and a destination directory inside that same connection
- **THEN** the owning Node operation moves the complete validated batch without exposing the physical target to the Renderer or creating Asset membership

#### Scenario: Reject a cross-library move

- **WHEN** selected files belong to different Media Library connections or the destination resolves outside their exact connection target
- **THEN** the Host rejects the complete move before changing any external file

#### Scenario: Reject implicit target mutation

- **WHEN** a workflow lacks an explicit writable target, move intent, or delete intent
- **THEN** Media Library rejects the mutation with a visible diagnostic and does not infer permission from a link or previous catalog membership
