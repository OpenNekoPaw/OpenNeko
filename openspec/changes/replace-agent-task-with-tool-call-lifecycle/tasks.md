## 1. Architecture and contracts

- [x] 1.1 Define Tool Call, foreground/background Agent Run, SubagentRun, domain Job, and transient ownership responsibilities
- [x] 1.2 Define cancellation, detach, recovery/reattach, page close, ownership transfer, and fail-visible identity semantics
- [x] 1.3 Record the stable ADR and mark conflicting generic Task/TaskRef decisions as superseded
- [x] 1.4 Define content-creation scenario ownership for media generation, Canvas actions, Cut export, Assets import, and future Character/World runs

## 2. Runtime migration

- [ ] 2.1 Add the minimal ToolCallExecution and ExecutionOwnershipRegistry contracts with instance-scoped cancellation and release tests
- [ ] 2.2 Make Agent media Tools wait for terminal media executor results, project progress under one toolCallId, and propagate the Pi AbortSignal
- [ ] 2.3 Introduce Media-owned GenerationJob only for explicit detached/recoverable paths and support reattach through a new Tool Call
- [ ] 2.4 Move BackgroundAgentRun and SubagentRun live ownership to the application Agent supervisor with creator provenance and explicit interrupt operations
- [ ] 2.5 Migrate Canvas direct actions and Cut export to their owning domain ports without generic TaskManager participation
- [ ] 2.6 Replace TaskCard/AgentTaskQueue terminology and routes with Tool execution, Plan Progress, Agent Activity, and concrete domain activity
- [ ] 2.7 Move Canvas Board delivery and any other non-Agent table consumers to owning-domain ledgers, then delete generic TaskManager, TaskRef, task continuation, task handlers/storage/exports, compatibility branches, and fallback success paths
- [ ] 2.8 Define explicit prelaunch disposition for existing task rows while preserving already materialized user resources

## 3. Deterministic and runtime verification

- [ ] 3.1 Add path tests that poison TaskManager and prove Pi signal, Tool progress, terminal result, and resource cleanup use the new canonical path
- [ ] 3.2 Add owner graph tests for Tab/Window close, Agent interruption, spawn ownership transfer, background/subagent survival, and exact explicit cancellation
- [ ] 3.3 Add domain Job tests for linked/detached cancellation, reattach with a new toolCallId, provider reconciliation, and atomic artifact commit
- [ ] 3.4 Update and run the focused real Agent Evaluation cases defined in `evaluation.md`; retain canonical-path and no-fallback evidence
- [ ] 3.5 Validate VS Code Extension Development Host and packaged Desktop lifecycle/streaming scenarios where implemented
- [ ] 3.6 Run affected builds/tests/checks, strict OpenSpec validation, legacy/unused-code gates, and `git diff --check`

## 4. Documentation-only verification for this decision

- [x] 4.1 Validate the OpenSpec artifacts and architecture links
- [x] 4.2 Run Markdown diff hygiene checks
- [x] 4.3 Record that no real Agent Evaluation is claimed before runtime behavior changes
