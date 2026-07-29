## Context

The Desktop primary sidebar consumes one Shell projection containing the persisted Project catalog, Window tabs, and Agent Home conversation summaries. Today its Project affordance invokes only `tabClose`, so a catalog record survives after the tab is closed, while conversation rows have no deletion affordance even though the Desktop Agent workspace already owns an authority-backed `deleteConversation` operation.

The change crosses Renderer, preload, IPC, AppHost, Shell persistence, and Agent workspace ownership. It must preserve the distinction between local workspace content, recent-item metadata, and Agent conversation data.

## Goals / Non-Goals

**Goals:**

- Give every recent Project a canonical “remove from recent” action.
- Give every Agent Home conversation a canonical authority-backed delete action.
- Reconcile open tabs and active targets when a Project is forgotten.
- Validate projection revisions and stable Project/workspace/conversation identities before mutation.
- Keep failures visible and leave the projected row intact when persistence or authority deletion fails.

**Non-Goals:**

- Delete, move, or modify files inside a forgotten Project workspace.
- Add a trash/recovery subsystem for Agent conversations.
- Treat closing a Project tab as catalog cleanup.
- Add optimistic local projection mutation or compatibility fallbacks.

## Decisions

### Project cleanup is a Shell-owned catalog mutation

The shared Shell contract will expose a Project removal request carrying endpoint, Window, catalog, and Project identity revisions. `DesktopShellService` will commit one state transition that removes the catalog record, removes tabs for that Project from every stored Window, and activates Home in any Window whose active tab was removed.

This is preferred over renderer-only filtering because the catalog is persisted application state. It is also preferred over deleting the workspace because the recent catalog does not own user project content.

### Conversation cleanup delegates to the owning Agent workspace

The shared Agent Home cleanup request will carry the complete stable navigation identity and expected Agent Home revision. AppHost will validate that the projected conversation still matches that identity, resolve the Project workspace, and call the existing `DesktopAgentWorkspaceRuntime.deleteConversation` authority path.

The Shell remains a read-only projector of Agent Home data. It does not gain a second conversation store or directly edit Agent projection snapshots.

### Cleanup results are projection-driven

Successful Project removal returns the committed Shell projection. Successful conversation deletion waits for the authority operation and returns the refreshed Shell projection. Renderer state changes only from these authoritative projections or the existing projection event stream.

This prevents a failed cleanup from appearing successful and avoids races between an optimistic row removal and Main-process persistence.

### Sidebar actions are distinct and accessible

Project rows expose “Remove from recent” whether or not a tab is currently open. Conversation rows expose “Delete conversation” and require explicit confirmation because the operation deletes persisted Agent conversation data. Icon-only controls use localized accessible labels and stop row navigation when activated.

Closing a project tab remains available only where tab lifecycle is being managed; it is not reused as the cleanup action.

## Risks / Trade-offs

- **[Conversation deletion is irreversible]** → Require explicit confirmation and use wording that distinguishes deletion from closing.
- **[A Project can be open in more than one Window]** → Remove all matching tabs in the same persisted Shell transaction and reconcile each affected active target.
- **[Agent Home projection events can race with delete results]** → Validate the expected Home revision before deleting and return/consume only authoritative projections.
- **[Workspace deletion could be inferred from the Project action]** → Label the command “Remove from recent” and keep filesystem ports outside the Shell mutation.
- **[A running Agent turn can make deletion fail]** → Preserve the row and surface the authority error; do not cancel or force-delete implicitly.

## Migration Plan

The contract is prelaunch and can be extended in place. Existing persisted Project catalogs require no schema migration because removal changes state contents, not record shape. Rollback consists of removing the new channels and UI actions; forgotten catalog entries can be restored by reopening their workspace, while deleted conversations are intentionally not recoverable.

## Open Questions

None.

## Verification

- `pnpm --filter @neko/app-desktop test:run`: 44 test files and 211 tests passed, including Renderer action isolation, Shell cross-Window reconciliation and stale-revision rejection, and authority-backed Agent conversation deletion.
- `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm --filter @neko/app-desktop lint`: passed with one pre-existing `desktop-cut-runtime.ts` unsafe-regex warning and no warning in the changed path.
- `pnpm --filter @neko/app-desktop build`: Electron production package completed for macOS arm64.
- `pnpm check:agent-boundaries`: passed for 1,198 checked files with no findings.
- `pnpm exec openspec validate add-desktop-sidebar-cleanup-actions --strict`: passed.
- `git diff --check`: passed.
- Actual Electron runtime: the stale temporary fixture was removed from the recent-Project catalog while its files remained untouched; the recent count changed from three to two. The conversation cleanup action displayed the localized irreversible-deletion confirmation and was cancelled to avoid mutating real user conversation data.

## Evaluation Disposition

Real Neko Agent Evaluation is **excluded**. The change does not alter prompts, Skills, capability or Tool routing, provider/model selection, turn execution, queues, recovery, or Agent event projection. The only Agent boundary call is the existing authority-owned deterministic `deleteConversation` operation, whose exact workspace/conversation routing and refreshed Home projection are covered by AppHost integration tests. No legacy or active-workspace fallback can produce success for a mismatched identity.

## Residual Risk

- Real conversation data was not deleted during manual acceptance because the operation is irreversible. The authority mutation itself is verified through deterministic integration tests using an isolated workspace runtime.
- Removing a recent Project intentionally does not delete its files or Agent conversations. Reopening the same workspace restores the Project catalog entry.
