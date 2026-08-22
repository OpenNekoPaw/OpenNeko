## Why

PrimarySidebar currently presents Project contexts and standalone conversations under one "Projects and conversations" heading, so its count and hierarchy do not communicate whether a row opens a Project or restores a Personal Assistant Conversation. Unavailable Workspace contexts also risk looking like standalone conversations when their Project cannot be resolved. The current product needs two explicit visible categories while preserving a minimal, non-visible extension boundary for future Character, Room, and World owners.

## What Changes

- Split the current PrimarySidebar catalog presentation into visible `Projects` and `Conversations` sections.
- Keep recent Project groups, their Workspace Conversation children, and unavailable Workspace context groups in `Projects`; an unresolved Project association remains a local Project-context diagnostic rather than becoming a standalone Conversation.
- Keep only standalone Personal Assistant Conversations in `Conversations`.
- Reserve Character, Room, and World as future owner classifications without rendering empty sections, placeholder rows, actions, routes, or fabricated records before those product owners are implemented.
- Preserve exact Project and Conversation navigation, lifecycle operations, counts, collapse state, bounded children, diagnostics, and runtime ownership.
- Update renderer and isolated Electron acceptance so current category counts and placement are verified in normal, empty, dense, unavailable, narrow, and themed states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `desktop-conversation-context-navigation`: PrimarySidebar presents current Project contexts and Personal Assistant Conversations in separate visible sections while reserving a non-visible owner-classification boundary for future Character, Room, and World capabilities.

## Impact

- `@neko/host` remains the owner of the canonical grouped Project/Conversation navigation projection; its contract and data shape do not change.
- `apps/neko-desktop` changes only sandboxed Renderer product-shell composition, localized labels, styles, interaction tests, and isolated Electron evidence.
- No Character, Room, or World product surface is implemented by this change. No Project, Conversation, runtime, database, IPC, preload, user-data, migration, internal version, compatibility, fallback, or cloud-sync behavior changes.
