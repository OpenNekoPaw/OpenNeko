# Agent Runtime Boundary

`runtime/` contains host-neutral OpenNeko product adapters around the canonical Pi conversation runtime.
It does not implement an Agent loop, transcript store, Skill lifecycle, permission policy, Webview transport
or concrete domain execution.

System contracts are defined by:

- [`docs/architecture/agent.md`](../../../../../../docs/architecture/agent.md)
- [`docs/architecture/adr-pi-agent-runtime.md`](../../../../../../docs/architecture/adr-pi-agent-runtime.md)
- [`packages/neko-agent/ARCHITECTURE.md`](../../../../ARCHITECTURE.md)

## Allowed categories

- `session/`: product-owned message queue, conversation/run coordination and execution ownership that Pi
  does not provide.
- `turn/`: input, attachment, context, artifact collection and product-routing helpers around one Pi turn.
- `capability/`: consumption of `AgentCapabilityProvider` contributions and Host-injected content/external
  processor/research ports.
- `host-controller/`: Host-neutral Agent message connection identity, typed transport, shared
  conversation/turn/queue/Tool/Mermaid/config/settings/Skill/context/content/projection routing
  and responsibility-specific effect ports. It cannot import VS Code, Electron, Pi instances,
  projection owners or concrete Host effects.
- `stream/`: reserved owner for host-neutral Pi event-stream state and background observation when those
  collaborators require a directory; it must not become a second event bus or transport layer.
- `projection/`: conversation-owned authoritative projection state, operation buffering and immutable
  versioned changes.

The runtime root contains package exports and small host-neutral collaborators only. New subdirectories
require a stable responsibility and an architecture-boundary update.

## Existing owners

Prefer the established owner before adding runtime code:

| Concern                                                                       | Owner                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| Pi Agent, Session JSONL, branches, compaction, model execution and Skill read | `pi/`                                       |
| Prompt modules, prompt files and AGENTS overlays                              | `prompt/`                                   |
| Permission and approval policy                                                | `permission/`, `approval/`                  |
| Project memory and recall                                                     | `memory/`                                   |
| MCP transport and registration                                                | `mcp/`                                      |
| Tool definitions and domain contribution adapters                             | `tools/` and contributing package           |
| Provider cards and flat model-purpose projection                              | `provider/`, Host configuration composition |
| Message attachments and display-resource projection                           | `input/`                                    |
| Slash-command intent and Host projection                                      | `commands/`                                 |
| Workspace path/config codecs                                                  | `workspace/`                                |

No owner exists for a legacy Executor, AgentSession, ReAct loop, activation-based Skill lifecycle, generic
Task continuation or duplicate Journal. Those concepts must not be reintroduced beside Pi.

## Concept boundaries

- **Pi conversation runtime** owns Agent execution, Tool scheduling, cancellation, confirmation,
  transcript/context, branches, compaction and actual Skill input.
- **Product turn bridge** freezes OpenNeko configuration, supplies permission/Capability/domain ports and
  projects Pi events. It never implements Think/Act/ReAct or a second message history.
- **Context** is the transient model input produced by Pi Session/context policy.
- **Memory** is durable or cross-session product information that may feed context but is not the transcript.
- **Capability** means consuming typed package contributions; concrete behavior and facts remain with the
  contributing package.
- **Domain Job** means independently recoverable work owned by Generation, Cut or another concrete domain.
  Agent runtime observes it only through the exact domain port.

## Canonical files

| Category               | Files                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session product state  | `session/agent-message-queue.ts`, `session/conversation-run-registry.ts`, `session/execution-ownership.ts`                                                                                                                                                                                                                                              |
| Turn adapters          | `turn/message-runtime.ts`, `turn/agent-turn-context.ts`, `turn/multimodal-context-packet.ts`, `turn/timeline-context-runtime.ts`, `turn/canvas-ambient-context-runtime.ts`, `turn/context-control-runtime.ts`, `turn/workspace-input-processor-runtime.ts`, `turn/creator-visible-artifact-collector.ts`                                                |
| Capability consumption | `capability/capability-registry-runtime.ts`, `capability/capability-runtime-bindings.ts`, `capability/capability-runtime-registries.ts`, `capability/agent-content-access-runtime.ts`, `capability/external-processor-runtime.ts`                                                                                                                       |
| Host controller        | `host-controller/agent-host-controller-contract.ts`, `host-controller/agent-host-message-controller.ts`, `host-controller/agent-conversation-controller.ts`, `host-controller/agent-config-controller.ts`, `host-controller/agent-skill-controller.ts`, `host-controller/agent-content-controller.ts`, `host-controller/agent-projection-controller.ts` |
| Projection             | `projection/conversation-projection-store.ts`, `projection/conversation-projection-operation-buffer.ts`                                                                                                                                                                                                                                                 |
| Root collaborators     | `agent-entry-intent-runtime.ts`, `agent-state-runtime.ts`, `config-bridge-runtime.ts`, `conversation-route-runtime.ts`, `conversation-tab-runtime.ts`, `plugin-transfer-runtime.ts`, `subagent-event-runtime.ts`, `document-module-diagnostics.ts`                                                                                                      |

`runtime/index.ts` exposes retained product adapters only. `Executor`, `AgentSession` and `AgentRunner`
public surfaces are intentionally absent.

## Identity and isolation

| Identity          | Owner                           | Scope                              |
| ----------------- | ------------------------------- | ---------------------------------- |
| `tabId`           | Webview/Extension               | view binding only                  |
| `conversationId`  | OpenNeko conversation aggregate | complete conversation runtime      |
| `branchId`        | OpenNeko product metadata       | active or historical branch        |
| Pi `sessionId`    | Pi Session                      | one branch transcript/context tree |
| `turnId`          | conversation runtime            | one input-to-terminal turn         |
| `runId`           | runtime owner                   | one foreground/delegated execution |
| `toolCallId`      | Pi Tool execution               | one exact Tool invocation          |
| concrete `JobRef` | owning domain                   | recoverable independent work       |

These identities are never inferred from the active tab or active conversation. Each conversation owns its
queue, abort state, active Pi Agent/session binding, immutable in-flight model snapshot, event subscription
and projection.

## Storage boundaries

- Pi Session JSONL is the sole transcript/context/compaction authority.
- User-level OpenNeko SQLite owns conversation/branch catalog, writer lease and other product metadata; it
  does not copy transcript messages.
- Workspace logs are diagnostic only and cannot hydrate a conversation.
- Historical LocalMetadata task rows retained for Canvas delivery protect user data but cannot become a
  generic Agent Task runtime.
- VS Code `workspaceState` stores view projection such as tabs and selection, never Agent/session/Job facts.
- A persisted fact must not contain provider secrets, Webview URIs, runtime handles, absolute cache paths or
  process-local Skill locators.
