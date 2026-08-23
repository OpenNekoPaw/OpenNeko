# Validation evidence

## 2026-08-24 Canvas catalog freshness follow-up

- Successful Canvas creation now publishes a Workspace-scoped invalidation through the Canvas-owned Desktop bridge. The
  mounted Workspace Agent surface re-reads the canonical composer configuration only for the matching Workspace;
  foreign Workspace events and existing selector changes do not query, submit, or create a Conversation.
- Deterministic validation passed: strict OpenSpec; Desktop typecheck; focused ESLint; Webview boundary; `7` Desktop
  test files / `138` tests covering Main publication, exact sender IPC projection, strict preload decode, Renderer
  refresh/isolation, and adjacent scene mounting. Existing per-turn target admission, prompt, and artifact routing also
  passed in `2` Desktop files / `7` tests and `3` Agent runtime files / `18` tests.
- A visible Electron assertion was added to `workspace-main-quick-creation`, but the run did not enter the scenario:
  another Desktop process already owned this checkout's single Vite bundle. The runner timed out waiting for CDP after
  the child process rejected startup. This is recorded as a runtime-owner blocker, not UI success and not a product
  behavior failure.
- Repository-wide package-product-status, Agent inventory, internal-versioning, and whole-file `app-host.ts` lint gates
  remain red from unrelated pre-existing worktree changes. None of their findings reference the new Canvas invalidation
  contract or implementation.

## 2026-08-22 scene recovery follow-up

- The context bar remains associated with its exact Conversation and Workspace. Before the first Conversation exists,
  the selection belongs to the mounted Agent Surface draft and transfers only when that draft publishes the new
  Conversation. It is not a durable Conversation binding or Workspace fact and can be discarded on a full application
  restart.
- Agent Webview tests passed (`4` files, `47` tests) and Desktop full tests passed (`104` files, `631` tests). Coverage
  proves selection restoration after the Agent child root unmounts and remounts under a stable Renderer provider, exact
  draft-to-Conversation transfer, sibling Conversation/Workspace isolation, and use of the restored exact Canvas on the
  next submission. Both package typechecks, focused ESLint, strict OpenSpec and Webview/application/package boundaries
  passed. The active Forge development owner rebuilt Main and restarted Electron; production packaging was not run in
  parallel with that single bundle writer.
- No CSS, layout, labels or existing OpenNeko Webview presentation were changed. Visible Electron acceptance remains a
  manual requirement because component tests do not prove the authoritative scene-switch path in the running Desktop.
