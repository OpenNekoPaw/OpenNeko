# Evaluation Plan

## Evaluation Scope

- Change/feature: replace Extension/Webview/TUI parallel active-stream authorities with one host-neutral Pi Timeline projector and conversation-scoped projection store.
- Decision and owning suite: `update` `agent-runtime.stream-delivery`.
- Why real Evaluation is required: the change affects real Pi streaming, Tool result delivery, cancellation, terminal state, TUI projection and Host recovery behavior.
- Canonical path: canonical TUI input -> Pi conversation runtime -> `PiProductAgentEvent` -> shared Timeline projector -> conversation projection store -> Host renderer.
- Forbidden fallback: direct turn runner, mock provider acceptance, legacy `AgentEvent` production projection, TUI direct Pi conversation-store mutation, Extension mutable `Message` / `ContentBlock`, legacy Webview active-content message or renderer-local stream fallback.

## Cases

### Updated existing cases

- `agent-runtime.stream-delivery/tool-text-order-final-answer`
  - User behavior: a Tool-using turn renders Tool state, ordered assistant text and a terminal answer.
  - Evidence: exact conversation/turn/run/message/tool identity, shared Timeline projector identity, monotonically increasing projection/item revisions, Tool result on the original item, terminal completion and fully idle state.
  - Forbidden path evidence: no legacy stream/message adapter, no direct TUI Pi mutation and no duplicate Tool/message authority.
  - Expected fail-visible behavior: missing Tool anchor, stale revision or incomplete terminal projection fails the hard gate.
- `agent-runtime.stream-delivery/active-stream-cancellation`
  - User behavior: cancelling an active turn produces one cancelled terminal projection and no later visible update.
  - Evidence: cancel identity, terminal completion, final projection version, zero accepted post-terminal mutations and fully idle state.
  - Forbidden path evidence: no secondary accumulator appends text or Tool result after cancellation.
- `agent-runtime.stream-delivery/read-document-tool-result`
  - User behavior: one `ReadDocument` Tool result is rendered and followed by the final answer.
  - Evidence: one Tool item, strict result diagnostic/data, stable resource/artifact refs where present, ordered final text and no generic/legacy result projection.

### Coverage delta

- `canonical`: update the Tool/text ordering case with projection path facts.
- `workflow`: update cancellation and terminal-idle evidence.
- `boundary`: cover stale patch/attachment replacement through deterministic and Extension functional evidence; add a TUI case only if the canonical input path can expose the required neutral facts.
- `failure`: require unknown Tool anchor, terminal mutation and projection gap to fail visibly.
- `regression`: poison legacy active-content dispatch and direct TUI/Extension stream mutation.
- `artifact`: existing Tool result stable refs are checked when produced; this change does not create a new durable artifact.
- `paraphrase`: not applicable because the behavior is transport/runtime ordering, not intent or Skill triggering.
- `quality`: not applicable; output content quality is unchanged and no Judge is needed.
- `holdout`: not applicable because this is not Prompt/Skill optimization.

## Evidence and Observability

Required runtime evidence:

- requested/effective conversation, turn, run, message and Tool identities;
- canonical runtime identity confirming Pi;
- shared Timeline projector/store path identity;
- projection and item revisions, terminal completion and gap/dropped counts;
- Tool start/confirmation/result ordering;
- cancellation and fully idle state;
- stable resource/artifact identity when a Tool returns one;
- absence of legacy/fallback participation.

Existing indexed cases already expose Pi, Tool, Markdown, cancellation and terminal facts. Implementation must audit whether they expose bounded projection identity/version and post-terminal mutation counts. If not, add minimal evaluation-neutral runtime facts owned by the TUI projection boundary. Do not add suite/case/pass flags or infer the path from final-answer text.

Deterministic source/contract tests own proof that deleted Webview message types, handlers and dual-write functions are absent or poisoned. Real TUI evidence cannot prove VS Code attachment/Webview rendering, so an owning Extension Development Host functional scenario is additionally required.

## Verification Results

### Key-free and deterministic evidence

