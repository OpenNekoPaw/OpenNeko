# Agent Runtime Boundary

`runtime/` is the host-neutral Agent runtime boundary. It is not a generic
bucket for prompt governance, Skill lifecycle, permission policy, presenters,
projectors, stores, or concrete domain adapters.

## Allowed Runtime Categories

- `session/`: product-owned queue and conversation-run coordination that Pi
  does not provide.
- `turn/`: Host-neutral input, attachment, context, and product-routing
  helpers around the canonical Pi turn. It does not implement an Agent loop.
- `capability/`: Agent-side consumption of `AgentCapabilityProvider`
  contributions. Shared provider contracts stay in `@neko/shared`; concrete
  providers stay in the contributing domain packages.
- `stream/`: Agent event stream projection, stream state, and background task
  observation.
- `projection/`: conversation-owned authoritative turn projection state and
  immutable versioned patches. It has no Webview, Extension, React, Markdown, or
  transport delivery ownership.

The runtime root should contain only package-level exports, shared runtime
types, and small host-neutral collaborators that do not yet justify a narrower
owner. New runtime subdirectories require this document and the architecture
boundary guard to be updated.

## Existing Owner Directories

Prefer existing owner directories before adding runtime files:

| Concern                                                                     | Owner                      |
| --------------------------------------------------------------------------- | -------------------------- |
| Pi Agent, transcript, history, branches, compaction, and Skill execution    | `pi/`                      |
| Context window, token budgets, compression, summarization                   | `context/`                 |
| Project facts, memory file, recall, scratch/shared memory                   | `memory/`                  |
| Draft/plan/task artifact persistence and validation                         | `artifact/`                |
| Workspace paths, preferences, markdown artifact codecs                      | `workspace/`               |
| Prompt modules, prompt files, AGENTS.md overlays, PromptLayer ordering      | `prompt/`                  |
| Skill lifecycle, Skill injection, ToolSet projection, stage persona binding | `skill/`                   |
| Permission decisions, approval strategies, tool traits                      | `permission/`, `approval/` |
| Plan/task view and result projection                                        | `plan/`, `task/`           |
| Commands and slash-command host projection                                  | `commands/`                |
| Message attachments, file mentions, resource projection for message display | `input/`                   |

## Concept Boundaries

- **Pi conversation runtime**: owns Agent execution, cancellation, confirmation,
  transcript, context, branches, compaction, and explicit Skill turns.
- **Product turn bridge**: resolves OpenNeko product settings and projects Pi
  events; it never implements Think/Act/ReAct or a second message history.
- **Context**: transient model-input working set: token budget, context layers,
  compression, summarization, and auto compact.
- **Memory**: durable or cross-session facts: project memory files, recall, and
  shared scratch memory. Memory may feed context or prompt modules, but it is
  not the context window.
- **Capability**: in Agent runtime means consuming `AgentCapabilityProvider`
  contributions into Agent registries. Other monorepo capability concepts
  remain with their own packages.

## Current Audit

| Category               | Canonical files                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session product state  | `session/agent-message-queue.ts`, `session/conversation-run-registry.ts`                                                                                                                                                                                                                                                                                                                                                              |
| Turn product adapters  | `turn/message-runtime.ts`, `turn/agent-turn-context.ts`, `turn/multimodal-context-packet.ts`, `turn/media-turn-runtime.ts`, `turn/timeline-context-runtime.ts`, `turn/canvas-ambient-context-runtime.ts`, `turn/context-control-runtime.ts`, `turn/workspace-input-processor-runtime.ts`                                                                                                                                        |
| Capability consumption | `capability/capability-registry-runtime.ts`, `capability/capability-runtime-bindings.ts`, `capability/capability-runtime-registries.ts`, `capability/agent-content-access-runtime.ts`, `capability/external-processor-runtime.ts` |
| Stream                 | `stream/agent-event-stream-runtime.ts`, `stream/agent-stream-background-task.ts`, `stream/agent-stream-state.ts`, `stream/agent-stream-task-observer.ts`                                                                                                                                                                                                                                                                             |
| Projection             | `projection/conversation-projection-store.ts` with shared contracts/projector in `@neko-agent/types`                                                                                                                                                                                                                                                                                                                                 |
| Existing owner moves   | `artifact/artifact-service.ts`, `artifact/node-artifact-store.ts`, `input/attachment-projection.ts`, `input/message-resource-projector.ts`, `session/context-host-message.ts`, `session/conversation-host-message.ts`                                                                                                                                                                                                                |
| Root collaborators     | `document-module-diagnostics.ts`, `persisted-child-run-ownership.ts`, `resource-cache-runtime.ts`                                                                                                                                                                                                                                                                 |

`runtime/index.ts` exposes only retained product adapters. The replaced
Executor/AgentSession/AgentRunner public surface is intentionally removed.

## Session Isolation Identity Model

Agent chat isolation uses layered local identities:

| Identity         | Owner                  | Scope                                                                                                                                              |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabId`          | Webview / Extension UI | View binding only. It restores which conversation a tab shows, but it does not own runtime state.                                                  |
| `conversationId` | Agent session          | Complete session owner for transcript, prompt mode, Skill projection, context, queues, tasks, logs, and UI actions.                                |
| `turnId`         | Agent turn runtime     | One chat turn. Model calls, ordinary tool calls, and turn timeline logs use `{ conversationId, turnId, requestId }`.                               |
| `runId`          | Durable work lease     | Long-lived workflows, artifacts, media/background tasks, terminal/process handles, and cancellable task observers use `{ conversationId, runId }`. |

`runId` is not a generic alias for `turnId`. Ordinary LLM/tool logs omit
`runId` when it would duplicate the turn identity. Durable work may include the
initiating `turnId` for correlation, but partitioning and cancellation use the
real `runId`.

## Logs And Storage Boundaries

- Active model-call JSONL is physically scoped to
  `.neko/logs/conversations/<conversationId>/model-calls.jsonl`. Its `seq` is
  writer-local diagnostic order and `writerId` distinguishes concurrent local
  writers; `partition` and `partitionSeq` remain scoped to
  `{ conversationId, turnId, requestId }`.
- Active workspace NDJSON event sinks are physically scoped to
  `.neko/logs/conversations/<conversationId>/{events,audits,steps}.jsonl`.
  Their `seq` is writer-local diagnostic order and `writerId` distinguishes
  concurrent local writers; `partition` and `partitionSeq` remain scoped to
  `{ conversationId, runId }` when a run exists, or `{ conversationId, turnId }`
  for turn-only events.
- Per-conversation journals are the transcript authority. Recovery and
  projection must request the target `conversationId` explicitly and must not
  infer ownership from the current active tab or active conversation.
- Extension and TUI share one user-level `~/.neko/neko.db`. Serializable
  Task/Run recovery uses state-owned tables; conversation/catalog and other
  rebuildable metadata use cache-owned tables. Workspace rows always carry an
  explicit `workspaceId`; normal runtime cannot construct the retired JSON or
  Memento stores.
- VS Code `workspaceState` remains limited to Host view projection such as tabs,
  active selection, scroll, and panel state. It is not a conversation, Task, or
  runtime session authority.
