## 1. Renderer Contracts And Regression Tests

- [x] 1.1 Add Desktop Renderer tests for Project and Conversation context-menu actions, exact identities, unavailable disabled actions, and the canonical Project Management Scene intent.
- [x] 1.2 Add Renderer and CSS tests for localized `running`, `needs-input`, and `needs-review` trailing status labels, including unavailable precedence and bounded row layout.

## 2. Sidebar Interaction

- [x] 2.1 Compose Project group and Conversation row context menus from the shared `@neko/ui` primitive and existing `ShellActions`, without adding an IPC or command path.
- [x] 2.2 Render current Conversation attention as accessible trailing status text and preserve title truncation, diagnostics, collapse, direct navigation, and cleanup controls.
- [x] 2.3 Add localized menu/status copy and verify English and Chinese bundles remain complete.

## 3. Validation And Delivery

- [x] 3.1 Run focused Desktop Renderer/UI tests, affected typechecks, lint/format, strict OpenSpec validation, dependency/legacy/unused gates, and record any residual risk.
- [x] 3.2 Validate normal click, right-click menu actions, unavailable items, background running status, narrow layout, and dark/light presentation in the real Electron Desktop without using the user database for fixture-driven checks.
- [x] 3.3 Complete the Neko quality review, confirm no internal versioning/migration/fallback path was added, and commit the implementation separately from unrelated user changes.
