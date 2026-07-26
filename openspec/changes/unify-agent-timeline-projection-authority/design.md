## Context

OpenNeko 已完成 Pi canonical runtime 迁移，并已有以下正确基础：

- `PiEventProjector` 将 Pi SDK event 转换为带 conversation/turn/run identity 的 `PiProductAgentEvent`。
- `ConversationProjectionStore` 校验 owner、item revision、sequence、terminal mutation，并发布 versioned patch。
- Extension/Webview 已有 snapshot -> ACK -> patch 的 projection attachment protocol。
- Webview 每个 Tab 已独立拥有 projection replica、Markdown session registry 和 render runtime。
- TUI 已有 instance-scoped stores 和 Terminal Timeline UI。

当前问题不是缺少 projection，而是 projection 旁边仍保留多套成功路径：

```text
PiProductAgentEvent
  -> Extension Pi stream processor
       -> ConversationProjectionStore
       -> mutable Message / ContentBlock
       -> legacy Webview stream messages

PiProductAgentEvent
  -> TUI Pi adapter
       -> mutable conversation store
       -> terminal Tool result accumulator

legacy AgentEvent / runtime message
  -> separate Agent/TUI Timeline projectors
```

因此现有 interface 很宽，却没有隐藏状态复杂度。该变更必须删除平行 authority，而不是再增加一个 facade。

### Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Pi runtime emits product events; one host-neutral projector owns event-to-Timeline semantics; conversation-scoped store owns live projection; Host attachment/presenter owns resource/display adaptation; Webview/TUI renderer owns pure display. |
| Dependency | `agent-types` defines projection contracts; `agent` implements projector/store; Extension and TUI depend on the public projection entry; Webview depends only on `agent-types` and its replica/renderer. Runtime does not import VS Code, React, Ink, Webview URI or terminal row types. |
| Interface | The live boundary is `PiProductAgentEvent -> ConversationProjectionUpdate -> ConversationProjectionSnapshot/Patch`. Transcript commit, usage, persistence state, queue and Host commands remain separate typed contracts. |
| Extension | New Timeline item kinds or Tool progress fields extend one discriminated contract and all Host renderers. New clients consume the same snapshot/patch semantics instead of inventing stream messages. |
| Testing | Contract tests assert identity/revision/order/terminal behavior; poison tests reject legacy routes; TUI Evaluation proves the real Pi path; Extension Development Host proves attachment and Webview rendering. |

## Goals / Non-Goals

### Goals

- Make `ConversationProjectionStore` the only mutable display authority for every active Pi Turn.
- Reuse one Pi event-to-Timeline projector in VS Code and TUI.
- Preserve strict conversation/turn/run/message/tool identities across projection, attachment and user confirmation.
- Keep Pi transcript authority and terminal history projection separate from live display state.
- Preserve stable resource identity while keeping Webview URI and terminal presentation Host-private.
- Remove dual-write, dual-render and legacy fallback paths in the same replacement boundary.
- Prove result and canonical path through deterministic tests, real TUI Evaluation and Extension Development Host evidence.

### Non-Goals

- Redesign the full Markdown/composite/resource renderer registry. That follows after the Timeline contract is stable.
- Implement the `replace-agent-task-with-tool-call-lifecycle` runtime migration. Existing work-item semantics may be represented as Timeline items during this change, but generic Task ownership is removed only by its owning OpenSpec.
- Change Pi provider/model selection, Prompt/Skill composition, permission policy or Tool schemas.
- Make Timeline a durable transcript, project fact, task database or cross-process event log.
- Introduce a JSON-RPC Agent server, global event bus, global active conversation or compatibility stream adapter.
- Use browser/Vite acceptance as a substitute for VS Code Extension Development Host.

## Decisions

### 1. One conversation-scoped projection owner

Each hosted conversation owns exactly one `ConversationProjectionStore`. Each active turn owns exactly one projector state bound to:

- `conversationId`;
- `turnId`;
- `runId`;
- `messageId`;
- one monotonically increasing item sequence/revision domain.

The store is owned by the conversation runtime/composition object, not by the active Tab, Webview, TUI component or module singleton. Tab selection only selects a projection replica for display.

Concurrent conversations use independent stores and projectors. A missing, stale or mismatched identity fails visibly and never falls back to the active conversation or latest message.

The target contract adds `runId` to `AgentTurnTimelineItemCore`, `ConversationTurnProjection`, `ConversationProjectionUpdate` and `ConversationProjectionPatch`. Snapshot and patch validation require the same conversation/turn/run/message ownership tuple. A wrapper-local run identity is insufficient because Timeline items and completed turn projections are also consumed independently by TUI, Webview renderers, confirmation actions and terminal-history projection.

### 2. One host-neutral Pi Timeline projector

`@neko/agent` provides one projector that consumes `PiProductAgentEvent` and produces `ConversationProjectionUpdate`. It owns:

