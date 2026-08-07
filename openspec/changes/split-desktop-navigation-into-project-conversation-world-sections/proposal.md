## Why

PrimarySidebar currently presents Project contexts and standalone conversations under one "Projects and conversations" heading, so its count and hierarchy do not communicate whether a row opens a Project, restores a Conversation, or represents a future World experience. The navigation needs three explicit product categories without combining their authorities or inventing World records before the World owner exists.

## What Changes

- Split the PrimarySidebar catalog presentation into `Projects`, `Conversations`, and `World` sections.
- Keep recent Project groups and their Workspace Conversation children in `Projects`.
- Keep standalone Assistant, Character, Room, and unavailable Workspace Conversation groups in `Conversations`.
- Present an explicit empty `World` section until a package-owned World Library projection exists; do not infer World entries from Project profiles or Agent conversations.
- Preserve exact Project and Conversation navigation, lifecycle operations, counts, collapse state, bounded children, diagnostics, and runtime ownership.
- Update renderer and isolated Electron acceptance so category counts and placement are verified in normal, empty, dense, unavailable, narrow, and themed states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `desktop-conversation-context-navigation`: PrimarySidebar presents the existing authoritative Project and Conversation groups in separate product sections and reserves a distinct World section for future World-owned projection.

## Impact

- `@neko/host` remains the owner of the canonical grouped Project/Conversation navigation projection; its contract and data shape do not change.
- `apps/neko-desktop` changes only sandboxed Renderer product-shell composition, localized labels, styles, interaction tests, and isolated Electron evidence.
- No Project, Conversation, Character, Room, World, runtime, database, IPC, preload, user-data, migration, internal version, compatibility, fallback, or cloud-sync behavior changes.
