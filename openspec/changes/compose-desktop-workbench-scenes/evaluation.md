# Agent Evaluation

Date: 2026-08-04

## Evaluation Scope

- Change/feature: unified Desktop Workbench Agent entry, Assistant and explicit Workspace scopes,
  sender-bound directory grants, first-submit lifecycle and forbidden Project fallback.
- Decision and owning suite: `update` the indexed `agent-runtime.workflow-controller` suite owned by
  `agent-runtime.workflow-controller`. The behavior remains one Desktop Agent session workflow; a
  second suite or Agent controller would split the canonical owner. The change-to-suite selector
  maps `desktop-agent-launch-runtime` to this existing `session-workflows` owner so focused runs do
  not fail with `unmapped-coverage` before evaluating the changed path.
- Why real Evaluation is required: scope selection, effective model binding, initial-turn execution,
  resource use and recovery can change real Agent behavior. Scene codecs, grant containment and
  Shell placement also have deterministic producer/consumer and Electron acceptance requirements.
- Canonical path: window-scoped Agent draft -> sender-bound launch connection -> explicit Assistant
  scope or native directory grant -> Agent-owned first-submit lifecycle -> exactly one Pi provider
  turn -> committed session attachment. Workspace restore uses the conversation's exact persisted
  Workspace identity and grant.
- Forbidden fallback: Home composer or `agentInitialInput`, active/first/recent Project lookup,
  raw-path renderer payload, synthetic Project, second Agent controller, direct turn injection,
  mock provider, implicit scope change or renderer-triggered provider restart.

## Cases

The suite update requires the following focused case groups once the Desktop complete-session driver
supports their public operations and facts:

| Case                                         | Group      | Required hard evidence                                                                                                                                            | Fail-visible / forbidden evidence                                             |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `assistant-first-submit-exactly-once`        | canonical  | Assistant scope identity; requested/effective provider and model; committed conversation/message/request/turn identities; one provider-start claim; terminal idle | no Home handoff, Workspace/Project identity or duplicate initial turn         |
| `workspace-directory-grant-first-submit`     | canonical  | native directory choice; sender/Window-bound opaque grant; exact Workspace identity; draft scope switch; frozen conversation context; terminal provider turn      | no raw path in renderer/facts and no active/first/recent Project lookup       |
| `assistant-workspace-scope-required`         | failure    | Assistant scope plus typed `workspace-scope-required` diagnostic for a Workspace-only route                                                                       | no Workspace Tool execution, mutation or default Project resolution           |
| `workspace-directory-cancel-preserves-draft` | boundary   | cancelled picker; unchanged scene/scope revisions; no Workspace or conversation creation                                                                          | cancellation cannot report a successful grant or transition                   |
| `workspace-conversation-exact-restore`       | regression | persisted conversation context; exact grant restore; exact Workspace and session attachment after restart                                                         | unresolved/revoked/mismatched context fails closed; no current Project lookup |

- Evidence and coverage delta: current deterministic contracts expose scene/grant/context/request/turn
  identities and provider claim semantics. The Evaluation driver exposes ordinary Workspace session
  submit/queue/cancel/resume facts, but it does not expose Assistant draft submit, native directory
  authorization, scope transition or Window scene facts. Those operations and neutral bounded facts
  must be added to the existing Desktop complete-session driver before the cases above can be added
  to `suite.json` without metadata-only assertions.
- Missing observability: Assistant/Workspace scope identity, directory-grant outcome, first-submit
  commit/claim count and forbidden Project-resolution participation are not currently available as
  Evaluation facts. Final answer text or a successful ordinary Workspace turn cannot substitute for
  them.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed `45 files / 284 tests`. This validates schemas,
  runner semantics, indexes and the currently executable suite only, not real Agent behavior.
- Focused dry-run: passed selection/validation for `22 suites / 53 cases`. The existing workflow
  cases validate driver readiness but cannot claim Assistant/directory coverage.
- Real cases and reports: not run. A provider-backed run requires native `~/.neko/config.toml`,
  explicit provider/model identity, cost authorization and the missing driver operations/facts below.
- Focused provider preflight: `node scripts/agent-eval/local-run.mjs --mode focused --suite
agent-runtime.workflow-controller --case conversation-persistence-resume` returned
  `infrastructure-blocked` before Desktop/API launch because explicit provider, model and cost
  authorization were absent. The redacted local summary is `reports/agent-eval/local-run-summary.json`.
- Blocked or unexecuted cases: all five proposed cases above remain blocked by unsupported Desktop
  operations and missing path facts. They are intentionally not authored as non-executable or
  final-text-only scenarios.

## Interpretation

- Deterministic and Electron tests remain authoritative for Shell composition, sender binding,
  directory cancellation, grant containment, exact restore and no-fallback path assertions.
- Only a future provider-backed Desktop complete-session run with the hard evidence above can accept
  real Assistant/Workspace Agent behavior.

## Residual Risk

- Until the existing Desktop Evaluation driver supports launch-scope and native directory operations,
  real Assistant first submit, file consumption, exactly-once provider execution and exact Workspace
  restore remain unverified by Evaluation.
