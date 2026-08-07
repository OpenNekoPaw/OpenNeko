## 1. Current section presentation

- [x] 1.1 Partition the canonical navigation groups into Project-context and Personal Assistant Conversation sections in `PrimaryRecentNavigation` without changing Host contracts or duplicating a Conversation.
- [x] 1.2 Keep valid Project groups and unavailable Workspace context groups under Projects; retain each unavailable group's local diagnostic and disabled authority-dependent operations.
- [x] 1.3 Render stable localized Projects and Conversations headings with owner-specific counts, without rendering Character, Room, or World headings, placeholders, actions, or routes.
- [x] 1.4 Add a small exhaustive owner classification for current and future owner kinds without introducing a registry, feature flag, placeholder DTO, parallel catalog, or runtime support claim.
- [x] 1.5 Preserve existing group rendering, collapse/show-all state, exact navigation, diagnostics, context menus, hover actions, and scroll behavior across the new section wrappers.

## 2. Contract and renderer coverage

- [x] 2.1 Add Renderer tests for section order, valid and unavailable Project-context placement, Personal Assistant Conversation placement, exact counts, and zero-child Projects.
- [x] 2.2 Add coverage proving unavailable Workspace contexts remain under Projects and that unsupported Character, Room, and World classifications do not expose headings, rows, counts, actions, routes, or fabricated records.
- [x] 2.3 Update affected localization, architecture documentation, and existing selectors while deleting the mixed `Projects and conversations` presentation path.

## 3. Runtime and quality verification

- [x] 3.1 Update the isolated Electron Workbench scenario to verify Projects and Conversations in normal, dense, unavailable, narrow, light, and dark states without losing current Project or Personal Assistant operations.
- [x] 3.2 Inspect current Electron screenshots directly for hierarchy, clipping, overlap, spacing, readability, hover/focus actions, diagnostics, and scrolling; record console diagnostics and future-owner risk.
- [x] 3.3 Run focused Desktop tests/typecheck/lint/format, strict OpenSpec validation, `check:no-internal-versioning`, `check:legacy-debt`, `check:unused`, application-boundary and dependency gates, then complete `neko-quality-review` with path-level evidence.
