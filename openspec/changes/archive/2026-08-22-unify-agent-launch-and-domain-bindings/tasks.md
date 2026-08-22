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

- [x] 5.1 Compose builtin, personal, project, plugin Skill entries and independent CommandHost entries into the canonical Agent input catalog with exact execution identity.
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
- [x] 11.7 Stop provider execution against the retired Pi path and transfer the exact visible/hidden
      Desktop, provider/model, hard-gate, no-fallback and report requirements to
      `replace-pi-with-dsh-runtime-atomically` 10.4–10.8 and
      `add-desktop-agent-evaluation-matrix` 7.9–7.10.
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

## 16. First-submit Conversation Title And Navigation Typography Regression

- [x] 16.1 Derive one deterministic, bounded Conversation title from the canonical typed first input in the Agent application and pass it through Session materialization to the Pi catalog without a model call or Renderer-owned persistence fallback.
- [x] 16.2 Notify the authoritative Home projection after the titled Conversation is materialized so Assistant and Workspace navigation display the persisted title after first submit and after reopen.
- [x] 16.3 Remove the user-visible English default from the canonical first-submit path; preserve command and Skill identity when their optional arguments are absent and cover Chinese first-input titles.
- [x] 16.4 Normalize the Project, Assistant/Workspace group, Conversation row and expand-control typography inside the Primary navigation while retaining the smaller section-heading hierarchy.
- [x] 16.5 Add focused Agent application, Pi materialization, Desktop composition and collapsed/expanded CSS contract tests, then run visible Electron acceptance for title refresh, Chinese UI and text layout.

## 17. Workspace Media Library Mention Regression

- [x] 17.1 Add an Assets-owned linked Media Library mention search that returns bounded portable Workspace locators and never exposes or recursively follows the physical link target.
- [x] 17.2 Inject the exact Workspace media mention contributor into both bound Draft and Session searches without adding a Resource Browser UI dependency or active-Workspace fallback.
- [x] 17.3 Add Assets Node, Agent composition and Desktop adapter tests for linked media results, source provenance, duplicate handling and unavailable sibling isolation.
- [x] 17.4 Update the indexed launch-binding Evaluation case and visible Desktop scenario to prove `@` selects linked Media Library content through the exact Workspace binding; keep real-provider execution under task 11.7 when cost authorization is absent.

## 18. Workspace Grant Restart And Agent Surface Failure Containment

- [x] 18.1 Extend the canonical Agent launch Host result with an owner-qualified unavailable projection for attach without adding an internal contract version or alternate success path.
- [x] 18.2 Restore the exact persisted Workspace grant in the sender- and Scene-validated Main attach boundary before launch catalog composition, with no replacement grant or active Workspace fallback.
- [x] 18.3 Keep attach/bootstrap failures local to the Agent Surface with an internationalized diagnostic and explicit retry action, without exposing raw IPC, path or grant identities or fabricating an Agent adapter.
- [x] 18.4 Add contract, Main process-boundary and Renderer regression tests proving exact restore, typed unavailable, retry, sanitized diagnostics and sibling UI preservation.
- [x] 18.5 Run focused tests, typechecks, strict OpenSpec validation, Agent Evaluation disposition, quality review and visible Electron UI validation, preserving any external runtime blocker.

## 19. Locator-first Unified Content References

- [x] 19.1 Replace the Desktop text/image/structured format policy with an authorization-only Workspace reference adapter that returns exact ContentLocators and no raw path, base64 or extracted content.
- [x] 19.2 Route bounded text materialization and structured-document instructions through the package-owned Agent content runtime; reuse `ReadDocument` for PDF, DOCX, EPUB, CBZ and other structured or binary formats declared by the canonical document reader.
- [x] 19.3 Preserve the canonical `ReadDocument -> ReadImage` document-image chain and deterministic native/perception capability selection without try-next provider, source, reader or Tool fallback.
- [x] 19.4 Project reference preparation and Turn execution failures to the exact Conversation/Turn while retaining application logging and sibling UI availability; remove the global-error projection from this path.
- [x] 19.5 Add path-level Desktop and Agent tests for bounded text, EPUB/PDF/DOCX/CBZ locator projection, native image handling, unavailable media capability, poisoned Desktop format policy and local failure isolation.
- [x] 19.6 Update the indexed Agent Evaluation disposition, run key-free focused validation and keep real-provider visible/hidden execution under task 11.7 without cost authorization.
- [x] 19.7 Run focused typechecks, strict OpenSpec validation, visible Desktop UI validation and Neko quality review; record current artifacts and residual runtime/provider risks.

## 20. Content Classification And Transcript Presentation Regression

