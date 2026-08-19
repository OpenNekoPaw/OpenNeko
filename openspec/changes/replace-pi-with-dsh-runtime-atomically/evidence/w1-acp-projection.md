# W1 Package-Owned ACP Projection

## Implemented Scope

`packages/agent/runtime/src/acp/dsh-acp-projection.ts` provides a host-neutral, per-session ACP projection owner for the DSH bridge boundary. It is a rebuildable read model only and does not become a second transcript or queue authority.

The projection:

- correlates standard `tool_call` / `tool_call_update` notifications by exact `sessionId` + `turn` + `toolCallId`, so the same `toolCallId` in different turns never shares state;
- strictly validates `opennekoSequence`, `opennekoTurn`, permission turn, and turn event data as non-negative safe integers; `NaN`, `Infinity`, negative values, and fractions return a per-session diagnostic and are never treated as missing for inference;
- requires `tool_call_update` to carry an exact `opennekoTurn`; missing or invalid turns fail visibly and are never inferred from a unique `toolCallId`;
- correlates permission requests to the same exact tool/turn identity; if the request does not carry a turn and the known tool is missing or ambiguous, the projection fails visibly instead of defaulting to turn 0 or current/active turn;
- tracks turn start/end and explicit cancel state per session with turn-scoped cancellation keys; after a matching `turn/end` is committed, `currentTurn` is cleared instead of continuing to point at the ended turn;
- allows a final same-turn tool update after cancellation, but rejects non-final updates, terminal-tool updates, and unknown/other-turn frames;
- rejects duplicate tool calls, stale sequences, and terminal-turn late frames as per-session diagnostics;
- commits event-buffer and projection-state changes atomically; overflow returns a local diagnostic without mutating invisible Tool state and does not affect sibling sessions;
- exposes `drain(sessionId)` as the canonical consumable read-model boundary so a short-lived consumer can clear the bounded buffer and continue receiving later events; the projection does not permanently poison a session after overflow;
- exposes `snapshot(sessionId)` with both projected events and current tool snapshots for observable, non-test-only inspection.

The bridge now adds reserved `_meta.opennekoSequence` / `_meta.opennekoTurn` to standard ACP session notifications so the host-neutral projection can apply exact sequence and turn ordering without inventing identities.

`DshAcpApplicationClient` now feeds the same package-owned `DshAcpProjection` from standard `sessionUpdate`, `sessionEvent`, and `requestPermission` paths; the projection remains the single read-model owner and is exposed as `client.projection` for minimal testable inspection. If any of these projection calls returns a diagnostic, the client fails locally before invoking the corresponding raw handler, so invalid session updates, events, and uncorrelated permissions cannot become hidden success paths.

## Focused Verification

Commands run in the integration worktree:

```bash
pnpm --dir packages/agent/runtime run typecheck
pnpm --dir packages/dsh-bridge run typecheck
pnpm --dir packages/agent/runtime exec vitest run src/acp
pnpm --dir packages/dsh-bridge run test
```

All passed.

This evidence supports OpenSpec task 4.4 and the ACP projection portions of task 4.13. It does not claim completion of the full W1 migration.
