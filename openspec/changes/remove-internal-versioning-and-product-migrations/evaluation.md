## Evaluation Scope

- Change: `remove-internal-versioning-and-product-migrations`, Agent tasks 5.1-5.5.
- Decision: update and reuse `agent-runtime.workflow-controller`; retain
  `agent-runtime.stream-delivery` as the projection owner suite.
- Canonical path: visible composer or hidden Desktop public Agent input -> sender-bound Desktop
  controller -> Pi Conversation runtime -> Pi Session and SQLite catalog -> Conversation projection
  store -> terminal Webview projection.
- Forbidden fallback: direct runtime execution, a second session owner, mock provider, retired Host
  session owner, legacy Agent event projector, in-memory-only restore, projection version dispatch,
  and renderer epoch routing.

## Cases And Evidence

- `conversation-persistence-resume` now restarts the complete Desktop application/session owner
  between turns, reconnects by exact Workbench/Agent Surface ownership, restores the same
  Conversation from Pi Session and SQLite, and continues through the public Agent input path.
- `tool-approval-visible` now creates its Conversation through the visible Entry Draft composer,
  approves the exact projected Write Tool through the visible confirmation control, reloads the
  renderer with a replacement `connectionId`, restores the Conversation, verifies composer focus,
  and closes Desktop gracefully.
- Evaluation terminal evidence uses exact `conversationId + turnId + runId + terminalState`.
  Removed projection versions and renderer/view epochs are not accepted as validity or routing
  evidence.
- The hidden and visible cases both pass strict focused dry-run selection. The full key-free gate
  passes 45 test files / 289 tests and validates 22 suites / 53 cases. This is Evaluation platform
  readiness only, not real Agent behavior acceptance.

## Deterministic Recovery Exclusion

- The Agent Home catalog owner-containment fix is `excluded` from provider-backed Evaluation. It
  only validates persisted Conversation owner semantics before Home projection and cannot change
  Prompt composition, provider/model selection, Tool routing, turn execution, or response quality.
- Canonical path evidence covers `agent_conversation_authority` -> Pi catalog reader -> Agent Home
  owner projection -> Host Shell snapshot. A Workspace context whose runtime scope is the known
  Assistant Space is omitted with an identity-bearing `invalid-conversation-record` diagnostic;
  valid Assistant and Workspace siblings remain projected.
- The retired `agent_conversation_context` table is poisoned by deterministic coverage: its row is
  left unchanged and is not read as a fallback or used to repair the canonical authority record.
- Focused Agent Runtime tests passed 2 files / 29 tests, Host producer/consumer tests passed 37
  files / 332 tests, Desktop Main composition passed 1 file / 31 tests, and an isolated SQLite copy
  of the reported local database confirmed the affected Conversation was diagnostic-only. The
  production Desktop package also built and passed package-output validation.

## Real Execution

- Hidden attempt: `agent-runtime.workflow-controller/conversation-persistence-resume`.
  Outcome: `infrastructure-blocked`; report:
  `reports/agent-eval/remove-internal-versioning-hidden/local-run-summary.json`.
- Visible attempt: `agent-runtime.workflow-controller/tool-approval-visible` with
  `visible-desktop` evidence. Outcome: `infrastructure-blocked`; report:
  `reports/agent-eval/remove-internal-versioning-visible/local-run-summary.json`.
- `~/.neko/config.toml` was readable. The process did not have explicit provider identity, model
  identity, and cost authorization, so both attempts stopped before Electron launch and before any
  API request. No configuration contents or credentials were read into this artifact.

## Foundational Matrix

| Behavior                                            | Current evidence                                                                                               | Real-API status                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Basic and multi-turn conversation                   | Producer/Webview/session unit and integration coverage passed in task 5.4                                      | Blocked before launch by missing explicit provider/model/cost authorization |
| Compaction and continuation                         | Canonical compaction code was not changed in this Agent slice                                                  | Real continuation remains unexecuted and is residual risk                   |
| Owner/application reopen and transcript restoration | Restart-capable hidden case and deterministic AppHost/Pi Session restoration coverage                          | Hidden complete-session case blocked before launch                          |
| Restored generation Tool/Job/artifact records       | Generation contracts are outside tasks 5.1-5.5 and remain scheduled under task 6.6                             | Real restoration remains unexecuted and is residual risk                    |
| Conversation switching                              | Message Queue and retained Tab/attachment tests passed in task 5.4                                             | Real multi-Conversation switching remains unexecuted and is residual risk   |
| Conversation isolation                              | Queue, projection attachment, Window/Workbench/Surface and stale-connection rejection tests passed in task 5.4 | Real interleaved session isolation remains unexecuted and is residual risk  |
| Visible UI, approval and renderer reload            | Visible composer/approval/reload case passes strict dry-run                                                    | Visible Electron/API case blocked before launch                             |

## Residual Risk

No real provider-backed Agent behavior was accepted in this environment. Before release readiness,
rerun the two focused cases with explicit provider/model/cost authorization, then execute the
remaining applicable foundational matrix cells through the complete Desktop owner. Key-free,
deterministic, or mock evidence must not be promoted to real Agent acceptance.

## Entity Read Isolation And Desktop Render Containment

- Disposition: `excluded` for provider-backed Agent Evaluation. The changed Agent behavior is the
  deterministic Workspace Entity read boundary only: `decodeProjectEntityDocument` ->
  `NodeProjectEntityRepository.readAvailable` -> Agent file-search mention projection. Prompt,
  provider/model selection, Tool routing, turn execution and response quality are unchanged.
- Canonical positive evidence keeps one valid Entity mention and ordinary Workspace file results
  available beside an invalid Entity. The owning Entity result retains an exact
  `invalid-project-entity-document` diagnostic with `entityId`; whole-document container mismatch
  remains fail-visible and does not return empty success.
- Resource-reference and binding-availability projections now use the same entry-isolating read;
  mutation still uses strict `load/mutate`, so a partial document cannot be written back.
- Desktop reuses `@neko/ui/error-boundary` at the renderer root, Workbench instance and slot
  boundaries. Focused jsdom evidence proves a synchronous Surface render failure leaves the
  PrimarySidebar and sibling Surface mounted and displays an accessible retry diagnostic. Each
  retained Agent Surface is additionally isolated by exact `agentSurfaceId`, so one conversation
  render failure does not replace its retained sibling Roots.
- The explicit Project Entity repair tool is isolated under `tools/offline-repair`, requires an
  absolute target, exact Entity identity and identity-bound confirmation, creates an exclusive
  original-byte backup, preserves the source permission mode without forcing `0600`, writes
  atomically and validates the persisted canonical document. The reachability audit proves it is
  absent from product imports, build, startup, ordinary tests and CI.
