# W7 DSH Native Streaming Evidence

Date: 2026-08-19

## Scope And Canonical Path

- User-visible behavior: while a real DSH turn is still running, partial assistant text is rendered in the retained Agent transcript beside the active elapsed-time row; the final DSH message replaces the transient text exactly once.
- Canonical path: DSH `assistant/chunk` -> `@neko/dsh-bridge` standard ACP `agent_message_chunk` / `agent_thought_chunk` -> `@neko/agent-runtime` exact Session/turn/step/block transient assembly -> Desktop sender-bound snapshot -> retained `@neko/agent-webview` transcript components -> DSH `assistant/message` stable message identity and final blocks.
- Ownership: DSH owns Session events and final message facts. `@neko/dsh-bridge` only adapts public DSH events to ACP. `@neko/agent-runtime` owns the single bounded transient projection. Desktop Main delegates the package projection, Renderer only coalesces snapshot refreshes, and Webview only renders the existing message/activity presentation.
- Forbidden alternatives: no Pi runtime, provider token reader, Renderer direct DSH stream, browser transcript store, second transcript projector, compatibility fallback, or Tool fact synthesized from `tool-call-delta` can produce success.

## Deterministic Evidence

- Text and reasoning deltas use independent assemblies keyed by exact Session/turn/step/channel and order content by DSH block index.
- Every projected notification carries a non-negative DSH sequence. Multi-frame final messages carry ordered frame index/count metadata under one DSH event sequence.
- DSH `assistant/message` uses its stable message identity to replace the matching transient event. An empty final reasoning channel removes a prior transient reasoning event instead of retaining stale text.
- Replay skips historical `assistant/chunk` events and rebuilds only the final DSH message; it does not replay token animation.
- The transient assembly has a fixed byte limit. Invalid identity, sequence/frame order, missing active step, or overflow produces a diagnostic local to the affected Session; a sibling Session remains usable.
- If a turn ends without the corresponding final message, its transient rows are removed, the turn still reaches its canonical terminal state, and `ACP_PROJECTION_UNSETTLED_ASSISTANT_STREAM` remains visible for that Session instead of leaving permanently streaming text.
- DSH Tool lifecycle continues to come only from `tool/call` and `tool/result`; assistant Tool deltas do not create Tool facts.
- `DesktopAgentSurface` permits at most one snapshot request in flight and coalesces notifications into one subsequent refresh. A newer notification invalidates the current response, preventing stale snapshots from suppressing intermediate text.
- The Webview reuses `agent-transcript-rail`, the existing assistant message row, `MarkdownDocumentView`, and `agent-turn-activity`; no parallel message component or transcript state was added.

## Real Visible Desktop Evidence

The visible Electron product runtime was exercised through the normal Agent composer with a real provider:

- Provider: `nekoapi-chat`
- Model: `gpt-5.6-luna`
- Session: the same exact DSH Session recorded in `w7-turn-timing.md`
- User input: `请写一份约三千字的长篇小说多角色一致性审查指南，分为十二个小节，每节至少三段，并直接输出正文。`

At turn 5 elapsed time 10 seconds, the UI simultaneously showed:

- `回合 5 处理中 · 已用时 10秒`;
- partial answer text from sections one through four;
- disabled composer input and the active stop control.

At elapsed time 23 seconds, the same running turn had incrementally reached section eleven while the processing row remained present. This proves the product was rendering DSH deltas before terminal completion rather than waiting for the final message.

At 28 seconds, the same turn completed with:

- one final answer containing all twelve sections;
- one status row: `回合 5 已结束 · 用时 28秒 · completed`;
- no remaining transient duplicate, processing row, or `ACP_PROJECTION_INVALID_ASSISTANT_CHUNK` diagnostic;
- the composer restored to an enabled input state.

The final pixels were inspected directly. The answer rail and composer shared the same 820 px maximum width and aligned horizontal bounds; the surface used the intended white background, with no content/composer overlap, clipping, or visible layout jump. The provider did not expose a visible reasoning stream in this run, so reasoning presentation is covered deterministically but not claimed as real-provider pixel evidence.

