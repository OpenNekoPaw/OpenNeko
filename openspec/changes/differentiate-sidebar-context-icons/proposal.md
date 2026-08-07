## Why

The primary sidebar currently renders personal Assistants, Characters, Rooms and their Conversation rows with the same storyline icon, so users cannot scan the owner hierarchy or distinguish an owning context from a child Conversation. The sidebar needs restrained, Codex-style outline icons with explicit semantics while preserving the existing navigation and lifecycle behavior.

## What Changes

- Keep the folder metaphor for available Projects and unavailable Workspace owners.
- Give personal Assistant, Character and Room groups distinct identity icons.
- Give every child Conversation row one shared message icon that is visually distinct from its owner.
- Keep icon size, stroke, alignment and color consistent across compact, dark-theme and unavailable states without adding a selected-edge highlight or decorative icon container.
- Preserve grouping, collapse, navigation, creation, deletion, unavailable diagnostics and background Agent behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `desktop-sidebar-project-management`: Require stable, semantically distinct owner and Conversation icons in the grouped primary sidebar.

## Impact

- `@neko/ui` remains the L2 owner of reusable, business-neutral React SVG icons and gains generic bot, user, users and message icons through its canonical `@neko/ui` public entry.
- `apps/neko-desktop` remains the Application presentation composition consumer and maps the package-owned closed navigation group contract to those icons; it does not gain domain ownership or host-neutral behavior.
- No IPC, persistence, user data, Agent runtime, navigation identity, dependency or migration behavior changes.
