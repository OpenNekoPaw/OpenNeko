## 1. OpenSpec Ownership Reconciliation

- [x] 1.1 Build a requirement ownership matrix for Agent phase, launch binding, Scene handoff, Character interaction, World interaction, input catalog, model configuration and Evaluation across this change and the overlapping active changes.
- [x] 1.2 Update `compose-desktop-workbench-scenes` so it owns only Window/Scene composition and references this change for Agent Draft/binding/input/config behavior; remove contradictory Character/Room success and Entry command/Skill verification claims.
- [x] 1.3 Update `define-character-chatroom-play-use` to require the typed Chara binding/context port and remove the special-text launch path from its canonical design and tasks.
- [x] 1.4 Update `define-ai-native-interactive-world` to consume the explicit Agent binding/role-scope contract only after the World owner exists and to retain World action/event/state authority.
- [x] 1.5 Update `clarify-desktop-capability-catalog` and `add-desktop-agent-evaluation-matrix` with unified source receipts, Launch Draft coverage ownership and no-fallback evidence.
- [x] 1.6 Run strict validation for every touched OpenSpec change and resolve duplicate or conflicting requirements before production code changes begin.

## 2. Canonical Agent Contracts

- [x] 2.1 Replace the split launch scope, renderer target and Conversation owner shapes with one canonical Draft phase/binding projection and strict codecs exported from `@neko/agent-contracts`.
- [x] 2.2 Define exact Assistant, Workspace, Character and World launch target/binding receipts using only minimal owner refs and legitimate Character/World domain version identities.
- [x] 2.3 Extend `AgentInputCatalogEntry` with phase requirement, binding requirement, exact source provenance, availability diagnostic and executable identity without adding an internal contract version.
- [x] 2.4 Replace Draft `messageText`-only submit with a discriminated message/command/Skill input intent plus exact mention/resource receipts and configuration request.
- [x] 2.5 Define executable model availability and per-field configuration policy/effective-value projections while preserving Conversation future-turn state and immutable Turn snapshots.
- [x] 2.6 Add producer/codec tests for legal canonical shapes, exact-key rejection, Character/World domain version preservation, stale identities and per-item fail-local diagnostics.
- [x] 2.7 Add consumer compile/contract tests proving Agent runtime, Webview and Desktop use the same canonical exports and no old launch/context/input shape remains reachable.

## 3. Launch And Binding Application Service

- [x] 3.1 Implement the single host-neutral Launch Draft application service under `@neko/agent-runtime/application` with exact connection, Draft, binding receipt and disposal lifecycles.
- [x] 3.2 Implement unbound target selection, replacement and release without creating a Conversation, provider Turn, domain Run or Scene transition.
- [x] 3.3 Define and compose explicit Assistant, Workspace, Chara and future World binding/context ports with exact provider registration and owner-qualified unavailable results.
- [x] 3.4 Implement the canonical first-submit transaction for binding/resource/input/config validation, Conversation owner/context commit, pending Turn creation and idempotent materialization.
- [x] 3.5 Implement post-commit Scene handoff and provider execution using the committed Conversation/Turn identities, preserving fail-visible Conversation state after provider failure.
- [x] 3.6 Add idempotency, cross-Draft, cross-Window, stale receipt, partial commit, provider failure and sibling-isolation application tests.
- [x] 3.7 Delete or poison active/current/recent/first Project resolution, automatic target guessing and any alternate first-submit handler; add path tests proving they cannot produce success.

## 4. Assistant And Workspace Context Providers

- [x] 4.1 Move any host-neutral AssistantSpace/grant binding policy behind the Agent application public port and keep Desktop limited to concrete sender/path/grant adapters.
- [x] 4.2 Implement the Workspace binding/context provider using exact Workspace identity and grant, bounded content/search projections and no raw-path projection.
- [x] 4.3 Make Entry Workspace selection refresh the exact binding-scoped input/model catalog without replacing the Agent Root or launch connection.
- [x] 4.4 Implement Draft-time Workspace mention search through exact Draft/connection/binding receipt authority and invalidate old results on target replacement.
- [x] 4.5 Add Workspace producer tests, Agent delegation tests and Desktop adapter tests covering valid search, wrong-Project entity rejection, late result invalidation and no current-Project fallback.
- [x] 4.6 Add Assistant tests proving unbound Entry mention search exposes only scope-neutral or explicitly granted resources and cannot read a Project implicitly.