- text/thinking delta accumulation semantics;
- final assistant-message reconciliation;
- Tool Call identity, arguments, progress, confirmation and result normalization;
- ordered error/diagnostic items;
- terminal completion and cancellation;
- rejection of events after terminal state.

The projector does not send Host messages, mutate conversation history, materialize resources, render Markdown, update React/Ink stores or own Pi Session persistence.

Event mapping:

| Pi product event | Timeline behavior |
| --- | --- |
| `turn.started` | Establish exact turn identity; no second phase state is created. |
| `assistant.thinking.delta` | Append to one thinking item; transition to text completes the thinking item. |
| `assistant.text.delta` | Append to one assistant-text item for the current source generation. |
| `assistant.message.completed` | Reconcile provider-final content. A differing complete source uses a typed replace/new-generation operation; it never writes a parallel `ContentBlock`. Unknown content fails visibly. |
| `tool.started` | Upsert one pending Tool item keyed by `toolCallId`. |
| `tool.updated` | Update the same Tool item using a typed progress projection; it cannot create a second message/card authority. |
| `confirmation.required` | Update the same Tool item with pending confirmation and exact confirmation identity. |
| `tool.completed` | Update the same Tool item to succeeded/failed with normalized result, attachments, artifacts and diagnostics. |
| `task.observed` | Project only a validated, explicitly anchored work/domain item. Unknown untyped observations remain outside display or fail visibly; they do not create a generic fallback message. |
| `turn.failed` | Complete open items, append a typed error item and mark the turn failed. |
| `turn.cancelled` | Complete/fail open items as defined by the contract and mark the turn cancelled. |
| `turn.completed` | Freeze the turn and reject all later mutations. |
| `usage` / `turn.persistence` | Update their owning typed runtime facts; they do not mutate conversation content. |

If Tool progress requires a new Timeline payload field, it is added to the existing Tool item contract. A second progress message DTO is forbidden.

### 3. Transcript and terminal history are not live projection owners

Pi Session JSONL remains the transcript authority. `ConversationProjectionStore` is a runtime display projection and is not persisted as another transcript.

During an active Turn:

- no `ConversationBridge.upsertMessageToConversation` or equivalent path incrementally writes assistant text/thinking/Tool blocks;
- no `Message.isStreaming` or mutable `ContentBlock` collection acts as another live source;
- creator-visible artifacts and terminal Tool results are read from the frozen terminal Timeline or the canonical Pi transcript, not a separate accumulator.

At terminal completion, a Host may create one immutable history/display record from:

1. the frozen terminal Timeline;
2. the matching Pi Session checkpoint;
3. the exact conversation/turn/message identity.

That record is a derived projection for completed history. It cannot accept later stream deltas. Reopen uses Pi Session/product conversation metadata and rebuilds projections without importing legacy stream state.

`AgentTurnTimelineCompletion.finalContentBlocks` is removed or made unreachable for new Pi turns. Structured content that must be displayed becomes a typed Timeline item or a terminal transcript projection; completion cannot carry a second representation of the same turn.

### 4. Versioned snapshot/patch is the only active Webview transport

The Extension projection attachment protocol remains:

```text
attach
  -> immutable snapshot
  -> exact ACK
  -> ordered patches
```

The Extension no longer posts active content through legacy Webview messages. The Webview installs snapshot and applies patches atomically to:

- its conversation projection replica;
- its Markdown session registry;
- the derived render representation.

The Markdown registry commit remains ordered before render publication. An active assistant message not present in the installed Timeline is withheld; no shared-message or renderer-local fallback is allowed.

Patch base mismatch, duplicate/stale revision, wrong attachment identity, unknown item anchor or mutation after completion makes the attachment fail visibly. Recovery abandons the old attachment, creates a new identity, installs a fresh snapshot and resumes with patches from that version. The old attachment cannot continue.

### 5. Resource display projection stays Host-specific

Canonical Timeline items contain stable `ResourceRef`, artifact identity and provider/domain diagnostics. They never contain:

- `asWebviewUri()` output;
- blob/object URL;
- cache absolute path;
- terminal ANSI/presentation text;
- Host-private live handles.

The Extension projects resource display values per attachment while serializing a snapshot/patch. The projection preserves conversation/turn/item identity and projection version and does not mutate the canonical store.

A Host display-materialization failure produces an attachment/resource diagnostic and cannot rewrite the Tool result as success. Stable resource identity remains available for retry or another Host.

TUI converts the same stable projection into terminal rows through a pure presenter. It does not add terminal-specific fields to the shared Timeline contract.

### 6. TUI consumes the same canonical projector

The TUI conversation runtime composes the same Pi Timeline projector and conversation-scoped store used by Extension. TUI stores and terminal rows are derived from projection updates/snapshots.

The following TUI parallel state is removed:

