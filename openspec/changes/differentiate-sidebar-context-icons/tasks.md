## 1. Shared Icon Primitives

- [ ] 1.1 Add generic bot, user, users and message outline icons to the canonical `@neko/ui` public entry.
- [ ] 1.2 Add static-render producer tests that identify each icon and verify shared sizing/color behavior.

## 2. Desktop Sidebar Composition

- [ ] 2.1 Map every closed sidebar owner kind to its exact shared identity icon without a default or fallback branch.
- [ ] 2.2 Replace Conversation-row storyline icons with the shared message icon and preserve row geometry, diagnostics and actions.
- [ ] 2.3 Add Renderer consumer tests covering Project, Workspace, Assistant, Character, Room and Conversation icon semantics plus unchanged interaction behavior.

## 3. Validation And Completion

- [ ] 3.1 Run focused UI and Desktop tests, affected typechecks, `pnpm check:unused`, `pnpm check:legacy-debt`, `pnpm check:openspec` and `git diff --check`.
- [ ] 3.2 Validate the authoritative Electron sidebar at regular and compact dimensions in light/dark themes, inspect screenshots directly, and record any owner fixture that cannot be produced by the qualified runtime as a visible limitation.
- [ ] 3.3 Review the changed canonical path with the Neko quality gate, record actual verification commands and residual risks, then archive the completed OpenSpec change.