## 5. Unified Input Catalog And Composer

- [x] 5.1 Compose builtin, personal, project, plugin and command-artifact entries into the canonical Agent input catalog with existing Skill precedence and exact command identity.
- [x] 5.2 Project launch-safe and Session-only availability for each entry, including a `session-required` result for `/compact` and other Conversation operations in Draft.
- [x] 5.3 Replace Entry `presentation !== 'entry'` command-menu gating with projection-driven `/`, `$` and `@` discovery in the existing Agent composer.
- [x] 5.4 Route selected and directly typed first-input commands/Skills through the typed Draft submit intent and preserve exact Skill/command receipts.
- [x] 5.5 Invalidate target-scoped menus, selected mentions and executable identities synchronously when the Draft binding changes while preserving Draft text and scope-neutral configuration.
- [x] 5.6 Add Agent contract/application tests for partial source failure, duplicate names, project scope, stale entry, unavailable handler and no try-next behavior.
- [x] 5.7 Add Webview tests proving Entry and Session share catalog semantics, Character policy restrictions cannot be bypassed by raw text, and session-only commands never create a Draft provider Turn.
- [x] 5.8 Delete old launch-only Skill projection, empty Entry file-search success, duplicate slash/Skill parser routes and raw prompt fallback; add reachability assertions for each removed path.

## 6. Model And Configuration Policy

- [x] 6.1 Make model catalog composition validate provider/model identity, context window, maximum output tokens, credentials and purpose capabilities before marking a model executable.
- [x] 6.2 Project disabled model diagnostics for incomplete configuration and reject stale model identities before Conversation or Turn creation.
- [x] 6.3 Implement Draft-scoped configuration requests and per-field editable/locked/unavailable policy without mutating global settings or existing Conversations.
- [x] 6.4 Implement Conversation-owned future-turn configuration updates and immutable Turn snapshots so legal model/parameter changes preserve owner, transcript, context, queue and current execution.
- [x] 6.5 Add provider/model failure tests proving no silent provider, model, purpose, profile or owner fallback and local isolation of an invalid model.
- [x] 6.6 Add restore and multi-Conversation tests proving configuration provenance and snapshots remain bound to exact Conversation/Turn identities.
- [x] 6.7 Verify direct media-generation controls and Agent Tool calls both delegate to the canonical Generation application service and do not create a hidden generation AgentSession or fallback between entry paths.

## 7. Character Extension Boundary

- [x] 7.1 Add the optional Agent-side Chara binding/context consumer port for exact CharacterVersion/CharacterRun refs and owner-qualified unavailable results without implementing a Chara product owner.
- [x] 7.2 Remove Entry and Character Surface special-text role launch; retain only the canonical typed Character binding contract for a follow-on Chara provider and register no current product success path.
- [x] 7.3 Allow a future Character provider to contribute input/config restrictions through the shared catalog and policy contracts rather than Webview conversation-kind booleans.
- [x] 7.4 Add Agent consumer tests with bounded test providers for exact CharacterVersion/Run identity, invalid owner isolation and no fabricated Character facts; defer Chara producer and knowledge filtering tests to the follow-on Chara change.
- [x] 7.5 Delete or poison `startCharacterDialogueFromSlash` construction and any handler that can create a Character session from encoded free-form text; prove the old path is unreachable.

## 8. World Extension Boundary