- direct Pi delta mutation of assistant conversation messages;
- independent Tool Call/result mutation for the same turn;
- a separate terminal Tool-result accumulator used for artifact delivery;
- legacy `AgentEvent` projection for production Pi turns.

Usage, turn durability, queue state and non-conversation application status remain in their owning TUI stores. They may observe Pi product events but cannot mutate active conversation content.

Evaluation-neutral debug facts expose bounded projection identity/version, Timeline item/terminal state, dropped/gap counts and effective runtime identity when required. They do not expose suite/case/pass concepts.

### 7. Legacy paths are deleted, not adapted

The replacement boundary includes:

- Extension Pi stream `ContentBlock`/message accumulation;
- active `ConversationBridge` assistant-message upserts;
- `activeStreams` / `activePiStreams` dual success paths;
- legacy active-content Webview protocol messages;
- Webview streaming/tool handlers and message presenters that mutate conversation content;
- TUI direct Pi stream mutation and duplicate production Timeline projector path;
- `finalContentBlocks` as an active/terminal fallback;
- debug acceptance that bypasses the canonical Pi projection path.

Outgoing user operations such as confirmation response, cancel, queue edit and attachment lifecycle remain explicit commands with exact identities.

Queue/config/auth/resource navigation/Host command messages are outside active turn content and remain under their current owners.

### 8. Migration is vertical and fail-closed

The implementation order is:

1. Freeze the target Timeline and terminal handoff contracts.
2. Implement and characterize the shared Pi Timeline projector/store path.
3. Migrate TUI to prove the host-neutral path through existing real Evaluation.
4. Migrate Extension attachment/resource projection.
5. Migrate Webview active rendering.
6. Poison and delete legacy protocol, handlers, accumulators and duplicate projectors.
7. Run path-level, real TUI and Extension Development Host acceptance.

New code does not dual-write behind a feature flag. During development, tests may poison the legacy path. A request reaching a removed message or stale attachment fails visibly.

### 9. Evaluation disposition

Real Agent Evaluation is required because the change affects streaming, Tool result projection, cancellation, terminal state and TUI event projection.

- disposition: `update`;
- owning suite: `agent-runtime.stream-delivery`;
- existing cases:
  - `tool-text-order-final-answer`;
  - `active-stream-cancellation`;
  - `read-document-tool-result`;
- coverage delta:
  - require host-neutral Timeline projector/store facts;
  - require exact conversation/turn/message/tool identities and monotonic projection version;
  - require terminal idle/completion and no late mutation;
  - require no legacy stream/message fallback;
  - retain Tool result and Markdown path assertions;
  - add a projection gap/reattach boundary case if existing cases cannot express it.

TUI Evaluation proves the real Pi -> Timeline path and ordering. It cannot alone prove VS Code attachment/Webview behavior, so the owning Extension package must add a synthetic-fixture Extension Development Host scenario covering:

- attach while streaming;
- snapshot ACK and live patch;
- Tool confirmation/result rendering;
- cancellation;
- forced attachment replacement and fresh snapshot;
- absence of legacy active-content messages and console/runtime errors.

No Judge is required because this is a correctness/path change, not an output-content quality change.

## Risks / Trade-offs

- **Terminal history loses rich content**: reconcile every supported Pi assistant content kind into typed Timeline items before removing `finalContentBlocks`; unknown content fails visibly.
- **Resource URIs differ per Webview**: project only at attachment serialization and preserve canonical stable refs/version.
- **TUI behavior drifts during migration**: migrate TUI first against the existing stream-delivery suite and retain exact terminal row assertions.
- **Task work items expand scope**: preserve current typed item projection temporarily; leave semantic Task/Job replacement to its existing OpenSpec and forbid Task fallback for Tool content.
- **Snapshot retention grows memory**: define conversation-runtime retention separately from transcript persistence; completed projections may be evicted only after their terminal history/checkpoint is available and no attachment needs them.
- **Development Host requires provider access**: record the exact credential/model/CDP blocker and do not substitute browser/Vite or direct runtime injection.

## Migration Plan

1. Inventory every producer/consumer of active stream messages, mutable assistant messages, Timeline operations, terminal Tool results and attachment frames.
2. Finalize the Timeline Tool progress, terminal reconciliation and history handoff contracts.
3. Implement the shared Pi Timeline projector and focused contract/store tests.
4. Route TUI production Pi events and creator-visible artifact collection through the shared projection.
5. Route Extension Pi events and resource display projection through the shared projection/attachment server.
6. Make Webview active content projection-only and delete legacy incoming handlers/presenters/types.
7. Delete duplicate stream/projector state and add absence/poison architecture tests.
8. Update `agent-runtime.stream-delivery`, run key-free and real focused cases, then run the owning Extension Development Host scenario.
9. Run affected typechecks/tests/builds plus Agent/Webview boundaries, legacy-debt, unused, strict OpenSpec and diff checks.