- [x] 20.1 Classify text, Markdown, Fountain, JSON, YAML and HTML as bounded native text even when the document reader also supports the format; retain structured document, native image, exact media capability and unsupported binary routes.
- [x] 20.2 Persist one Pi Turn presentation entry containing the original user message and locator-backed reference metadata while keeping enhanced provider content transient.
- [x] 20.3 Project the presentation entry over its exact Pi user message so first submit, later Turns and reopen show one clean user message with reference tokens and no internal locator prompt.
- [x] 20.4 Ensure preparation and provider failures reach the exact Conversation terminal state without leaving generic processing activity active.
- [x] 20.5 Add content classification, Pi checkpoint/projection, first-submit handoff and failure-isolation regression tests.
- [x] 20.6 Run focused typechecks/tests, strict OpenSpec validation, visible Desktop UI validation, Agent Evaluation disposition and Neko quality review.

## 21. Persisted Conversation Bootstrap Failure Isolation

- [x] 21.1 Extend the canonical Desktop Agent bootstrap unavailable contract with one exact persisted-Conversation diagnostic and update Main/preload/Renderer consumers atomically.
- [x] 21.2 Catch only typed lifecycle/context decode failures for the requested Conversation at Desktop bootstrap; retain strict codecs and stored payloads without migration, missing-field defaults, deletion or alternate readers.
- [x] 21.3 Render the invalid Conversation as a local internationalized Agent Surface diagnostic without mounting a connection or blocking Window Shell, Workspace Main, navigation or valid sibling Conversations.
- [x] 21.4 Add repository, Main contract/boundary and Renderer tests for obsolete fields, missing canonical fields, unchanged storage, valid sibling readiness and forged-identity fail-closed behavior.
- [x] 21.5 Accept the recorded focused tests/typechecks, strict OpenSpec validation, key-free disposition
      and quality review as historical evidence; transfer visible/provider execution to the DSH successor
      instead of rerunning the retired Pi path.
  - Automated gates and the quality review passed on 2026-08-09; visible Desktop UI validation remains blocked because the Mac is locked.

## 22. Pi Document Range And Image Tool Result Regression

- [x] 22.1 Make the `ReadDocument` model-visible schema reject undeclared top-level fields and return an exact corrective diagnostic for top-level `locator`, while retaining the single `range.locator` contract.
- [x] 22.2 Add one package-owned Pi Tool-result asset loader that uses the exact Workspace `AgentContentAccessRuntime` for content and representation locators plus the existing bounded single/batch image transport.
- [x] 22.3 Compose that loader unconditionally in every Workspace Agent Tool snapshot and remove the unused optional AppHost/Desktop injection surface without adding raw-path, URI or alternate-reader success.
- [x] 22.4 Add schema, Pi bridge and Agent application path tests for correct range, invalid top-level locator, single and batch locator materialization, representation preservation and missing/invalid source fail-visible behavior.
- [x] 22.5 Accept the recorded deterministic document/image gates as historical evidence and transfer
      visible/provider image delivery to the DSH successor's perception-routing and Tool matrix; do not
      execute the retired Pi case as current acceptance.
  - Deterministic tests, typechecks, strict OpenSpec validation, key-free Evaluation and the L3 quality review passed on 2026-08-09. A complete development-process restart restored the visible Desktop Shell and the current screenshot was inspected directly. The new provider-backed EPUB Tool chain remains blocked because task 11.7 has no explicit model/cost authorization; historical Tool failures remain visible as immutable transcript history and are not new-run evidence.

## 23. Simple Model Content References And Format Routing

- [x] 23.1 Define one Conversation-scoped Agent reference binding for input, document unit, cursor and image references; keep ContentLocator and related locators internal and rebuild bindings from canonical input metadata plus persisted Pi Tool result details.
- [x] 23.2 Replace Pi-visible `ReadDocument` and `ReadImage` parameters atomically with `input_ref`, `unit_ref`, `cursor_ref` and `image_refs` strings; remove complex locator parameters, aliases and prompt serialization from the successful model path.
- [x] 23.3 Project bounded model-visible document results while retaining canonical data in internal Tool details, enforce a hard maximum of five image refs per call and reuse the existing normalization/contact-sheet transport.
- [x] 23.4 Preserve deterministic routing for basic text Read/Write, Pi native ImageContent and exact perception Tool usage; add explicit unavailable diagnostics for unregistered audio/video/score/archive/binary processors without adding Desktop readers or try-next behavior.
- [x] 23.5 Record the permission and approval decision in the Agent sandbox ADR without changing permission runtime behavior; require approval only for widened authority, network/costly perception, user code or consequential writes rather than ordinary bounded local reads.
- [x] 23.6 Add contract, adapter, reopen/compact, format-routing, invalid-reference, provider-schema and image-budget tests plus Agent Evaluation disposition for GPT-compatible and DeepSeek-compatible Tool calls.
- [x] 23.7 Accept the recorded deterministic reference-routing and quality evidence as historical; transfer
      current visible/provider execution to the DSH successor and stop this proposal as an Agent runtime
      authority.
  - Deterministic Agent Runtime tests/typecheck, strict OpenSpec validation, key-free Evaluation and the L3 quality review completed on 2026-08-09. Visible GPT/DeepSeek Desktop execution remains under task 11.7 because no provider-cost authorization was supplied.

