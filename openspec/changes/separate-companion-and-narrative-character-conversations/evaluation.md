## Agent Evaluation Disposition

### Classification

This change affects Character prompt context, AgentSession routing, provider/model ownership,
external-material projection, persistence and Desktop Agent presentation. Agent Evaluation is
therefore required before promotion.

### Deterministic evidence completed

- Companion and Narrative launch routing, atomic failure and mode immutability are covered by
  `@neko/chara` service tests.
- Narrative node filtering proves forbidden facts and author-only notes do not enter Agent context.
- Companion continuity tests cover cross-Conversation reuse, exact provenance, compatibility,
  correction and deletion.
- Agent reference/resource-grant and runtime-entry tests prove Companion uses the Agent-owned
  projection path and Narrative rejects refs before Character runtime materialization.
- Room tests cover independent primary AgentSession and visibility-filtered RoomView context.

These are key-free contract/application evidence only. They are not model-quality, real-provider or
visible-product evidence.

The builtin `character-creator` suite also keeps a strict missing-target boundary case: the Skill is
available from an unbound Assistant Draft, but typed execution without the exact operation target
receipt is rejected before Conversation/model execution and cannot mutate a Character draft. The
current Scenario vocabulary cannot create a standalone or project-local Character draft through
the visible destination chooser, so the successful global and Workspace paths remain covered by
contract, Runtime, Desktop composition and Webview interaction tests rather than being represented
as unsupported Evaluation steps.

### Required evaluation work still open

The package-only Companion Assistant/attachment lane has been deleted. Single-Character initial
turns now freeze Chara context and a mode-qualified capability constraint into the canonical Agent
Conversation/Turn path. Later single-Character turns also rematerialize Chara context through the
Agent controller using the exact reserved Turn identity, so accepted Companion continuity changes
and Narrative receipts are no longer bypassed by a Desktop submission branch. Narrative reaches
the provider with no Skill catalog, `read_skill` Tool or domain Tools, and its references are
rejected before domain/reference materialization on both initial and later turns. Desktop no longer
has a successful Character `executeInitialInput` provider branch or a direct
`characterInteractions.submitTurn` message branch, and initial Character reservation no longer
reads the global Assistant provider/model.

Room scheduling now enters a strict Agent-owned provider router: the outer Room interaction delegates
to Chara scheduling, while every scheduled participant reserves and executes an exact Agent-owned
Conversation through the canonical lifecycle, provider/model configuration, capability constraint
and transcript path. The deleted `CharacterPrimaryAgentSessionAdapter`,
`executeRoomInitialInput` handler and `resolveExternalOwnerTurnRuntime` shortcut are covered by
source poison checks. Participant Conversations remain managed inside their Room projection rather
than appearing as duplicate top-level Agent Home records.

The current Evaluation Scenario contract still supports only unbound/Assistant/Workspace Draft
bindings and has no authoritative Character product entry, participant configuration operation or
capability-receipt assertion. The authoring disposition remains **update
`agent-runtime.launch-binding` after Character promotion entry and supported Character/Room
evidence operations exist; currently infrastructure-blocked by missing supported Character
binding/evidence operations**. Unit output, adapter tests and key-free harness success must not be
reported as real Character Agent acceptance.

Unqualified Room references fail visibly instead of being accepted and dropped. Companion external
material qualification through Agent-owned grants/references remains open independently of the now
canonical Room participant execution path.

Key-free platform verification on 2026-08-12 passed 45 files / 307 harness tests and strict dry-run
discovery for 25 suites / 74 cases. No provider-backed or visible Character case was run because the
supported Scenario binding/evidence contract and canonical Room participant path remain absent.

Do not add a behavioral evaluation case until the Character product promotion boundary and Scenario
schema provide an authoritative Character/Room test entry plus the required participant/configuration
evidence operations. At that point, add strict scenarios for:

1. Companion follow-up using accepted continuity after application reopen.
2. The same minimal CharacterVersion in independent Conversations on at least two exact
   per-participant Agent configurations, proving identical role context, separate transcripts and
   no global Character model source.
3. Narrative node knowledge exclusion, attachment rejection and empty Skill/Tool prompt/catalog
   exposure even when stale configuration requests a capability.
4. Two-Character Narrative Room context and visibility isolation.
5. Companion Character analysis with one authorized material and no automatic canon/memory write.
6. One qualified Companion Character Agent tool call through normal discovery, Approval, permission
   and transcript projection, plus one denied call that remains Agent-local.
7. A Room whose participants use different provider/model and Companion capability configurations,
   proving configuration, Approval and transcript isolation.
8. A Workspace Agent Chara-capability invocation that preserves the Workspace binding and returns a
   bounded role artifact or explicit Character Conversation ref without automatic memory/canon
   promotion.
9. Character validation using a tool-free role responder and separate Probe Agent, with turn-scoped
   evidence, project-local report and unapplied suggestions requiring confirmation.

Provider-backed hidden Desktop repetition and visible Electron evidence remain intentionally
deferred. No current key-free result is treated as release evidence.

## 2026-08-25 Participant manager read-model slice

### Disposition

**Excluded from behavioral Agent Evaluation.** This slice changes only the Chara-owned, read-only
participant projection and Webview rendering. It does not change prompts, Skills, provider/model
selection, AgentSession execution, tool routing, persistence or approval behavior.

### Canonical path and deterministic evidence

- Canonical path: exact Chara foundation snapshot -> pure participant projector ->
  `@neko/chara-webview` surface -> Desktop right Context slot.
- Forbidden paths: identity-derived display labels, active/recent participant fallback, Desktop-owned
  participant rendering policy, Agent configuration mutation and provider/model substitution.
- `@neko/chara-webview` tests cover Dialogue details, all Room controller kinds, local search and
  selection, narrative node projection, immutable input and missing-publication rejection.
- Focused Desktop application tests prove the package surface is composed from the exact owner and
  remains isolated from an invalid Main Presentation provider.

Because no Agent input or model-visible behavior can differ, provider-backed repetition would not
measure this slice. Agent-owned provider/model summaries and participant write commands remain task
6.6 and keep the proposal-level Evaluation work open.

## 2026-08-25 Participant message identity slice

### Disposition

**Excluded from behavioral Agent Evaluation.** This slice changes only Webview message identity,
short-lived portrait authorization and current-Scene participant selection. It does not change the
Agent event contract, prompt, provider/model choice, Skill/Tool exposure, approval, turn routing,
transcript persistence or Room scheduling.

### Canonical path and deterministic evidence

- Dialogue path: exact Character Scene owner -> Chara participant projection -> authorized selected
  portrait -> optional Agent Webview presentation node.
- Room path: exact `RoomEvent.authorParticipantId` -> the same Chara participant projection ->
  authorized selected portrait -> current-Scene participant selection.
- Forbidden paths: Character identity fields in Agent transcript events, identity-derived labels,
  alternate portrait selection, raw path/resource-ref image sources, active/recent participant
  fallback and hover-triggered runtime mutation.
- Contract, Chara Webview, Agent Webview and Desktop tests must prove the unique path, local resource
  failure, sibling isolation, keyboard/hover behavior and exact manager selection before this task is
  complete. Visible Electron evidence remains required because the change is user-visible.
