## 1. Specification And Presentation

- [x] 1.1 Define the removal of ordinary Character/World manual refresh controls while preserving initial/query reload and error retry.
- [x] 1.2 Remove the Character and World collection-header refresh buttons, icons and ordinary-state accessibility labels without changing runtime authority.
- [x] 1.3 Update owning Webview, Desktop style and functional tests to cover search/sort reload, visible failure retry and absence of manual refresh.

## 2. Verification And Delivery

- [ ] 2.1 Run Character/World Webview tests and typechecks, Desktop focused tests/typecheck, `pnpm check:openspec` and `git diff --check`.
  - Focused tests and package typechecks pass; Desktop typecheck remains blocked by unrelated in-progress Canvas file removals in the shared worktree.
- [ ] 2.2 Run the authoritative Desktop management flow, inspect normal and narrow Character/World states directly, and record advisory UI validation evidence and residual risk.
  - Blocked: the Development Electron fixture did not expose its CDP target before timeout, so no current screenshots were produced.
- [x] 2.3 Complete L2 quality review covering package ownership, unique reload path, fail-visible retry and user-data safety.
