# W7 DSH Turn Timing Evidence

Date: 2026-08-19

## Scope And Decision

- User-visible behavior: an active DSH Agent turn displays processing state with live elapsed time, then a completed turn displays its canonical duration in the existing Agent turn status row.
- Authoring decision: reuse the existing DSH conversation path and W7 Agent UI coverage; no new Evaluation suite or product component is needed.
- Canonical path: DSH `SessionEvent.time` -> OpenNeko DSH bridge extension notification -> `@neko/agent-contracts` strict decode -> `@neko/agent-runtime` exact Session/turn correlation -> Desktop Host projection -> existing `agent-turn-activity-meta` presentation.
- Forbidden alternatives: Renderer receipt time, Tool duration, an adjacent turn, a compatibility field, or a second local timing authority cannot supply a completed or replayed duration. `Date.now()` is used only to refresh the active transient presentation relative to DSH `startedAt`; it is not written to contracts, projection or persistence.

## Real Desktop Evidence

The visible Electron product runtime was exercised through the normal Agent composer with a real provider. The inspected DSH Session was:

- Session: `3b6b5a0c-7ec8-4efe-a5d0-d3ea3d9c5767`
- Provider: `nekoapi-chat`
- Model: `gpt-5.6-luna`

The same Session's authoritative DSH start/end event timestamps and replayed UI status rows matched as follows:

| Turn | DSH event difference | Existing status-row presentation        |
| ---- | -------------------: | --------------------------------------- |
| 1    |              3896 ms | `回合 1 已结束 · 用时 3秒 · completed`  |
| 2    |              4617 ms | `回合 2 已结束 · 用时 4秒 · completed`  |
| 3    |             12155 ms | `回合 3 已结束 · 用时 12秒 · completed` |

The durations remained visible after Session replay. The path used the exact returned Session and turn identities; no retired Pi runtime, local turn timer, Tool duration, or Renderer timing path participated.

A new visible Electron turn was then submitted through the same product composer with the same provider/model. Its temporary status row was directly inspected at `0秒`, `11秒`, and `31秒`; the spinner and `处理中` label remained visible at the transcript tail without overlapping the composer. When DSH published `turn/end`, the temporary row disappeared and the completed row displayed `回合 2 已结束 · 用时 34秒 · completed` next to the fully rendered answer.

## Fail-Visible And Adjacent Evidence

- Missing `turn/start` produces `ACP_PROJECTION_MISSING_TURN_START` for the affected event.
- A `turn/end` timestamp earlier than its matching start produces `ACP_PROJECTION_INVALID_TURN_TIME`.
- Exact contract decode rejects a missing, negative, or extra timing field.
- Invalid timing remains local to the affected Session/event; a sibling Session continues to project its canonical timing.
- Desktop Main delegates the package-owned `startedAt`/`completedAt` values and does not recompute them.
- The Webview reuses the existing status row and existing Agent stylesheet; no replacement component or parallel style surface was introduced.

## Verification

- Agent Contracts: 41 files / 218 tests passed.
- Agent Runtime: 47 files / 363 tests passed.
- DSH Bridge: 2 files / 18 tests passed.
- Agent Webview: 4 files / 27 tests passed, including fake-clock active elapsed refresh, exact end transition and replay-only completed presentation.
- Focused Desktop DSH Session Host: 11 tests passed.
- Typecheck passed for `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/dsh-bridge`, `@neko/agent-webview`, and `@neko/app-desktop`.
- Desktop full suite executed 100 files / 575 tests; its only failure was `desktop-resource-browser-runtime.test.ts` exceeding the shared 5-second timeout during the concurrent run. That unrelated file then passed 7/7 in isolation.
- OpenSpec strict validation and Agent/Application/Package boundary checks passed.

## UI Validation

- Scope: active and completed turn timing in the existing Agent transcript status row; applicable because visible copy and feedback state change.
- Runtime: the visible Electron Desktop product runtime, because the behavior crosses the DSH subprocess, ACP extension, Desktop Host projection, and Webview.
- Functional result: passed for the active `0秒 -> 11秒 -> 31秒` updates, the transition to canonical `34秒` completion, three earlier completed turns, and replay.
- Adjacent result: passed for transcript replay and sibling-Session isolation in deterministic coverage.
- Visual result: passed for directly inspected active and completed Electron pixels. The active row remained aligned with the transcript rail, stayed above the composer, and did not overlap surrounding content; the completed row remained readable after the long answer auto-scrolled to its tail.
- Overall advisory UI result: passed for this focused status-cycle inventory.

## Residual Risk

- The active elapsed value is intentionally transient and can reflect wall-clock changes while a turn is active; only DSH start/end timestamps remain replayable facts.
- The observed stop control remained visible while active, but the accessibility tree reported it disabled. Cancellation behavior is outside this timing presentation change and remains a separate existing Agent UI/runtime acceptance item.
- The isolated Desktop timeout pass indicates concurrent-suite scheduling sensitivity outside this change; it is recorded rather than treated as a timing-path failure.
