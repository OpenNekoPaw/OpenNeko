# ACP Wire Contract Freeze

## Runtime Boundary

The only production channel is newline-delimited ACP JSON-RPC 2.0 over one Desktop-owned DSH subprocess stdio pair. Standard ACP methods and notifications remain authoritative whenever the protocol can express the behavior. OpenNeko extensions exist only for product requirements absent from ACP 0.25.1 and the public DSH runtime APIs.

The wire carries the third-party ACP protocol number negotiated by `initialize`; OpenNeko does not add an internal contract, schema, generation or format version.

## Identity

| Identity | Owner | Wire rule |
| --- | --- | --- |
| `conversationId` | OpenNeko catalog | Stable product identity; never inferred from active/current UI state |
| ACP `sessionId` | DSH | Opaque exact reference stored against one executable Conversation |
| DSH `turn` and `step` | DSH Session | Non-negative integers replayed from DSH events; never renamed to a generic run identity |
| DSH/ACP `toolCallId` | DSH Tool lifecycle | Exact call correlation; nested calls retain their DSH identities |
| JSON-RPC request id | Connection transport | Correlates only one request/response and is not durable product identity |
| Domain `jobId` | Owning domain | Returned by long-running domain Tools; DSH call identity references but does not replace it |
| Inbox message identity | DSH Agent inbox | Exact opaque message identity; no array index or locally generated replacement identity |

There is no product `branchId`, generic `runId`, active-Session fallback, internal revision, writer epoch, or compatibility identity.

## Standard ACP Surface

The bridge uses standard ACP for `initialize`, `authenticate`, `session/new`, `session/load`, `session/list`, `session/prompt`, `session/cancel`, `session/update`, permission requests and supported session methods. The official OpenNeko bridge extends the upstream implementation to advertise only methods that are fully backed by the exact DSH Session.

`session/load` replays canonical transcript/progress events from DSH. OpenNeko never reads DSH Session files or reconstructs history from a cached product projection.

## OpenNeko Extension Surface

Method names are exact and have one handler each:

| Direction | Method | Canonical request/result |
| --- | --- | --- |
| Host → DSH | `openneko/session/inbox/read` | `{ sessionId }` → `{ nextTurn, nextStep }` using exact DSH message identities and content |
| Host → DSH | `openneko/session/inbox/replace` | `{ sessionId, messageId, content }` → fresh inbox snapshot; missing identity is rejected |
| Host → DSH | `openneko/session/inbox/remove` | `{ sessionId, messageId }` → fresh inbox snapshot; missing identity is rejected |
| Host → DSH | `openneko/extensions/read` | `{}` → official packaged contribution inventory/readiness/configuration/diagnostics |
| Host → DSH | `openneko/extensions/execute` | exact advertised contribution/capability plus validated command → fresh affected projection |
| DSH → Host | `openneko/domain-tool/execute` | exact Tool/call/session/turn identity, domain operation and JSON input → typed success or typed failure |

Extension notifications use `openneko/session/event` only for DSH Session events that standard ACP cannot project. Its payload carries the exact `sessionId`, event sequence, event type and event data. It never carries a complete secondary transcript or locally invented lifecycle state.

## Domain Tool Result

The Host reverse request is admitted only after bridge schema validation and is validated again by the owning domain semantic validator before mutation. Success returns the owning domain result and optional `jobId`. Failure returns a typed diagnostic and never switches to MCP, another provider, direct Desktop logic or another Tool handler.

## Transport Limits And Failure

- Stdout accepts exactly one JSON-RPC object per line; all diagnostics use stderr or protocol diagnostics.
- The package-owned client owns request correlation, bounded frame and pending-request limits, cancellation and late-frame rejection.
- Desktop owns process start, stdin/stdout pipes, termination and crash observation; it does not interpret Agent events.
- Disconnect rejects new work, fails affected requests and releases connection-owned runtime handles. Sibling durable Conversation records remain visible.
- Unknown method, unknown identity, malformed payload, duplicate handler and payload overflow fail visibly at the smallest owning request/session/contribution boundary.
- No failure may invoke Pi, embedded Cordis, DSH Web/Client Runtime, TypeScript SDK runtime, Remote API, raw Session files or a cached projection as an alternate success path.

## Credential And Path Boundary

Secrets never enter ACP messages, DSH Session events, stdout, Renderer or Evaluation facts. DSH requests credential use through a Host-owned typed adapter. Workspace binding uses an authorized virtual working-directory contract; raw user paths do not become product wire identities or Renderer payloads.

## Qualification Status

The method names and ownership are frozen for W1 implementation. Tasks 1.4–1.5 now prove deterministic list/load/resume/history/close, clean-restart recovery and standard ACP Tool call/result live/replay projection. Tasks 1.6–1.10 remain open for permission, cancel, inbox preservation, reverse Tool, extension, backpressure and injected-crash qualification; the freeze is not evidence that those paths already work.
