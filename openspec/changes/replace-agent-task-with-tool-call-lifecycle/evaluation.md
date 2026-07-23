# Evaluation Plan

## Evaluation Scope

- Change/feature: replace generic Agent Task/TaskManager execution with AgentRun-owned ToolCallExecution while preserving concrete domain Jobs and explicit background Agent/Subagent runs.
- Current artifact-stage decision: `excluded` for this documentation-only step. No prompt, Skill, capability registration, Tool implementation, runtime route, or Host projection changes in this step, so deterministic OpenSpec/link/diff validation is sufficient and real Agent behavior cannot yet differ.
- Implementation-stage owning suites:
  - `update` `agent-runtime.stream-delivery` for Tool progress/result identity, Pi cancellation propagation, and absence of Task continuation;
  - `update` `agent-runtime.creative-media-workflow` for terminal media Tool results versus explicit Media-owned GenerationJob;
  - `update` `agent-runtime.workflow-controller` for BackgroundAgentRun/SubagentRun survival and exact interruption.
- Canonical path: Pi AgentRun -> capability Tool bridge -> ToolCallExecution -> owning domain executor/provider -> same ToolCall terminal result.
- Forbidden fallback: generic TaskManager, TaskRef, task continuation, generic TaskCard, legacy Platform/Vercel chat path, active-tab owner inference.

## Cases

- Canonical positive: a real media-capable Agent Tool streams progress under one toolCallId and returns a terminal ResourceRef without creating a Task.
- Cancellation boundary: interrupting the originating Agent Run cancels the Tool/provider observer, rejects late progress, releases resources, and produces no continuation.
- Independent lifecycle: an explicitly created BackgroundAgentRun or SubagentRun survives source Tab disposal and stops only through exact interrupt.
- Domain recovery: a recoverable GenerationJob is reattached by a new Tool Call with a stable jobId; the original toolCallId remains terminal.
- Evidence: effective Agent/turn/tool identities, Tool lifecycle facts, provider/domain execution identity, terminal result, cancellation facts, owner transfer facts, and forbidden-path counters.
- Missing observability to close before implementation acceptance: neutral facts for owner attachment/transfer and explicit proof that generic TaskManager/TaskRef were not invoked.

## Verification

- Current key-free validation: strict OpenSpec validation and documentation checks only.
- Current real cases and reports: not run because runtime behavior is unchanged.
- Implementation verification: validate affected indexed suites key-free, then run the focused cases through the real TUI/provider path with available credentials and retain assertion-level reports.
- Host lifecycle projection additionally requires Extension Development Host and, once available, packaged Desktop acceptance; browser-only testing is insufficient.

## Interpretation

- Passing documentation validation proves only that the decision and implementation constraints are internally structured.
- It does not prove Tool cancellation, streaming, background survival, domain recovery, or no-Task fallback behavior.
- Runtime acceptance requires path evidence; a correct final answer, mock provider, dry run, or TaskManager-shaped compatibility adapter cannot satisfy it.

## Residual Risk

- Current TaskRef/TaskManager behavior remains the code path until tasks in sections 2 and 3 are implemented.
- Existing evaluation facts may use task terminology and need a schema-compatible, fail-visible replacement rather than text-only renaming.
- Provider cancellation may be advisory after remote submission; outcome-unknown and reconciliation semantics must remain provider/domain-owned and explicitly tested.