- [x] 8.1 Define the minimal World binding/context port and explicit composition point without adding a World package dependency, World facts, fake records or a World-specific Agent runtime.
- [x] 8.2 Project owner-qualified unavailable for World selection while no World provider is composed and verify Agent, Workspace and Character remain usable.
- [x] 8.3 Add contract tests with a bounded test provider proving a future World binding preserves World commit authority and only supplies participant/role-scoped Agent context.
- [x] 8.4 Record the exact follow-on tasks owned by `define-ai-native-interactive-world` for real WorldRun creation/attachment, visible World UI and real provider evaluation; do not mark those product behaviors complete in this change.

## 9. Desktop Composition And Scene Handoff

- [x] 9.1 Replace Desktop launch bridge wiring with the Agent application public service while retaining only sender/window/view identity, native grants, typed IPC and service disposal in `apps/neko-desktop`.
- [x] 9.2 Make Workspace and Assistant New Conversation actions create exact bound Drafts and keep Project navigation independent from Draft target selection; leave Character publication and New Dialogue to the follow-on Chara change.
- [x] 9.3 Atomically hand off a committed first submit to the exact Assistant/Workspace Scene only after Conversation materialization, without remounting a second Agent controller; leave Character Scene/Run handoff to the follow-on Chara change.
- [x] 9.4 Add Main/preload/renderer producer-consumer tests for cross-sender rejection, connection replacement, stale frame rejection, exact Scene identity and provider failure projection.
- [x] 9.5 Add application-boundary and reachability assertions proving Desktop does not own catalog policy, domain binding resolution, model merging, first-submit transaction or active Project fallback.

## 10. Deterministic And Visible UI Verification

- [x] 10.1 Run `pnpm --dir packages/agent/contracts test` and `pnpm --dir packages/agent/contracts typecheck` and record canonical codec plus no-internal-versioning evidence.
- [x] 10.2 Run `pnpm --dir packages/agent/runtime test` and `pnpm --dir packages/agent/runtime typecheck` and record launch/binding/catalog/config path evidence.
- [x] 10.3 Run `pnpm --dir packages/agent/webview test` and `pnpm --dir packages/agent/webview build` and record Entry/Session composer behavior.
- [x] 10.4 Run `pnpm --dir packages/chara test` and `pnpm --dir packages/chara typecheck` to confirm the existing Chara package remains unaffected; do not claim CharacterVersion/Run product-owner evidence in this change.
- [x] 10.5 Run `pnpm --dir apps/neko-desktop test`, `pnpm typecheck:desktop` and `pnpm test:functional:headless` and record sender-bound wiring and Scene handoff evidence.
- [x] 10.6 Run a visible `pnpm test:local:ui` scenario from the real Entry composer covering Workspace selection, real `@` results, `$skill` first submit, exact Workspace Scene transition and absence of overlap or hidden error.
- [x] 10.7 Transfer visible Character publication, bound Draft, CharacterRun materialization, Character Scene, role response, reopen and wrong-Character rejection acceptance to the follow-on Chara change; keep Character, Room, Play and World product success paths unavailable here.

## 11. Agent Evaluation

- [x] 11.1 Create the indexed `agent-runtime.launch-binding` suite and coverage-index mapping for unbound Entry, Workspace bound first submit, exact owner/Scene evidence, stale binding rejection and forbidden active-Project fallback.
- [x] 11.2 Update `agent-runtime.skill-runtime` with a visible Entry `$skill` first-submit case that proves exact Host Skill identity, activation receipt, Conversation creation and no ordinary-prompt fallback.
- [x] 11.3 Update `agent-runtime.model-binding` with same-Conversation model switching, immutable running-Turn snapshot, unavailable-model rejection and requested/effective configuration evidence.
- [x] 11.4 Update `agent-runtime.workflow-controller` with exact `/compact` Session operation, continuation after compaction and Entry `session-required` boundary coverage.
- [x] 11.5 Add Character binding Evaluation only after the visible Chara path exposes sufficient owner/context evidence; otherwise record the minimal neutral observability gap as infrastructure-blocked.
- [x] 11.6 Run `pnpm test:agent:eval` and the selected suite dry-runs, recording that key-free success proves only schema/runner readiness.
- [ ] 11.7 Run the focused visible Desktop cases and matching hidden complete-session cases with a real provider/model and explicit cost authorization; record suite/case/run ids, effective identities, hard gates, no-fallback evidence, reports and blockers.
- [x] 11.8 Audit the foundational matrix for basic/multi-turn conversation, compaction continuation, owner/application reopen, generation record restoration, Conversation switching and transcript/queue/config/context/artifact isolation; record every covered, unaffected or blocked cell.