## Evaluation Disposition

- Decision: `reuse` the existing `agent-runtime.stream-delivery` suite owner. The changed behavior is Desktop stream delivery and does not justify a new suite.
- Coverage delta: deterministic producer/projection/Desktop/Webview cases now prove exact DSH chunk/final identities, final reconciliation, no duplicate, bounded failure, sibling isolation, coalesced refresh, and retained presentation reuse.
- Visible lane: the real Electron/provider run above proves partial text, active state, terminal replacement, model identity, and final UI behavior through normal user controls.
- Hidden batch lane: no new direct ACP or runtime runner was added. The indexed Evaluation suite does not yet contain a DSH-native declarative case/assertion set for this exact delta/final path, so no provider-backed batch report is claimed. That platform update remains within task 10.1; current key-free harness results prove infrastructure consistency only.
- Foundational matrix disposition: basic multi-turn conversation and transcript replay were exercised in the same visible Session; context compaction, full application reopen, generation record recovery, multi-Conversation switching, and interleaved isolation were not changed by this focused projection task and were not rerun as part of this evidence.

## Verification

- `@neko/agent-contracts`: 41 files / 218 tests passed; typecheck passed.
- `@neko/agent-runtime`: 47 files / 366 tests passed; typecheck passed.
- `@neko/dsh-bridge`: 2 files / 20 tests passed; typecheck passed.
- `@neko/agent-webview`: 4 files / 29 tests passed; typecheck passed.
- Focused Desktop: 3 files / 55 tests passed; Desktop typecheck passed.
- Agent Evaluation key-free harness: 45 files / 314 tests passed; all-suite dry-run passed for 27 suites / 80 cases, including the existing six-case `agent-runtime.stream-delivery` owner. This is infrastructure evidence, not a provider-backed hidden behavior claim.
- Strict OpenSpec validation passed for all 106 items. Agent, Application and Package boundary gates, focused TS/TSX ESLint, `git diff --check`, and the classified legacy-debt gate passed.
- The internal-versioning audit's focused Node test passed 12/12 and now excludes the ignored generated DSH development closure from source-contract scanning.
- Real visible Electron turn: partial output observed at 10 and 23 seconds; canonical completion observed at 28 seconds.

## UI Validation

- Scope: active partial answer, processing state, final replacement, transcript/composer alignment, and white surface background.
- Runtime: visible Electron Desktop with the bundled development DSH runtime and a real provider, because the behavior crosses subprocess, ACP, Main, preload/Renderer snapshot, and Webview boundaries.
- Functional result: passed for intermediate text, live timing, final single-message settlement, composer recovery, and absence of the prior invalid-chunk diagnostic.
- Visual result: passed for the inspected active and final states. Content remained readable, aligned, unclipped, and non-overlapping.
- Adjacent result: replay restored final messages without historical token animation; previous completed turns remained unchanged.
- Overall advisory result: passed for the focused inventory.

## Residual Risk

- Real-provider reasoning pixels remain unobserved because the selected model/run emitted no visible reasoning channel. Deterministic Webview and projection tests cover streaming/final reasoning and stale-reasoning removal.
- Cancellation during an actively streaming answer was not exercised in this focused run; existing cancellation behavior remains owned by the adjacent `active-stream-cancellation` case and broader W7 validation.
- The Evaluation platform still requires task 10.1 to replace remaining unreachable Pi-era driver/fact sources before a provider-backed hidden DSH stream-delivery report can be produced.
- Repository-wide `check:quality` remains blocked by the current branch's internal-versioning allowance drift outside this focused stream path: after excluding the ignored generated DSH development closure, the audit reports 67 existing third-party/domain/legacy-fixture occurrences and four stale allowances. `check:unused` separately reports six existing files and 183 existing exports. Focused package, OpenSpec, Agent/Application/Package boundary, legacy-debt, TypeScript and UI checks remain passing; this evidence does not rewrite unrelated user work or quality ledgers to conceal those failures.
