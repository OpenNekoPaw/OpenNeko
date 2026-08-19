# W1 Reverse Host Tool Cancellation And Payload Freeze

## Qualified SDK Constraint

`@agentclientprotocol/sdk@0.25.1` exposes only a connection-level `AbortSignal`. Its public `extMethod` API does not accept an `AbortSignal` and does not expose cancellation for one reverse request. DSH `@deepseek-ai/dsh-tools@0.1.0-rc.7` does expose the exact Tool call `ToolRunContext.signal` and requires Tool implementations to forward it and reach quiescence.

The canonical bridge therefore uses two exact extension methods rather than pretending that an SDK-private request can be cancelled:

- `openneko/domain-tool/execute` carries one reverse Host Tool request and response.
- `openneko/domain-tool/cancel` carries the same `sessionId`, `turn` and `toolCallId` and aborts only the matching Host execution.

There is no generic request registry, retry, provider fallback, alternate runtime, private ACP SDK access or parallel transport.

## Exact Cancellation Semantics

The Host application client owns an in-flight map keyed by the complete `sessionId` + `turn` + `toolCallId` identity. Duplicate execution identity is rejected. A cancel request must match that complete identity; an unknown or stale identity is rejected locally and cannot target another call.

When `ToolRunContext.signal` aborts, the bridge sends the exact cancel method and stops accepting a successful Tool result for that call. The Host abort signal is passed to the explicit owning-domain adapter. Connection close aborts every request owned by that one connection; session close/cancel reaches the Tool signal through the DSH Agent/Tool runtime. A response that arrives after local cancellation is consumed only by the ACP SDK request that created it and cannot reopen the call, invoke another handler or settle a sibling request.

Cancellation targets the DSH Tool/Host request, not an owning-domain durable Job. If Generation `submit` has already durably published a Job, that Job remains owned and recoverable by Generation and can only be cancelled through Generation's explicit Job operation. Canvas forwards the signal into authorized read/write operations so cancellable IO can quiesce without changing sibling documents or calls.

## Bounded Payload Contract

The complete extension params and result each have one canonical maximum of `262144` UTF-8 bytes (256 KiB), measured as their lossless JSON encoding. JSON nesting is limited to 32 containers. The same exported contract helper and constants are used at four boundaries:

1. DSH bridge validates the complete request before `execute` is sent.
2. Host validates before dispatching an owning-domain adapter.
3. Host validates the complete response before returning it to ACP.
4. DSH bridge validates the response before returning a DSH Tool result.

Oversize, over-depth, circular, sparse, non-plain or otherwise non-lossless JSON fails visibly for the exact call. The owning handler is not entered for an invalid request, and an invalid response is not returned as Tool success. The limit is not configurable and has no compatibility alias, truncation, compression fallback or alternate large-payload path; large content must use an authorized domain resource identity rather than ACP inline bytes.

## Deterministic Evidence Scope

Package tests and `scripts/dsh-q0` must prove:

- exact cancellation reaches only the matching Host handler signal;
- a stale cancel identity cannot abort a sibling call;
- a late response after cancellation cannot become Tool success or affect a later success;
- oversize request rejection occurs before Host handler invocation;
- oversize response rejection occurs before DSH Tool success;
- JSON depth and lossless JSON constraints fail locally;
- a valid request succeeds after cancellation and both oversize failures.

This deterministic evidence advances W1 tasks 4.8 and the cancellation/payload/late-frame portions of Q0 task 1.8. It does not prove fair cross-Session backpressure, real provider behavior, Desktop cancellation UI, authorization or durable Generation Job cancellation/recovery. Those tasks remain open and continue to block release.

## Implemented Deterministic Evidence

The W1 implementation now includes:

- `packages/agent/contracts/src/dsh-acp.ts`: `openneko/domain-tool/cancel`, `DshAcpDomainToolCancelRequest`, `decodeDshAcpDomainToolCancelRequest`, `decodeDshAcpJsonPayload`, `DSH_ACP_MAX_PAYLOAD_BYTES`, `DSH_ACP_MAX_JSON_DEPTH`, and strict lossless JSON byte+depth checks on full execute/cancel request and response payloads.
- `packages/agent/runtime/src/acp/dsh-acp-application-client.ts`: exact inflight identity map, per-call `AbortSignal`, explicit cancel handler, duplicate/stale identity rejection, connection-close abort, late-success rejection, and exact Generation/Canvas routing.
- `packages/agent/runtime/src/acp/generation-host-adapter.ts` and `canvas-host-adapter.ts`: explicit Host adapters accept `AbortSignal`; Canvas forwards it into owning-service read/write operations.
- `packages/dsh-bridge/src/index.ts`: forwards `ToolRunContext.signal` through `openneko/domain-tool/cancel`, rejects success after cancellation, and uses the same bounded decoders before sending/receiving.
- `scripts/dsh-q0`: deterministic Q0 now exercises cancellation with late success, oversize input/output rejection, and valid success afterward.

Focused verification run:

```bash
pnpm --dir packages/agent/contracts run typecheck
pnpm --dir packages/agent/contracts run test -- --run src/dsh-acp.test.ts
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir packages/agent/runtime run test -- --run src/acp/dsh-acp-application-client.test.ts
pnpm --dir packages/agent/runtime run test -- --run src/acp/domain-tool-host-adapters.test.ts
pnpm --dir packages/dsh-bridge run typecheck
pnpm --dir packages/dsh-bridge run test
pnpm --dir scripts/dsh-q0 test
pnpm --dir scripts/dsh-q0 qualify
```

All listed commands passed in the integration worktree. The remaining open items are unchanged from the scope note above.
