## 1. Architecture and contracts

- [x] 1.1 Remove standalone BackgroundAgentRun and define Tool Call, foreground Agent Run, SubagentRun, domain Job, and transient ownership responsibilities
- [x] 1.2 Define cancellation, detach, recovery/reattach, page close, ownership transfer, and fail-visible identity semantics
- [x] 1.3 Record the stable ADR and mark conflicting generic Task/TaskRef decisions as superseded
- [x] 1.4 Define content-creation scenario ownership for media generation, Canvas actions, Cut export, Assets import, and future Character/World runs

## 2. Runtime migration

- [x] 2.1 Add the minimal ToolCallExecution and ExecutionOwnershipRegistry contracts with instance-scoped cancellation and release tests
- [x] 2.2 Make Agent media Tools wait for terminal media executor results, project progress under one toolCallId, and propagate the Pi AbortSignal
- [x] 2.3 Audit detached/recoverable media producers and move the later-discovered GenerationJob production lifecycle into the dedicated `introduce-domain-job-lifecycle-kernel` change
- [x] 2.4 Remove BackgroundAgentRun references and no-producer runtime/UI paths while retaining Subagent contracts without adding an empty supervisor
- [x] 2.5 Keep Canvas direct actions and Cut export on their owning domain ports and remove the residual generic Task projection/result contracts
- [x] 2.6 Replace TaskCard/AgentTaskQueue terminology and routes with Tool execution, Plan Progress, Agent Activity, and concrete domain activity
- [x] 2.7 Move Canvas Board delivery and any other non-Agent table consumers to owning-domain ledgers, then delete generic TaskManager, TaskRef, task continuation, task handlers/storage/exports, compatibility branches, and fallback success paths
- [x] 2.8 Define explicit prelaunch disposition for existing task rows while preserving already materialized user resources

## 3. Deterministic and runtime verification

- [x] 3.1 Add path tests that poison TaskManager and prove Pi signal, Tool progress, terminal result, and resource cleanup use the new canonical path
- [x] 3.4 Update and run the focused real Agent Evaluation cases defined in `evaluation.md`; retain canonical-path and no-fallback evidence
- [ ] 3.5 Validate packaged Electron Desktop lifecycle/streaming scenarios where implemented
- [x] 3.6 Run affected builds/tests/checks, strict OpenSpec validation, legacy/unused-code gates, and `git diff --check`

## 4. Deferred producer-triggered changes

- SubagentRun supervision requires a separate OpenSpec and owner-graph acceptance when a production producer is introduced.
- Detached/recoverable GenerationJob is implemented and tracked by the separate `introduce-domain-job-lifecycle-kernel` and `extract-generation-domain-package` changes.

## 5. Documentation-only verification for this decision

- [x] 5.1 Validate the OpenSpec artifacts and architecture links
- [x] 5.2 Run Markdown diff hygiene checks
- [x] 5.3 Record that no real Agent Evaluation is claimed before runtime behavior changes
