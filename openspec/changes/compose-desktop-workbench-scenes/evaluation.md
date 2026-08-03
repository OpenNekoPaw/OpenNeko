# Agent Evaluation

Date: 2026-08-03

## Evaluation Scope

- Change/feature: unified Desktop Workbench Agent entry, Assistant and explicit Workspace scopes,
  sender-bound directory grants, first-submit lifecycle and forbidden Project fallback.
- Decision and owning suite: `update` the indexed `agent-runtime.workflow-controller` suite owned by
  `agent-runtime.workflow-controller`. The behavior remains one Desktop Agent session workflow; a
  second suite or Agent controller would split the canonical owner.
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

| Case | Group | Required hard evidence | Fail-visible / forbidden evidence |
| --- | --- | --- | --- |
| `assistant-first-submit-exactly-once` | canonical | Assistant scope identity; requested/effective provider and model; committed conversation/message/request/turn identities; one provider-start claim; terminal idle | no Home handoff, Workspace/Project identity or duplicate initial turn |
| `workspace-directory-grant-first-submit` | canonical | native directory choice; sender/Window-bound opaque grant; exact Workspace identity; draft scope switch; frozen conversation context; terminal provider turn | no raw path in renderer/facts and no active/first/recent Project lookup |
| `assistant-workspace-scope-required` | failure | Assistant scope plus typed `workspace-scope-required` diagnostic for a Workspace-only route | no Workspace Tool execution, mutation or default Project resolution |
| `workspace-directory-cancel-preserves-draft` | boundary | cancelled picker; unchanged scene/scope revisions; no Workspace or conversation creation | cancellation cannot report a successful grant or transition |
| `workspace-conversation-exact-restore` | regression | persisted conversation context; exact grant restore; exact Workspace and session attachment after restart | unresolved/revoked/mismatched context fails closed; no current Project lookup |

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
