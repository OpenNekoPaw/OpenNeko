# Evaluation Plan

## Evaluation Scope

- Change/feature: replace generic Agent Task/TaskManager execution with AgentRun-owned ToolCallExecution while preserving concrete domain Jobs and explicit Subagent runs; standalone BackgroundAgentRun is removed.
- Decision and owning suites:
  - `update` `agent-runtime.workflow-controller/media-tool-terminal-result` for terminal media Tool results, Pi cancellation propagation and absence of Task continuation;
  - `update` `agent-runtime.creative-media-workflow/generated-output-workspace-board` for terminal generated-output delivery through the Canvas-owned ledger;
  - future SubagentRun producer coverage and GenerationJob work remains pending and does not claim coverage from these cases.
- Canonical path: Pi AgentRun -> capability Tool bridge -> ToolCallExecution -> owning domain executor/provider -> same ToolCall terminal result.
- Forbidden fallback: generic TaskManager, TaskRef, task continuation, generic TaskCard, legacy Platform/Vercel chat path, active-tab owner inference.

## Cases

- Canonical positive: a real media-capable Agent Tool streams progress under one toolCallId and returns a terminal ResourceRef without creating a Task.
- Cancellation boundary: interrupting the originating Agent Run cancels the Tool/provider observer, rejects late progress, releases resources, and produces no continuation.
- Board delivery: a terminal generated-output ResourceRef reaches the Canvas-owned ledger without TaskManager, TaskRef or task continuation.
- Pending delegated lifecycle: an explicitly created SubagentRun follows its committed owner policy and stops only through exact interrupt or owner cancellation.
- Pending domain recovery: a recoverable GenerationJob is reattached by a new Tool Call with a stable jobId; the original toolCallId remains terminal.
- Evidence: effective Agent/turn/tool identities, Tool lifecycle facts, terminal result, resource identity, Board projection and forbidden-path counters.
- Missing observability remains for application-supervisor ownership transfer and Media-owned GenerationJob reattach/reconciliation.

## Verification

- `pnpm test:agent:eval` passed: 39 files / 277 tests and 23 suites / 48 indexed dry-runs.
- Focused dry-runs passed:
  - `agent-runtime.workflow-controller/media-tool-terminal-result`
  - `agent-runtime.creative-media-workflow/generated-output-workspace-board`
