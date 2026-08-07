## 1. Package-Owned Project Deletion

- [x] 1.1 Replace the old wire API, request/channel names, Main handler, preload bridge, and consumers with the strict canonical `projects.delete(projectIds)` path; verify removed symbols are absent rather than retaining legacy-path tests.
- [x] 1.2 Add a tested `@neko/host` Project/Conversation management service that captures exact Project-group conversation identities, commits Project/Tab/View removal, delegates Agent deletion, and returns the final projection.
- [x] 1.3 Add failure-path tests proving invalid Project batches perform no deletion and post-commit Agent deletion failure remains visible without reporting success or deleting Project files.

## 2. Sidebar Project Management

- [x] 2.1 Add independent group collapse state while preserving the bounded recent-conversation subset and explicit show-all behavior.
- [x] 2.2 Add available Project group controls for open Project, new conversation draft, and delete Project with conversations through canonical existing actions.
- [x] 2.3 Replace separate Workspace diagnostic rows and embedded item warnings with one tested trailing unavailable status for Project, Workspace group, and Conversation rows.
- [x] 2.4 Update English and Chinese confirmation, action, group, and accessibility strings to match destructive conversation cleanup semantics.

## 3. Verification And Delivery

- [x] 3.1 Run focused `@neko/host`, Desktop Main/preload/Renderer tests and affected typechecks/builds with path-level assertions.
- [x] 3.2 Extend the isolated Electron scenario to verify group collapse/expand, Project actions, trailing diagnostics, and Project deletion removing the sidebar group and conversations without touching user storage.
- [x] 3.3 Run `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:agent-boundaries`, `pnpm check:openspec`, `pnpm check:unused`, `pnpm check:test-orchestration`, and `git diff --check`; complete L2 quality and UI reviews with residual risks.