## 24. Structured Workspace Directory Discovery

- [x] 24.1 Replace model-visible absolute/recursive directory parameters and text listing output with one bounded single-level Workspace-relative `ListDirectory` contract whose internal details retain authorized entry locators and never expose physical paths.
- [x] 24.2 Project directory entries through the existing Conversation-scoped Pi content protocol as text `workspace_path`, document/media `input_ref`, image `image_ref`, owning-domain route or explicit unavailable diagnostic; restore the same bindings from persisted Tool details without a new runtime or generic ResourceRef.
- [x] 24.3 Make basic `Read` reject known non-text classes before reading and accept unknown extensions only after bounded fatal UTF-8 and NUL validation; reject symlink directory traversal before enumeration and keep linked Media Library discovery on the Assets-owned path.
- [x] 24.4 Add Core Tool and Pi protocol tests for relative directory-to-text/document/image routing, strict text budgets, binary/protected denial, stable bounds, no absolute path/locator projection, symlink escape and sibling isolation; add the indexed Agent Evaluation case and no-fallback evidence.
- [x] 24.5 Run focused tests/typechecks, strict OpenSpec and key-free Evaluation validation, then perform `neko-quality-review`; classify visible UI validation as not applicable unless implementation changes Renderer presentation, and keep real-provider execution under task 11.7 without explicit cost authorization.

## 25. External Image Perception Tool Routing

- [x] 25.1 Register one package-owned `perception.image.understand` Tool that consumes prepared canonical image bindings, uses bounded `AgentContentAccessRuntime`, calls only the frozen Pi `image.understand` purpose model and returns structured evidence with usage and exact model identity.
- [x] 25.2 Extend the Conversation-scoped Pi content Tool protocol so the Tool exposes only short image/input refs and bounded focus while rejecting locator, path, provider, model, duplicate, oversized, stale and cross-Conversation arguments.
- [x] 25.3 Derive native, external or unavailable image routing once from the immutable Turn model policy and actual registered Tool snapshot; make Tool visibility, content planning and Prompt consume that same route, and remove config-id-based Prompt claims plus the text-model `ReadImage` success path.
- [x] 25.4 Add Tool, protocol, AppHost and Prompt regression tests proving exact purpose identity, evidence/usage, native/external/unavailable routes, local failure isolation and forbidden provider/model/source/`ReadImage` fallback.
- [x] 25.5 Update `agent-runtime.perception-routing` with external/native/missing-binding path evidence and run key-free suite validation; retain real visible/hidden provider execution under task 11.7 without explicit cost authorization.
- [x] 25.6 Run focused typechecks/tests, strict OpenSpec validation and `neko-quality-review`; record commands, findings and remaining real-provider risk in verification evidence.

## 26. Full-capability Conversation Queue And Interruption

- [x] 26.1 Replace the text-only running-send policy with one full canonical input queue contract whose safe Draft presentation preserves supported attachments, context, references, typed input and configuration for exact edit restoration.
- [x] 26.2 Make explicit Turn cancellation pause pending items, and add one atomic `sendQueuedMessageNow` application operation that promotes the exact item, resumes the queue and cancels the active Turn without same-Conversation concurrency.
- [x] 26.3 Atomically replace the old promote route across contracts, Host controller, Desktop composition and Webview facade; preserve exact Conversation/item validation and fail-local queue snapshots.
- [x] 26.4 Restore a queued edit's complete Draft presentation into its owning Tab, preserve an existing non-empty Composer with a local diagnostic, and keep delete scoped to one pending item.
- [x] 26.5 Keep the Composer editable during active Turns, remove wait-or-cancel placeholder semantics, expose a stable visible stop control and render delete/edit/immediate-send actions for each authoritative queue item.
- [x] 26.6 Add contract, queue, AppHost, Host controller, Webview hook/component and Desktop composition tests for rich queue parity, normal drain, cancelled pause, send-now ordering, edit/delete, stale identity, Conversation isolation and visible controls.
- [x] 26.7 Update `agent-runtime.workflow-controller` Evaluation evidence, run key-free and focused deterministic validation, perform visible Desktop UI validation plus `neko-quality-review`, and record real-provider/cost blockers in verification evidence.
