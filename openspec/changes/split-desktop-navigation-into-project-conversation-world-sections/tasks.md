## 1. Three-section presentation

- [ ] 1.1 Partition the canonical navigation groups into Project and standalone Conversation sections in `PrimaryRecentNavigation` without changing Host contracts or duplicating a Conversation.
- [ ] 1.2 Render stable localized Projects, Conversations, and World headings with owner-specific counts, keeping World empty and actionless until a World owner projection exists.
- [ ] 1.3 Preserve existing group rendering, collapse/show-all state, exact navigation, diagnostics, context menus, hover actions, and scroll behavior across the new section wrappers.

## 2. Contract and renderer coverage

- [ ] 2.1 Add Renderer tests for section order, Project and standalone Conversation placement, exact counts, zero-child Projects, and an empty World section.
- [ ] 2.2 Add coverage proving world-profile Projects, Character groups, and Room groups do not fabricate World rows and existing unavailable Workspace groups remain local to Conversations.
- [ ] 2.3 Update affected localization, architecture documentation, and existing selectors while deleting the mixed `Projects and conversations` presentation path.

## 3. Runtime and quality verification

- [ ] 3.1 Update the isolated Electron Workbench scenario to verify the three categories in normal, dense, unavailable, narrow, light, and dark states without losing Project or Conversation operations.
- [ ] 3.2 Inspect current Electron screenshots directly for hierarchy, clipping, overlap, spacing, readability, hover/focus actions, and scrolling; record console diagnostics and residual World-owner risk.
- [ ] 3.3 Run focused Desktop tests/typecheck/lint/format, strict OpenSpec validation, `check:no-internal-versioning`, `check:legacy-debt`, `check:unused`, application-boundary and dependency gates, then complete `neko-quality-review` with path-level evidence.