- `pnpm test:agent:eval`: passed, 39 files and 277 tests; 23 suites and 48 indexed dry-runs passed.
- Selected dry-runs passed for `tool-text-order-final-answer`, `active-stream-cancellation` and `read-document-tool-result`.
- Shared projector/store, TUI, Extension attachment, Webview replica, legacy poison and source-absence regressions passed in their affected package suites.
- A separate TUI projection-gap case was not added. Deterministic gap/fatal recovery tests plus the Extension attachment replacement scenario prove the boundary without adding a suite-specific TUI input path.

### Real TUI evidence

All real runs used the canonical TUI path and effective model `nekoapi-chat/gpt-5.6-luna`. Failed cases were retained and were not retried into success.

- `active-stream-cancellation`
  - Run: `timeline-authority-cancel-fixed-20260723`
  - Outcome: `pass`
  - All six hard gates passed: runtime, Pi runtime, shared projection, cancellation, terminal state and no legacy projection.
  - Usage: 914 ms, 0 retries; provider token usage was reported as zero.
  - Report: `reports/agent-eval/agent-runtime.stream-delivery/active-stream-cancellation/timeline-authority-cancel-fixed-20260723/`
- `tool-text-order-final-answer`
  - Run: `timeline-authority-tool-order-built-20260723`
  - Outcome: `case-fail`
  - The model did not call `GetContext`; the Tool/projection/order gates therefore failed. The turn also reported `volatile` durability where the case requires `durable`.
  - Runtime, idle, table, Markdown and no-legacy gates passed.
  - Usage: 13,990 ms, 0 retries, 10,543 input tokens and 491 output tokens.
  - Report: `reports/agent-eval/agent-runtime.stream-delivery/tool-text-order-final-answer/timeline-authority-tool-order-built-20260723/`
  - Run: `timeline-authority-tool-order-rerun-20260724`
  - Outcome: `case-fail`
  - The provider stream ended without `finish_reason`; the runtime failed visibly and the Timeline reached terminal `failed`. `GetContext` was not called, so Tool/order/final-answer gates did not pass.
  - Pi runtime, idle, Markdown and no-legacy gates passed.
  - Usage: 69,590 ms, 0 retries, 7,381 input tokens and 346 output tokens.
  - Report: `reports/agent-eval/agent-runtime.stream-delivery/tool-text-order-final-answer/timeline-authority-tool-order-rerun-20260724/`
- `read-document-tool-result`
  - Run: `timeline-authority-read-document-20260723`
  - Outcome: `case-fail`
  - The provider returned `Concurrency limit exceeded for user, please retry later`; `ReadDocument` was not called, the Timeline terminated as failed and the expected final answer was absent.
  - Idle, Pi runtime and no-legacy gates passed.
  - Usage: 33,270 ms, 0 retries; provider token usage was unavailable and reported as zero.
  - Report: `reports/agent-eval/agent-runtime.stream-delivery/read-document-tool-result/timeline-authority-read-document-20260723/`
  - Run: `timeline-authority-read-document-rerun-20260724`
  - Outcome: `pass`
  - All seven hard gates passed: runtime, idle, Pi runtime, `ReadDocument`, projection, final answer and no legacy projection.
  - Usage: 39,605 ms, 0 retries, 7,757 input tokens and 817 output tokens.
  - Report: `reports/agent-eval/agent-runtime.stream-delivery/read-document-tool-result/timeline-authority-read-document-rerun-20260724/`

All failed runs remain release-readiness evidence. The new ReadDocument run closes its earlier provider-concurrency blocker. The Tool-order case remains unaccepted: its latest failure is attributed to a provider stream protocol error, while its earlier missing Tool call and volatile durability still require separate ownership analysis. These failures do not invalidate the deterministic single-authority path proof, but the focused real-case acceptance set is not fully green.

### Extension Development Host

The owning functional scenario was rerun after deleting the Webview's parallel
message/streaming Maps and passed in VS Code Extension Development Host 1.129.1
on arm64 with the isolated `neko-test` fixture. The observed canonical path was:

`pi-product-event -> shared-pi-timeline-projector -> conversation-projection-store -> projection-attachment -> webview-tab-replica`

