## Product boundary

Asset Library owns explicitly imported local reusable packages, immutable user-managed revisions, dependency closure, integrity, and local lifecycle. Media Library continues to expose ordinary linked files; Entity and project domains keep their own semantic facts and exact references.

## Core invariants

- A manifest identifies one Asset package and its closed members without containing raw paths, credentials, or unrelated domain facts.
- Import and update expose no partial revision; integrity and containment are verified before commit.
- Project references pin exact revisions and do not create another Asset repository.
- Removing catalog membership, uninstalling bytes, and garbage collection are distinct explicit operations.
- One invalid package or dependency does not disable sibling Assets, Projects, or ordinary files.

## Product acceptance

The capability is complete when creators can import, inspect, reference, update, and safely remove local Asset packages through the authoritative Desktop workflow.

## Non-goals

This change does not add remote distribution, cloud synchronization, a generic Entity hierarchy, or implicit promotion of ordinary files.