- Key-free success, dry-run selection, mock output or an ordinary Workspace final answer must not be
  described as acceptance for this change.

## First-Submit Session Handoff Update

- Disposition remains `update` for
  `session-workflows -> agent-runtime.workflow-controller`; this is the same first-submit session
  workflow, not a second Evaluation owner.
- The canonical path now includes lifecycle commit -> exact Assistant/Workspace runtime conversation
  materialization -> provider claim -> session Scene attach -> old-binding projection detach -> new
  connection attach and second-message delivery.
- Forbidden paths now also include provider-adapter conversation creation, bootstrap fallback to an
  active conversation, global-current-connection send/subscribe and detaching an old attachment
  through the replacement adapter.
- Agent Runtime, Webview, Desktop and visible development/packaged Electron evidence prove the
  identity/order boundary and reject endpoint mismatch. Real provider behavior remains blocked because
  the complete-session driver does not expose Entry Draft submit, materialization/claim ordering or
  endpoint replacement facts; no model-quality or provider-success claim is made.

## Error Diagnostic And Activation Regression Decision

- Workspace conversation activation continues to `reuse`
  `agent-runtime.workflow-controller/conversation-persistence-resume` for real successful
  persistence/resume behavior. New Host/AppHost/renderer deterministic path tests additionally prove
  that Project target, Workbench, Scene session phase and exact adapter identity activate together;
  the prior Assistant launch adapter cannot render or execute under the restored Workspace scope.
- Pi error-only transcript presentation is `excluded` from provider-backed Evaluation. The changed
  function is a pure, strict projection from a persisted Pi assistant entry to one UI Message; it
  does not select a provider/model, start/retry a turn, route a Tool or mutate session authority.
  `pnpm --dir packages/agent/runtime exec vitest run
src/runtime/projection/__tests__/pi-conversation-history-projector.test.ts` is the authoritative
  deterministic validation.
- Canonical path: Pi Session error entry with `stopReason: error` and `errorMessage` ->
  `projectPiConversationEntries` -> conversation-scoped `Message.isError` -> package-owned Agent
  error card. Forbidden fallback: empty content, fixed label-only Error, automatic retry, hidden
  failed turn or Desktop-owned error renderer.
- Assistant/Workspace exact bootstrap and provider-preflight failure checkpointing are `excluded`
  from provider-backed Evaluation as deterministic identity and persistence boundaries. Host/AppHost,
  bridge and controller tests prove Scene conversation -> exact connection -> active conversation/Tab
  state, prove the prior connection cannot participate, and fail visibly for a missing conversation. Agent Runtime tests
  prove that a preflight failure checkpoints the original user message once under the committed
  conversation/turn identity, while a provider-started failure preserves the existing Pi checkpoint.
- The visible development and packaged Electron scenario additionally proves that the locally
  committed Assistant message renders immediately in session phase and restores through the exact
  recent-conversation identity after leaving the Agent scene. This does not replace the still-blocked
  provider-backed `assistant-first-submit-exactly-once` success case or prove model output quality.
- Entry Draft owner-card removal and creative mode selection are `excluded` from provider-backed
  Evaluation as pre-session presentation decisions. Focused Webview and Electron assertions prove
  that a fresh `unbound` draft has zero owner cards, retains launch-safe configuration/resources and
  does not create a conversation before submit.
- Direct Entry Draft submit is not excluded from Agent behavior acceptance: it is the
  `assistant-first-submit-exactly-once` workflow above. Deterministic Host/AppHost/renderer tests and
  visible Electron runs prove exact `unbound -> assistant -> session` binding, one local conversation,
  committed initial message and exact restore. Provider-backed model execution remains blocked by the
  missing driver facts and explicit provider/model/cost authorization, so no model behavior is claimed.
- Future Character/Room selection remains an explicit owner-qualified path. The current Desktop has no
  qualified Character/Room owner/runtime/Surface, so the path must fail visibly and cannot fall back to
  Assistant or Workspace. A real provider turn cannot add evidence until that owner exists.

## Final Real-Provider Update

Date: 2026-08-06

This section supersedes the earlier infrastructure-blocked conclusion for the now-executable Agent
lanes. The disposition remains `update` for
`session-workflows -> agent-runtime.workflow-controller`; no second Agent controller or direct turn
runner was introduced.

