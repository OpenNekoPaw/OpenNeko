## Verification (2026-07-18)

### Implemented path evidence

- Shared contract/planner: `pnpm exec vitest run packages/neko-types/src/types/__tests__/canvas-workspace-board.test.ts packages/neko-types/src/utils/__tests__/canvasWorkspaceBoardProjection.test.ts` passes 13 tests for v2 batches, validation, deterministic processing Groups, role ordering, idempotency, conflicts, and forbidden runtime values.
- Canvas ledger/coordinator: `pnpm --dir packages/neko-canvas/packages/domain test` passes 20 tests, including real Node SQLite transactions, duplicate delivery, two-coordinator serialization, stale writer epoch, crash-after-save recovery, and receipt/no-op behavior. `pnpm --dir packages/neko-canvas/packages/domain typecheck` passes.
- TUI/headless projection: `pnpm --dir apps/neko-tui exec vitest run src/tui/host/node-workspace-board-mutation-port.test.ts` passes 3 tests for headless `.nkc` mutation, workspace boundary rejection, and source/analysis batch persistence. The removed `NodeWorkspaceBoardProjector` path is absent.
- Agent collection/storage: focused Agent tests pass for creator-visible artifact collection and SQLite task filtering; they prove named Markdown and consumed durable refs are included while final-answer prose, failed/unconsumed refs, and Canvas delivery tasks in generic TaskManager views are excluded.
- VS Code Host: `pnpm --dir packages/neko-agent/packages/extension test:run` passes 82 files / 628 tests with 6 skipped after replacing the generated-asset-only Host method with generic `deliverBatch`; focused projection, architecture poison, and legacy metadata cleanup tests pass 7/7.
- TUI startup regression: the hook/identity/reference focused run passes 13/13 after the isolated test Host acquired a real LocalMetadata transaction boundary and stable workspace registration. The debug projection run passes 20 tests and redacts document paths, holder identity, Markdown body, and raw SQLite details.

### Repository gates

- `pnpm build` passed before the final generic batch cleanup (10/10 tasks, 9m14s); the final incremental rerun is recorded below when complete.
- `pnpm test` reached all affected Board delivery packages successfully, then failed in unrelated `neko-engine` frame-server tests: one 5s timeout and one unexpected `getCompatibleEngine` call. No Board delivery test failed in the final run.
- `pnpm --dir apps/neko-tui test` passed 531/532; `InputEditor remains editable while an agent turn is running` lost the first input character under concurrent load, while its isolated rerun passed 16/16. The Board startup/hook regressions pass independently.
- `pnpm check` is blocked by unrelated untracked 3D Preview work: two unused model Webview files plus unused `three` / `@types/three` dependencies. Dependency-cruiser itself passes with no violations.
- Strict TUI/Agent typechecks remain blocked by existing cross-package errors outside this change. Changed Canvas domain typecheck passes; changed Agent Extension production tests/build pass. The obsolete debug fact fixture version introduced by this change was corrected from v1 to v2.
- `pnpm check:unused` passed earlier in this change before the unrelated 3D Preview files appeared; the current failure is recorded above rather than fixed here.

### Agent Evaluation

- Authoring disposition: `update` `agent-runtime.creative-media-workflow/generated-output-workspace-board`; `create` `workspace-board-material-analysis`; `create` `agent-runtime.workflow-controller/workspace-board-delivery-resume`.
- Key-free gate: `pnpm test:agent:eval` validates 39 test files / 277 tests and 23 suites / 47 cases. This is schema, runner, selector, and dry-run evidence only.
- Real provider-backed TUI cases were not run: no credential/network/model-backed execution evidence was established in this session. No key-free or dry-run result is claimed as real Agent behavior acceptance.
- `workspace-board-delivery-resume` is indexed, but the current Evaluation controller has no first-Host terminate/second-Host process takeover operation; its existing `resume` step cannot prove the full task 9.3 contract.
- Extension Development Host functional acceptance was not run. Browser/Vite evidence was not substituted for the required VS Code Webview/editor-owner scenario.

### User-data and migration disposition

- `.nkc` remains the only Board node/layout/user-edit authority. SQLite uses existing user-level `tasks` / `task_checkpoints`; there is no new table, workspace database, JSON fallback, or Board reconstruction path.
- Existing `.nkc` files, generated outputs, user movement/deletion, settings, and valuable local metadata are preserved. Projected receipts are compact and do not retain Markdown bodies after commit.
- The prelaunch v1 single-artifact projection DTO is rejected by the canonical validator and tests now use v2 batches. No persisted Board node migration is required because delivered nodes use ordinary Canvas schema.
- Legacy generated-output index reading is still retained to protect existing local generated outputs. It must not be removed until task 8.3 defines the explicit old-data disposition and proves the migration/poison path.

### Remaining risk and blockers

- Open Workspace Board editor lease renewal/ownership, dirty document coordination, and competing Host pending behavior remain incomplete (6.2/6.4).
- Bun SQLite parity, corrupt/unsupported store coverage, full fault-injection matrix, and complete TUI terminal-path matrix remain incomplete (3.5/4.3/5.4/7.4).
- User-visible retry/discard/status presentation and legacy fallback counters remain incomplete (8.1/9.4).
- Real first-Host termination takeover, provider-backed TUI cases, and Extension Development Host functional acceptance remain unverified (9.3/9.5/9.6).