## 12. Completion And Quality Gates

- [x] 12.1 Run `openspec validate unify-agent-launch-and-domain-bindings --strict` and `pnpm check:openspec` after all overlapping artifacts and implementation evidence are current.
- [x] 12.2 Run `pnpm check:quality`, `pnpm check:unused`, `pnpm check:legacy-debt` and `pnpm gate:local`, preserving failures rather than weakening gates or adding compatibility paths.
- [x] 12.3 Perform `neko-quality-review` with ownership, dependency direction, canonical-path, user-data, fail-local and test-evidence findings resolved or recorded.
- [x] 12.4 Record final verification commands, visible UI and Agent Evaluation reports, provider/model identities, blocked World product coverage and remaining Character/World/model-provider risks in the change verification evidence.
- [x] 12.5 Confirm deleted handlers, exports, fixtures, raw-text triggers, empty Entry search and current-Project fallback have no production or test-only reachability before marking the change complete.

## 13. Entry Default Owner And Composer Regression

- [x] 13.1 Materialize the configured default Assistant owner when an unbound Entry Draft is first submitted, without requiring target selection or consulting active/current/recent Workspace state.
- [x] 13.2 Remove duplicate Start Conversation, `/` and `$` footer actions while preserving typed trigger discovery, project selection and model configuration.
- [x] 13.3 Keep unbound `@` discovery local to scope-neutral or explicitly authorized entries and prevent Workspace-scope diagnostics from becoming global application errors.
- [x] 13.4 Add application, Desktop adapter and Webview regression tests and run visible Desktop UI acceptance for the reported paths.

## 14. Workspace Text Reference And Terminal Activity Regression

- [x] 14.1 Resolve authorized `.fountain` Workspace references as bounded text context while preserving binary/structured rejection, path containment, NUL and size limits.
- [x] 14.2 Make the Webview suppress generic execution activity when the current Turn already has a non-streaming final Assistant response, without hiding streaming text, pending Tools or output-free active runs.
- [x] 14.3 Add Desktop resolver and Webview presenter/component regression tests proving the canonical paths and forbidden binary/raw-path/empty-context behavior.
- [x] 14.4 Update the focused visible Desktop scenario to select `test.fountain`, submit through the exact Workspace binding and verify no global error plus no processing activity after the final response; inspect all current screenshots directly.
- [x] 14.5 Reuse the `agent-runtime.launch-binding` terminal-idle Evaluation coverage, run key-free validation, and keep real-provider visible/hidden execution under the existing explicit-cost blocker in task 11.7.

## 15. Workspace Image Reference Native Multimodal Path

- [x] 15.1 Replace the binary-only reference rejection with one canonical resolution contract that separates bounded text context from authorized image locators without exposing raw paths or base64.
- [x] 15.2 Materialize authorized image locators through the package-owned Agent content access runtime with MIME and byte limits, and submit transient Pi native image content to the exact Turn.
- [x] 15.3 Reject non-image binary references, invalid MIME, oversized images and exact selected models without image input before provider execution; do not switch model, provider, source or Tool path.
- [x] 15.4 Add Agent application, Pi path and Desktop resolver tests proving the positive image path, locator-only boundary, text continuity and fail-local forbidden paths.
- [x] 15.5 Run the visible Electron `@test.png` acceptance path, inspect current screenshots directly and record any provider-backed blocker under task 11.7.
- [x] 15.6 Update Evaluation disposition, run key-free relevant suites and complete the required Neko quality review for this L3 workflow change.