- A clean first run reached projection versions 5 / 9 / 10 and confirmed Tool success, cancellation terminal state and zero persistence writes in the Extension output log.
- A second attachment-observable run started at projection version 15. Hiding and reopening the owning Webview replaced attachment `4bb0a121-bd52-41f7-8c95-4d6796e51cca` with `065e92d6-92d3-4614-ac1e-a1c0a818d0fa` and endpoint `0ad12bae-b28d-402c-922a-d20eda9ea67c` with `43bfe54c-dd6b-4cb9-91ba-d4212166cd43`.
- The replacement delivered a fresh snapshot at projection version 15 / sequence 0, then post-ACK Tool result, Markdown and cancellation patches reached version 19 / sequence 4.
- Cancel produced terminal version 20 / sequence 5 with zero streaming markers and zero confirmation buttons.
- Legacy active-content elements, provider calls and persistence writes were all zero.
- No runtime console error was observed. The only host warning was VS Code's `Unrecognized feature: 'local-network-access'.`
- Report: `reports/webview-functional/neko-agent/timeline-projection-authority-20260724/report.json`
- Screenshot: `reports/webview-functional/neko-agent/timeline-projection-authority-20260724/final.png`

### Repository gates

- `pnpm build`: passed, 10/10 Turborepo tasks, including Rust Engine/N-API, Agent and Webview builds.
- `pnpm test`: passed, 27/27 Turborepo tasks.
- `pnpm --filter neko-agent test -- --run`: passed, 64 files and 474 tests.
- `pnpm --filter @neko/app-tui test`: passed, 90 files and 539 tests.
- Extension functional driver tests: passed, 2 tests.
- Extension strict typecheck: passed.
- Webview full suite: passed, 93 files and 713/713 tests.
- Agent boundary check: passed its 34-case self-test and scanned 1,285 files with zero findings.
- `pnpm check:deps`: passed, 1,563 modules and 5,517 dependencies with zero violations.
- `pnpm --filter neko-agent compile`, Engine/tools/preview compile, strict OpenSpec validation, `pnpm check:openspec` and `git diff --check`: passed.
- `pnpm --filter @neko/app-tui typecheck`: failed on existing unrelated TUI debt. All errors introduced by this change around `runId` and `timelineProjection` were cleared; remaining errors concern `activeRecords`, direct-media generated assets, `TaskInput.prompt`, `UseAgentSessionOptions.service`, asset APIs/paths, input reader strictness, AI SDK `BlobPart`, `Headers.entries`, platform adapters and stale test-utils exports.
- `pnpm check:legacy-debt`: failed on four existing `rejectLegacyMediaPathRequest` findings in `packages/neko-quality`, outside this Agent change.
- `pnpm check:unused`: failed on repository baseline debt: 61 unused files, 603 unused exports, `@vscode/codicons` and `protobufjs`. The unlisted Extension test dependency exposed during this change was fixed and no longer appears.
- `pnpm check`: was executed and stopped at the baseline `check:unused` failure before `check:deps`; the latter was then run separately and passed.

Stable architecture documentation was not updated because implementation did not reveal a new long-lived contract beyond the accepted single-authority ADR and this OpenSpec's scoped contracts.

## Interpretation

Replacement-path acceptance requires deterministic path gates and the Extension Development Host scenario to pass; both did. Real TUI behavior remains explicitly qualified because one behavior/configuration case and one provider-boundary case failed. A correct-looking final answer, key-free harness pass, dry-run, direct runtime injection or ordinary browser render does not prove the replacement.

Target behavior failures, missing observability, provider/configuration failures and Extension debugger infrastructure failures must be classified separately. A behavior failure is retained and is not retried into success.

## Residual Risk

- `tool-text-order-final-answer` still needs ownership analysis for the earlier missing `GetContext` call and volatile durability, plus a provider stream that reaches a valid `finish_reason`, before the focused real acceptance set is green.
- `read-document-tool-result` passed once after the retained provider-concurrency failure; this single sample does not establish provider stability.
- Pi Session durability and terminal history reconstruction must remain explicit when active `Message` mutation is removed.
- Generic Task/TaskCard removal remains owned by `replace-agent-task-with-tool-call-lifecycle`; this change may project existing work items but cannot declare that migration complete.
- Full renderer representation convergence follows after the Timeline contract is stable.
- Repository-wide TUI typecheck, unused-code and legacy-debt gates remain red for the baseline issues recorded above.