- Deterministic path tests passed for exact ToolCallExecution identity, ExecutionOwnershipRegistry attach/transfer/cancel/release, Pi AbortSignal forwarding, same-toolCall progress, terminal media results, stable generated-output refs, Extension delivery and TaskManager source absence, including the retired `@neko/shared` TaskManager/Task View DTO files and barrel exports.
- Canvas storyboard no longer exposes generic `TaskProjection`, `AgentTaskResult`, `taskRef`, `taskRefs` or `agentResult` success contracts. Retired serialized fields fail with `retired-storyboard-task-contract`; Canvas keeps only domain result refs with durable `canvasRef` or `mediaRef` identity. Canvas direct generation and Cut export remain owned by their existing domain runtimes.
- Focused package verification passed: Agent 7 files / 52 tests, Platform 4 / 32, Extension 4 / 17 and TUI 4 / 78; `pnpm --filter neko-agent compile` passed.
- Repository verification passed for `pnpm build`, all 27 `pnpm test` Turborepo tasks, `pnpm check:deps`, `pnpm check:agent-boundaries`, strict OpenSpec validation and `git diff --check`. The final post-deletion package suites included Agent 1000 passed plus one existing harness skip, Webview 713, Extension 449, TUI 513 and Shared 1447.
- `pnpm check` was executed and stopped at the repository's existing `check:unused` debt; `pnpm check:deps` was then run separately and passed.
- `pnpm check:legacy-debt` remains blocked by four existing `neko-quality/rejectLegacyMediaPathRequest` findings outside the Agent Task lifecycle boundary.
- `pnpm check:unused` remains blocked by repository-wide baseline debt. The deleted TaskManager, TaskRef, TaskCard, continuation, delivery-host and stream-processor sources are covered by source-absence checks rather than compatibility adapters.
- Provider-backed case `agent-runtime.workflow-controller/media-tool-terminal-result` was run as `task-lifecycle-media-terminal-20260724` with effective model `nekoapi-chat/gpt-5.6-luna` and failed. The effective session did not register `GenerateImage` or `ReadImage`; the Agent called only `read_skill`, returned a fail-visible unavailable-tool answer and produced no artifact. `no-generic-task-path`, terminal-idle and answer gates passed, while Pi durability was `volatile`. Usage: 53,144 ms, 0 retries, 7,790 input tokens and 1,234 output tokens. Report: `reports/agent-eval/agent-runtime.workflow-controller/media-tool-terminal-result/task-lifecycle-media-terminal-20260724/`.
- A sanitized user-config audit then confirmed an enabled default image model, an enabled image-capable provider and available credentials. The canonical Evaluation runner was also confirmed to launch `apps/neko-tui/dist/main.js`; the rebuilt executable contains the `createPlatform -> registerMediaAgentTools` assembly and is newer than the relevant media registration sources.
- The provider-backed case was run once more under the unique run id `task-lifecycle-media-terminal-configured-20260724`. It reached a durable Pi turn but the main chat provider returned a 524 proxy read timeout before producing any Agent iteration or Tool Call. Consequently `GenerateImage`, the configured image provider and `ReadImage` were never invoked, and no artifact was produced. `pi-runtime`, `no-generic-task-path` and terminal-idle gates passed; runtime, Tool, artifact, order and answer gates failed. Usage: 126,678 ms, 0 retries and 0 reported tokens. Report: `reports/agent-eval/agent-runtime.workflow-controller/media-tool-terminal-result/task-lifecycle-media-terminal-configured-20260724/`.
- Both failed real runs were retained and neither was retried into success. Dry-runs and mock-backed deterministic tests are not real Agent behavior acceptance.
- The Extension Development Host Timeline scenario passed projection reattach and cancellation, but does not substitute for a real media provider run or packaged Desktop lifecycle acceptance.

## Interpretation

- Deterministic evidence proves the implemented linked media path waits for terminal Tool results and cannot rediscover the deleted generic Task runtime.
- The second real run no longer supports the earlier missing-image-configuration hypothesis: current image configuration and built Tool registration are present, but the main chat request failed before the model could select any Tool. It therefore neither validates nor rejects the configured image-generation provider path.
- It does not prove provider-backed media behavior or packaged Desktop lifecycle. Subagent supervision has no production producer in this change and requires an independent OpenSpec when introduced; GenerationJob recovery is owned by its active domain change.
- A correct final answer, dry run or TaskManager-shaped compatibility adapter cannot satisfy the pending runtime acceptance.

## Residual Risk

- Real media acceptance remains open: the original run lacked media Tool participation, while the rebuilt/configured run was blocked by the main chat provider before any Tool Call. No artifact or terminal media Tool result was observed.
- The non-Agent TUI direct-media command currently waits for a linked terminal result but does not forward `MediaGenerationExecutionOptions.onProgress` or an `AbortSignal` to its runtime/presentation contract. This is not a reason to restore generic TaskManager, but direct-mode progress and cancellation remain unaccepted until the local operation contract projects them.
- Packaged Desktop lifecycle evidence remains open where that Host path becomes available.
- Subagent supervision remains a producer-triggered follow-up change; standalone BackgroundAgent contracts are not retained speculatively.
- Existing `tasks` / `task_checkpoints` SQLite tables remain only as the Canvas Board delivery ledger to protect local user data; Agent runtime no longer consumes them as generic Task storage.
- Provider cancellation may be advisory after remote submission; outcome-unknown and reconciliation semantics must remain provider/domain-owned and explicitly tested.
- Repository-wide unused-code and legacy-media-path findings remain separate baseline debt; they do not restore or validate the deleted generic Task runtime.
