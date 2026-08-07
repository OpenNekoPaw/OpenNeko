## 1. Package-Owned Contracts And Projection

- [x] 1.1 Add failing `@neko/host` projection tests proving empty Projects are absent, removed-Project Workspace conversations remain locally unavailable, and unrelated groups still project.
- [x] 1.2 Update grouped conversation navigation to emit only conversation-bearing groups and isolate missing Project grouping locally.
- [x] 1.3 Replace the coupled Project conversation management contract with independent Project removal and exact Workspace conversation cleanup commands.
- [x] 1.4 Add producer tests for strict Project validation, removal without Agent deletion, exact Workspace cleanup and non-Workspace preservation.

## 2. Desktop Canonical Path

- [x] 2.1 Replace `projects.delete` and its IPC channel across package contract, preload, Main and Renderer with the canonical `projects.remove` route and prove the old route is absent.
- [x] 2.2 Add the sender-bound `projects.deleteConversations` route and delegate only to the package-owned cleanup service.
- [x] 2.3 Update Project catalog and sidebar actions, confirmations, icons and i18n to distinguish Project removal from conversation cleanup.
- [x] 2.4 Add Renderer, preload, Main and AppHost path-level tests for confirm, cancel, disabled, exact identity and authoritative projection behavior.

## 3. Validation And Completion

- [x] 3.1 Run focused `@neko/host` and Desktop tests, Desktop typecheck/build, internal-versioning, legacy-debt, boundary, OpenSpec, unused, orchestration and diff checks.
- [x] 3.2 Run an isolated real Electron scenario covering conversation-first sidebar, Project removal retention and explicit Project conversation cleanup without user storage.
- [x] 3.3 Inspect desktop and compact-window screenshots for hierarchy, overflow, controls, confirmations, unavailable state and style consistency; record any blocked states or residual risk.
- [x] 3.4 Confirm no old Project delete channel, coupled conversation deletion service, fallback, alias, version or migration code remains; archive the completed OpenSpec change.
