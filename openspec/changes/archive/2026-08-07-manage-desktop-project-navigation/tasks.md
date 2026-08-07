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

## 4. Compact Sidebar Markers And Actions

- [x] 4.1 Update Renderer and CSS regression tests to require icon-only unavailable/execution states and hover/focus-revealed Project and Conversation actions.
- [x] 4.2 Replace inline marker labels with accessible icons and compose the existing Project and Conversation buttons into a stable trailing hover/focus action layer.
- [x] 4.3 Re-run focused quality gates and validate default, hover, keyboard-focus, unavailable, running, narrow and dark/light states in isolated Electron Desktop evidence.

## 5. Unavailable Workspace Management

- [x] 5.1 Change the canonical Conversation delete payload to a strict non-empty identity array, update all producer/consumer tests, and prove the former singular payload is rejected without fallback.
- [x] 5.2 Add unavailable Workspace group hover/focus and context-menu cleanup using the exact projected identities, and hide trailing status markers while row actions are visible.
- [x] 5.3 Run focused contracts, Renderer, Main, typecheck, lint, strict OpenSpec and isolated Electron checks for dense unavailable groups and non-overlapping icons.

## 6. Empty Project Navigation

- [x] 6.1 Update Host, Main integration and Renderer regression tests to require recent Project contexts with zero Conversations to remain visible after cleanup while catalog-only Projects stay out of the sidebar.
- [x] 6.2 Project exact recent Project identities from the existing Desktop stored Project owner, retain only those empty Project groups in canonical grouped navigation, and preserve exact open, new Conversation, management and removal actions.
- [x] 6.3 Update the isolated Desktop catalog scenario to verify recent empty Project retention, catalog-only Project exclusion, complete Project Management visibility, bounded navigation and post-cleanup behavior.

## 7. Empty Project Validation And Delivery

- [x] 7.1 Update stable architecture documentation and run focused Host, Main and Renderer tests, affected typechecks, lint/format, strict OpenSpec validation and debt checks.
- [x] 7.2 Validate recent empty Project default, hover, keyboard-focus, unavailable, dense, narrow and dark/light states in the real Electron Desktop and directly inspect every required screenshot.
- [x] 7.3 Complete the Neko quality review and confirm recent Project visibility remains a lightweight presentation projection rather than a retained Root, runtime or cross-domain open-instance catalog.
