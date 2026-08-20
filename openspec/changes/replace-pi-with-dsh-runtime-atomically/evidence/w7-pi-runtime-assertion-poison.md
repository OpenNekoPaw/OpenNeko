# W7 Retired Pi Runtime Assertion Poison

## Evaluation Scope

- Change: delete retired Pi runtime, Timeline and Tool assertion success paths while moving their
  executable evidence to the canonical Desktop DSH boundary.
- Decision: `update` the Agent Evaluation platform contract. Real provider behavior is excluded for
  this slice because active indexed scenarios already contain no `pi-runtime` assertion; the change
  only removes an obsolete schema/evaluator success path.
- Canonical path: strict Scenario decode -> supported assertion inventory -> Desktop or neutral
  evidence adapter. A `pi-runtime` assertion now fails strict validation before Desktop launch.
- Forbidden fallback: no Desktop evidence adapter, neutral hard gate, model-profile reference path or
  default execution support may recognize `pi-runtime`.
- Conversation persistence assertions accept only `dsh-session` plus the
  `openneko-conversation-catalog`; Pi Session/SQLite literals are rejected instead of translated.
- Timeline assertions execute only at the Desktop DSH evidence boundary. They bind exact
  `conversationId` / `dshSessionId` / numeric `turn`, require one matching DSH turn-end event and
  optionally require a same-turn Tool event with a non-empty `toolCallId`.
- Timeline terminal semantics use DSH-native end reasons (`completed`, `aborted`, `blocked`,
  `error`, `max-tokens`, `interrupted`). The retired product statuses
  (`completed`/`cancelled`/`failed`) and neutral Pi Timeline projector/store evaluator are rejected.
- Concurrent Desktop matrix isolation now requires a unique `dshSessionId` per sample; the retired
  `piSessionId` field can no longer satisfy isolation evidence.
- `tool-call` and `automation-tool-result` execute only at the Desktop DSH evidence boundary. They
  consume DSH `tool` events keyed by non-empty `toolCallId`, numeric `turn`, exact `title`, terminal
  `completed`/`failed` status, lossless `rawInput` and one canonical JSON text `rawOutput` block.
- The neutral `turns[].toolCalls` evaluators and retired Pi `tool_call.payload.toolCall` Desktop
  projection can no longer return Tool or Automation success. Missing identity, changed turn owner,
  non-terminal status and malformed result JSON fail visibly.
- Process-order assertions execute only at the Desktop boundary. The DSH driver observes each
  Session event once with a per-Conversation projection offset, rejects projection rewind, and
  derives assistant-text/Tool ordering from DSH `message`/`tool` events with exact turn and event
  identity. The neutral process-order evaluator and old `projectionEvents` shape are deleted.
- Desktop canonical facts now accept only the exact DSH controller/runtime/transcript/catalog/
  projection path and `conversationId` / `dshSessionId` / numeric `turn`. The prior executable Pi
  runtime-path branch and `turnId` / Agent `runId` identity comparison are deleted; a poisoned Pi
  facts fixture fails before any assertion-specific evaluator can return success.
- `model-sequence` binds every idle receipt to the same exact Conversation and DSH Session, requires
  distinct numeric DSH turns, and verifies each effective provider/model receipt. It no longer
  returns or compares Pi Turn/run identities.
- Visible approval receipts preserve the pending DSH permission identity directly. They do not
  reconstruct `turnId` / Agent `runId` fields after the UI control is used.
- Report generation treats the absent DSH configuration digest and token/cost usage as explicitly
  unavailable. It does not invent a digest, token count or cost, and it no longer crashes while
  serializing valid DSH facts.
- Retired OpenNeko queue steps (`queue`, `send-queued-now`), `queue-state` assertions, neutral and
  Desktop queue evaluators, `messageQueue` evidence and the two Pi queue scenarios are deleted.
  Active Scenario discovery has a poison scan proving they cannot return. The coverage index records
  DSH active-session inbox as excluded because only the DSH bridge owns read/replace/remove, Desktop
  exposes no public inbox product operation, and rc.7 cannot preserve pending inbox across release.
- Configuration-update steps and assertions accept only the idle state. The DSH Desktop driver
  resolves the exact visible Conversation surface, rejects an active Session, selects exactly one
  advertised provider/model through `dshSessions.selectComposerModel`, verifies the effective
  projection and compares DSH turn-start counts before/after. The Pi-era running-Turn future
  configuration identity and submission-count evidence cannot return success.
- The unreachable OpenNeko `resource-display-projection` schema, Desktop/neutral evaluators,
  synthetic facts and Webview media-card observation probe are deleted. Exact DSH Tool event
  `rawOutput`, content-locator and artifact evidence remain canonical; visual rendering requires the
  separate visible UI acceptance lane and cannot be simulated by a second display fact.
- Pi-era `draft-bind`, pre-Session `draft-submit` and synthetic `draft-rejection` are deleted from
  the schema, workflow, driver and evidence adapter. Four cases whose only executable path depended
  on those retired operations are removed; ordinary first submit continues through the visible
  Composer and no Draft operation can be translated onto a DSH Session call.
- The unconsumed `AgentDraftSubmitInput`/`AgentDraftSubmitProjection` contract and parser are
  deleted. The still-used command/Skill intent and reference receipt contract now lives in
  `agent-input-intent.ts`; the Agent boundary gate prevents the retired submit file from returning.
- Renderer reload/application restart reconnect through the public DSH Desktop bridge and require
  the new visible Surface to own the exact requested Conversation before reading its snapshot. A
  changed Conversation is rejected; active/recent Conversation fallback cannot return success.
- `execution.lifecycleChecks` must have exactly one `desktop-lifecycle` assertion with the same
  unique check set. Desktop facts retain reload/focus/close evidence, and the hard gate requires
  exact Conversation reconnect plus graceful disposal; lifecycle setup without an assertion cannot
  pass strict Scenario validation.

## Verification

- Focused DSH driver/Desktop evidence/workflow/scenario/pipeline tests: 5 files / 36 tests passed
  for the canonical-facts/model-sequence/report slice.
- Focused queue retirement schema/evidence/workflow/hard-gate/coverage/discovery/run-case tests:
  7 files / 95 tests passed.
- Focused DSH idle configuration driver/workflow/schema/evidence tests: 4 files / 49 tests passed.
- Focused resource-display retirement schema/evidence/pipeline/matrix/coverage tests: 7 files / 93
  tests passed.
- `pnpm test:agent:eval`: 45 files / 314 tests passed; all-suite dry-run passed for 26 suites / 65
  cases.
- Production Evaluation source scan finds no `pi-runtime` assertion registration/evaluator and no
  neutral Timeline, Tool or Automation success evaluator.

## Remaining Work

This slice does not complete W7. The real lifecycle and broader provider-backed matrices remain
unexecuted, and repository-wide forbidden-path scans remain open under task 11.6. The remaining
`runId` in Evaluation reports is the external
test-sample identity, not an Agent runtime identity. No Webview or Desktop product UI was changed.

The foundational behavior matrix is unaffected: basic/multi-turn conversation, compaction and
continuation, application reopen, Generation recovery, Conversation switching and scoped-state
isolation execute through the same product driver as before. None of those provider-backed cells was
rerun for this schema-deletion slice, and their existing release blockers remain unchanged.
