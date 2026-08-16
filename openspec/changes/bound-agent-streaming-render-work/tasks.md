## 1. Regression coverage

- [x] 1.1 Add a replica test proving N streaming append patches coalesce to a bounded number of render
      notifications while the authoritative snapshot keeps the full concatenated content and completion
      flushes immediately.
      Evidence: `conversation-projection-replica.test.ts` proves 200 streaming appends produce one
      coalesced render notification, the snapshot holds the full concatenated content before any flush,
      completion and non-append patches flush immediately, and coalescing is per-replica (one
      conversation's flush never notifies or blocks another).
- [x] 1.2 Add a contract test proving `applyConversationProjectionPatch` shares unpatched frozen turns by
      reference and rebuilds only the target turn without mutating the previous snapshot.
      Evidence: `conversation-projection.test.ts` proves `next.turns[1] === twoTurns.turns[1]` while the
      patched turn is a new frozen object, the previous snapshot remains unchanged, and canonical
      deep-freeze does not recursively revisit the shared sibling subtree, while a shallow-frozen external
      sibling is still traversed and fully frozen.
- [x] 1.3 Add a Tab-level fake-timer regression proving a streaming append never exposes a newer Markdown
      snapshot with stale rendered Projection content, or the reverse, during the bounded flush.
      Evidence: `tab-render-runtime.test.ts` models the parent Projection subscription as rendered content
      and the child Markdown subscription as the parser snapshot. It proves the timer flush and an immediate
      non-append patch following a pending append never expose mismatched sources and leave no timer behind.

## 2. Bounded presentation scheduler

- [x] 2.1 Add an optional coalescing publication scheduler to `ConversationProjectionReplica` that commits
      every patch synchronously and coalesces only completion-less all-append streaming notifications.
- [x] 2.2 Wire `DefaultTabRenderRuntime` to construct the replica with the existing 32ms presentation
      scheduler shared with the Markdown session registry.
- [x] 2.3 Replace the independent timers with one Tab-owned three-phase batch that commits Markdown
      snapshots before publishing Projection listeners and publishes Markdown listeners last; immediate
      non-streaming Projection publication must synchronously flush pending Markdown for that conversation.

## 3. Incremental projection patch application

- [x] 3.1 Replace the full `snapshot.turns.map(cloneConversationTurnProjection)` with target-turn-only
      cloning while preserving all owner/completion validation and full immutability.

## 4. Verification

- [x] 4.1 Run focused contracts and Agent Webview tests plus affected typechecks; run strict OpenSpec
      validation; record commands, results and residual risks.
      Evidence: `@neko/agent-contracts` `tsc --noEmit` passed and the full suite passed `43/43` files /
      `256/256` tests. `@neko/agent-webview` `tsc --noEmit` passed and the full suite passed `104/104`
      files / `804/804` tests. The focused Presenter/Markdown/render-runtime slice passed `41/41` files /
      `316/316` tests; the Draft mention contract, launch service, Desktop launch/preload and canonical
      Media Library workspace-locator tests passed `43/43` tests. Strict OpenSpec validation, focused ESLint
      (zero errors; four pre-existing Presenter warnings), Prettier, `git diff --check`, legacy-debt and unused
      gates passed. The completed mounted-locator migration no longer blocks this change; the authoritative
      visible Electron acceptance remains separately blocked because the isolated development process did
      not expose its Desktop CDP target before timeout.
- [x] 4.2 Run the key-free Agent Evaluation gate and record the authoritative visible UI disposition.
      Evidence: the coverage selector maps the changed contract/render-runtime paths to
      `timeline-projection-authority` / `agent-runtime.stream-delivery`; `pnpm test:agent:eval` passed
      `45/45` files and `310/310` tests plus the indexed `27` suite / `80` case dry-run. The current Electron
      `desktop-agent-message-queue` development scenario was attempted through its normal Composer and local
      SSE provider path, but remained `blocked` before application inspection because the Desktop CDP target
      was not ready before timeout (`fetch failed`). The required real-provider streaming interaction also
      lacks explicit provider/model cost authorization; no API call was attempted and no browser/component
      result is claimed as authoritative Desktop UI evidence.
