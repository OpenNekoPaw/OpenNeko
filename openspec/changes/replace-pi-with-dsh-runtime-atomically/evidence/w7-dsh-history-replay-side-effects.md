# W7 DSH History Replay Side-Effect Isolation

## Evaluation scope

- Change: reopening a Conversation through `session/load` must rebuild the DSH transcript and Tool
  projection without treating historical events as new live Canvas deliveries.
- Decision: `reuse` `agent-runtime.workflow-controller/conversation-persistence-resume`.
- Coverage delta: none. The existing case already restarts the complete Desktop owner, restores the
  same Conversation from the exact DSH Session, requires non-empty replayed history, continues with a
  second turn and rejects runtime diagnostics.
- Canonical path: DSH Session history -> bridge replay projection -> ACP application decoding ->
  package-owned projection -> Desktop Conversation presentation.
- Forbidden path: no Workspace Board fallback, active/recent Canvas inference, fabricated admission,
  repeated completed Tool/turn artifact delivery, Host transcript repository or direct Session-file
  read.

## Contract and path evidence

- The bridge emits `opennekoReplay` for every standard ACP session update and `replay` for every
  extension session event. Live and replay values are explicit producer facts.
- The ACP application rejects an unclassified standard update or extension event before invoking
  Desktop handlers.
- Replay `turn/start` rebuilds the canonical projection but does not consume or fabricate a live
  Canvas target admission.
- Replay completed Tool and turn events do not invoke Desktop artifact delivery or release a live
  turn target. A live `turn/start` without an exact pending admission remains fail-visible.

## Foundational matrix

- Basic and multi-turn conversation: unchanged; live producer/consumer fixtures remain covered.
- Context compaction and continuation: unchanged.
- Transcript restoration after owner/application reopen: directly affected and owned by
  `conversation-persistence-resume`.
- Restored generation records: unchanged; replayed Tool projection remains accepted while delivery
  side effects are suppressed.
- Conversation switching: unchanged.
- Conversation-scoped transcript, queue, configuration, context, artifact and asynchronous-state
  isolation: strengthened by preventing replay from consuming current in-memory Canvas admissions.

## Verification and residual risk

- `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/dsh-bridge` and `@neko/app-desktop`
  typechecks passed.
- Focused deterministic tests passed:
  - Agent contract decoder: 1 file / 16 tests.
  - ACP application/projection/Home projection: 3 files / 48 tests.
  - DSH bridge: 5 files / 52 tests.
  - Desktop product handler/runtime/admission/Session Host: 4 files / 52 tests.
  - Provider-free Q0 harness unit tests: 4 tests.
- The full Agent contract and Agent runtime package runs also passed earlier in the same validation
  chain: 19 files / 120 tests and 53 files / 382 tests respectively.
- Production TypeScript ESLint and targeted Prettier passed. Direct lint of the existing Q0 script
  remains blocked by its pre-existing ESLint environment configuration, which reports Node globals
  such as `process` and `setTimeout`; the new replay assertions add no finding.
- Strict active-change validation and repository-wide OpenSpec validation passed: 163 items.
- Application boundaries passed with 1,372 checked files and no findings. `git diff --check` passed.
- `pnpm test:agent:eval` passed: 45 files / 315 tests; all-suite dry-run selected 27 suites / 82
  cases. This is key-free harness evidence only, not Agent behavior acceptance.
- Full provider-free DSH Q0 built the bridge and all three domain plugins, but failed before reaching
  the history replay assertions: the existing standard Prompt admission qualification timed out
  releasing five Sessions and reported that a queued Prompt entered DSH before an active slot was
  released. This failure is not attributed to the replay metadata path and is retained as a blocker,
  not retried into success.
- Repository-wide Agent and package gates remain red on concurrent unrelated worktree state:
  `submit-comfyui` Tool inventory drift, an absent retired `tool-names.ts`, and active-product
  reachability for `@neko/agent-dsh-plugin`.
- A visible Desktop/provider execution of `conversation-persistence-resume` requires explicit
  provider, model and cost authorization. None was supplied, so the real reopen path remains
  unexecuted and task 7.24 stays open.