- Visible packaged Desktop acceptance passed through the real composer and configured provider/model:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T20-05-59.873Z-desktop-agent-provider-ui-packaged/report.json`.
  It proves unbound Entry Draft submission, exact Assistant conversation materialization, live
  execution activity inside the transcript, terminal provider response, centered bounded message
  rails and absence of legacy run-status or attachment diagnostics.
- Hidden packaged batch acceptance passed as
  `agent-runtime.workflow-controller/conversation-persistence-resume`, sample
  `sample-e4d37cbfc97c15ce1637ed75`. It used the complete Desktop session owner and configured real
  provider/model for two-turn persistence/restart/continuation behavior, with all `7/7` deterministic
  hard gates passing.
- Requested and effective configuration identities matched. The evidence contains Pi Session and
  SQLite catalog authority, exact conversation/turn/run identity, restored message count, continuation
  step, terminal idle and non-empty final answer; forbidden in-memory/new-conversation authority did
  not participate.
- The matrix aggregate is `non-comparable` only because a shard report field contains a local absolute
  result path. The sample itself is `pass`; this is Evaluation report portability debt, not a target
  behavior failure.
- A development-target run that lost its CDP target after restart and second submit is classified
  `infrastructure-fail` and excluded from acceptance. The packaged lane was selected after that
  diagnosis and completed without retrying a behavior failure into success.

The remaining provider-backed gap is not basic conversation or restart persistence. Character/Room
owners remain unavailable by design, and a single combined scenario does not yet run real background
Agent execution while interactively switching two Workspace containers and high-memory Canvas nodes.
Those UI/instance lifecycle cells are covered by deterministic owner-isolation tests plus the separate
packaged Workbench and Canvas scenarios; their combination remains residual evidence scope rather than
an accepted model-quality claim.

## Persisted Agent Surface Reconciliation Decision

Date: 2026-08-06

- Disposition: `excluded`. Task 11.11 changes only deterministic Host qualification of persisted Shell
  Surface bindings against the existing owner-qualified Agent Home catalog. It does not change prompt
  composition, provider/model selection, Tool routing, Pi turn execution, transcript projection or
  Agent output.
- Canonical path: Window claim -> persisted session Agent Surface `conversationId + owner` -> Agent
  Home catalog qualification -> exact invalid Surface removal -> same-owner fresh draft activation ->
  localized Desktop diagnostic. Bootstrap keeps its strict persisted Conversation context assertion.
- Forbidden paths: converting a Workspace context to Assistant, selecting an active/recent
  Conversation, mutating or deleting Conversation authority/Pi transcript, dropping valid sibling
  Workbenches or returning a successful bootstrap for the rejected Surface.
- Deterministic evidence: the focused Host regression proves exact-Surface rejection, same-owner draft
  replacement and sibling retention; Desktop renderer/i18n tests prove localized user presentation
  while preserving the original technical diagnostic as supplemental detail. The four live
  `agent_conversation_authority.context_json` SQLite SHA3-256 values were unchanged before and after
  startup.
- Real provider execution is not required for this disposition because no Agent turn or behavior can
  change. The existing key-free Evaluation harness remains infrastructure evidence only and is not
  described as provider behavior acceptance.

## Entry Target Commit-On-Submit Decision

Date: 2026-08-07

- Disposition remains `update` for
  `session-workflows -> agent-runtime.workflow-controller`. Entry, Assistant-owner and
  Workspace-owner drafts converge on the existing first-submit lifecycle; no second controller,
  direct runtime runner or target-specific success path is introduced.
- User-visible behavior: selecting one catalog Project or native directory in the unbound Entry
  composer changes only the package-owned Draft target. The Agent-only Scene, launch connection and
  Conversation catalog remain unchanged until the user sends the first message. Assistant and
  Workspace owner-local “new conversation” actions create a fresh owner-qualified Draft without an
  empty Conversation. Character/Room remain owner-qualified unavailable until their composition is
  implemented.
- Canonical path: exact Entry `draftId` -> sender-bound target receipt -> package-owned input,
  reference, target and configuration snapshot -> first-submit local transaction -> exact target
  runtime materialization -> owner-qualified session Scene -> provider claim. A target receipt is
  single-select and is frozen into the committed conversation context only at first submit.
- Required evidence: no Scene or Conversation mutation after Project/directory selection; requested
  and effective target/model/configuration identity at submit; one committed Conversation, initial
  message and pending turn; exact session attachment; terminal provider state. A pre-commit target,
  grant, configuration or persistence failure must retain the Entry Draft. A post-commit provider
  failure must remain attached to the committed session with its diagnostic.
- Forbidden paths: pre-submit `open-workspace`/`open-project-workspace`, active/first/recent Project
  inference, a Workspace Draft rendered through a session adapter without submit authority, clearing
  Draft state before local commit, writing Entry model selection into shared settings, Character/Room
  fallback to Assistant and any mock or direct-turn acceptance substitute.
- Focused provider-backed coverage continues to reuse
  `assistant-first-submit-exactly-once` and update
  `workspace-directory-grant-first-submit`. Deterministic contract/Webview/Host tests own target
  single-selection, no-navigation, pre-commit retention and unavailable-owner assertions. Visible
  Desktop validation must additionally exercise the real composer and inspect both the unchanged
  Entry Scene before send and the exact target Scene after send.

Current execution evidence on 2026-08-07 is deterministic only: the key-free harness passed `44 files
/ 285 tests` and the all-suite dry-run passed `22 suites / 52 cases`; visible development Electron
proved the composer-driven Entry-to-Assistant transaction and exact session restore with the isolated
functional provider. The process did not provide explicit provider/model/cost authorization, so the
provider-backed cases were not run. Packaged UI attempts did not reach a complete runner terminal and
remain infrastructure failures. Neither result is promoted to real-provider Agent behavior evidence.
