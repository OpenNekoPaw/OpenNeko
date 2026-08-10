## 1. Direct Project Navigation

- [x] 1.1 Replace `DesktopProjectCatalogSurface` selection, modifier/range/select-all, Delete shortcut and double-click paths with one exact single-click/native-button `onOpen(projectId)` path; keep unavailable open fail-closed.
- [x] 1.2 Remove batch toolbar markup, selection helpers and stale Renderer i18n/CSS so the replaced presentation path is absent rather than hidden or feature-flagged.
- [x] 1.3 Update component and Desktop Application consumer tests to prove single-click exact scene delegation, keyboard-compatible button semantics, no selection/batch surface and unchanged single-item remove/Conversation cleanup delegation.

## 2. Default Grid Presentation

- [x] 2.1 Change the Project catalog fresh view to grid, add distinct accessible grid/list controls and preserve explicit list switching without business mutation.
- [x] 2.2 Refine responsive Project card/list styling with stable dimensions, long diagnostic containment, compact one-column behavior, focus visibility and reachable item actions.
- [x] 2.3 Add layout/style tests for default grid, explicit list mode, responsive constraints and absence of the removed batch toolbar rules.

## 3. Verification And Delivery

- [ ] 3.1 Run focused Renderer tests and Desktop typecheck/build; run `pnpm check:openspec`, `pnpm check:legacy-debt`, `pnpm check:unused` and `git diff --check`, recording any unrelated pre-existing failures separately.
- [ ] 3.2 Run the isolated real Electron Project catalog path in normal and compact viewports; verify direct open, default grid, list switching, unavailable record, removal and Conversation cleanup states, inspect current screenshots directly and record runtime diagnostics.
- [x] 3.3 Complete L1 quality review and advisory UI validation, documenting the unchanged Host/Agent ownership, current visual evidence and residual risk; confirm no hidden selection path, batch toolbar, alternate open path, contract change, file deletion or combined lifecycle operation remains.
