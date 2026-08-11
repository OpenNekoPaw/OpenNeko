## 1. Canonical Contract And Specification Alignment

- [x] 1.1 Reconcile `define-character-dialogue-chatroom-world-foundation` and related active OpenSpec artifacts so this change is the sole canonical owner for Companion/Narrative semantics, Storyline runtime removal, continuity and Character Workbench context; record every superseded requirement and leave no contradictory implementation task active.
- [x] 1.2 Update Character domain architecture and capability documentation to distinguish Character/Storyline authoring facts, Companion continuity, Agent Conversation/transcript ownership, external context ownership, Host Scene composition and Electron trust-boundary adapters.
- [x] 1.3 Replace the current `runtimeKind` plus optional launch fields with one strict `companion | narrative` discriminated contract shared by Dialogue and Room, including exact participant and Conversation owner identities.
- [x] 1.4 Add producer codec tests for valid Companion, free Narrative and node-bound Narrative selections, including independent per-participant Narrative node refs in Room.
- [x] 1.5 Add consumer/delegation tests proving Agent, Host, Webview and Desktop consume the same canonical selection shape without reconstructing mode or selecting active/recent identities.
- [x] 1.6 Delete or poison old `runtimeKind`, external Composition, optional cross-mode memory/material and StorylineRun launch fields; add source scans and decode tests proving old shapes fail locally instead of entering a compatibility path.

## 2. Storyline Authoring Model

- [x] 2.1 Add stable `CharacterStoryline` identity and repository contracts under `@neko/chara`, scoped to one CharacterProject and independent from CharacterVersion publication identity.
- [x] 2.2 Implement the single mutable `CharacterStorylineDraft` authoring path with exact node identities, ordering/edge validation and author-visible diagnostics.
- [x] 2.3 Extend immutable `CharacterStorylineVersion` publication to pin one exact CharacterVersion and snapshot every published StorylineNode without internal schema/version routing.
- [x] 2.4 Define and validate node-owned narrative context for situation, time/location, character and relationship state, allowed/forbidden facts, narrative memories, knowledge boundary, behavior/expression constraints and author-only visibility.
- [x] 2.5 Implement Storyline catalog, draft edit, validate, publish, compare, restore-as-draft and delete lifecycle services in `@neko/chara`, with exact ownership and record-local failure behavior.
- [x] 2.6 Add Storyline authoring producer and repository tests proving independent Storylines, multiple user-managed publications, stable conceptual node identity and immutable old publications.
- [x] 2.7 Add Chara Webview authoring/catalog consumers for selecting Storyline, comparing publications and editing/publishing drafts without exposing runtime progress controls.

## 3. Remove Runtime Storyline State

- [x] 3.1 Remove `CharacterStorylineRun`, observation candidate, accepted transition, progress revision/CAS and CharacterRun/MemoryScope StorylineRun binding contracts from `@neko/chara` public exports and codecs.
- [x] 3.2 Delete StorylineRun repository, create/update/transition application services and all Chara Node persistence registrations that make those operations successful.
- [x] 3.3 Replace Narrative launch-time StorylineRun creation with one immutable exact Storyline/Version/Node selection receipt owned by the Character Conversation binding.
- [x] 3.4 Replace full StorylineRun JSON prompt payloads with the bounded authored node projection, and add consumer tests proving future/forbidden facts and author-only notes never reach Character Agent context.
- [x] 3.5 Add poison tests and public-entry scans proving model output, RoomEvent, Experience, World, Save, branch and Conversation operations cannot mutate Storyline facts or progress.
- [x] 3.6 Add runtime verification proving transition-like dialogue leaves the active Conversation on the same exact StorylineVersion/Node and can only create an explicit authoring candidate.

## 4. Companion Continuity And Memory Isolation

- [x] 4.1 Define one stable Chara-owned Companion continuity identity for exact user and CharacterProject scope, separate from CharacterRun, Conversation and CharacterVersion identities.
- [x] 4.2 Implement accepted Character-subjective memory and UserCharacterRelationship repositories/services with exact source CharacterVersion and Conversation/Turn or RoomEvent provenance.
- [x] 4.3 Implement the canonical continuity projector for a selected CharacterVersion, including knowledge/behavior compatibility diagnostics that preserve but exclude incompatible entries.
- [x] 4.4 Atomically replace CharacterRun-owned MemoryScope reads/writes with the stable continuity service for Companion, updating every producer, consumer, fixture and repository registration.
- [x] 4.5 Reject Companion continuity binding, reads, candidates and writes from every Narrative Dialogue/Room path before Agent context materialization.
- [x] 4.6 Add producer and persistence tests for cross-Conversation continuity, relationship separation, explicit correction/deletion, provenance retention and CharacterVersion compatibility.
- [x] 4.7 Add consumer/runtime tests proving Companion reuses eligible accepted memory after Conversation and application reopen while Narrative receives only authored node narrative memories.
- [x] 4.8 Delete or poison the replaced run-scoped memory success path and add scans proving there is no import, copy-on-launch, active-run fallback or dual-read/dual-write behavior.

## 5. Conversation Modes And Agent Runtime Integration

- [x] 5.1 Implement atomic launch validation and commit for Companion Dialogue/Room, free Narrative Dialogue/Room and node-bound Narrative Dialogue/Room, with no partial CharacterRun, Room or AgentSession on pre-commit failure.
- [x] 5.2 Remove the Narrative external-Composition requirement and implement exact CharacterVersion plus optional StorylineVersion/Node context materialization without Experience, World, Save or branch dependencies.
- [x] 5.3 Freeze mode and exact Character/Storyline selections before first submit and reject attempts to switch an active Conversation's mode; expose explicit new-Conversation creation instead.
- [x] 5.4 Add a compact per-started-turn Narrative receipt containing exact Conversation, Turn, CharacterVersion and optional Storyline/Version/Node identities without duplicating transcript or node content.
- [x] 5.5 Add receipt restore and compaction tests proving AgentSession remains the only message owner, exact old publication context rematerializes, and missing source publication fails only the affected Conversation.
- [x] 5.6 Delete `CharacterCompanionAssistantLane`, its service, repository/table, exports and fixtures plus the Chara-owned external-material ref/projection contract; add poison/source tests proving no persisted lane, hidden AssistantSession or parallel attachment owner remains reachable.
- [x] 5.7 Migrate Character Dialogue and every scheduled Room participant from `CharacterPrimaryAgentSessionAdapter`/direct `AgentWorkspaceRuntime` and Desktop provider special branches to the canonical Agent launch/Conversation/Turn/domain-binding application services; register exact Chara Character/Room context plus frozen mode-constraint providers, move chat model/configuration receipt authority out of Chara Presentation into exact per-participant Agent configuration, retain Chara-owned TTS/representation configuration, and delete the replaced success handlers.
- [ ] 5.8 Reuse Agent-owned references, resource grants and context providers for Companion attachments, keeping bytes/raw paths outside Chara and freezing only the current participant turn's authorized projection; reject Narrative before Agent materialization.
- [x] 5.9 Add producer/consumer and path-level tests proving effective provider/model/Skill/Tool/Approval/permission receipts are Agent-owned and participant-exact, Companion tool calls use the standard Agent lifecycle, Narrative prompt/tool exposure is empty and fail-closed, sibling configurations remain isolated, unavailable or denied operations do not enter a Character fallback path, and material/model output never auto-promotes to Character canon or memory.
- [x] 5.10 Verify multi-character Room scheduling gives every Character an independent primary AgentSession, model/TTS/config receipt, personal Narrative projection and visibility-filtered RoomView without sibling context leakage.
- [ ] 5.11 Define Agent-owned `CharacterRoleSkillPrimitivePorts` backed by narrow Chara public profile/evidence/dialogue/evaluation/artifact/confirmation operations, without promoting the testing-only `CharacterDialogueRuntimeService`; register owner-qualified Chara use/preview/validation in the standard Workspace Agent capability catalog, keep Workspace binding immutable, run validation with a tool-free Character responder plus independent Probe Agent, save only authorized project-local reports, require confirmation for suggestions, and add poison tests against direct Character runtime/provider shortcuts or implicit formal Run/memory creation.

## 6. Character Interaction Workbench

- [x] 6.1 Extend `@neko/host` Character Interaction Scene contracts with exact bounded Agent Interaction, Main Presentation, right Context/Participant, optional Storyline/RoomEvent Timeline and status surface refs.
- [x] 6.2 Replace fixed Avatar Main selection with one strict owner-qualified Character Presentation surface union and an exact registry that rejects duplicate, unknown and mismatched providers without renderer fallback.
- [ ] 6.3 Implement `@neko/chara-webview` Companion context UI with one Character composer, exact CharacterVersion and effective Agent configuration receipt, Agent-owned removable references, standard Skill/Tool/Approval projections, exact role-manager provider/model/capability commands, explicit memory/candidate actions and no native/Assistant lane or global Character model control.
- [x] 6.4 Implement `@neko/chara-webview` Narrative context UI showing the frozen CharacterVersion, Storyline publication/node and consumer-visible background while omitting attachment and Companion-memory controls.
- [x] 6.5 Implement read-only Storyline Timeline projections and interactions for inspect or explicit new Conversation, with separate RoomEvent Timeline rendering and no progress/completion semantics.
- [ ] 6.6 Complete the Room participant manager over the existing projection: show exact participant, controller, CharacterVersion, optional node, AgentSession, provider/model/TTS, representation and scheduling eligibility; route provider/model and Companion Skill/Tool changes to the exact Agent participant configuration, and omit/disable Narrative capability activation.
- [ ] 6.7 Add Host and Webview tests for owner matching, invalid-surface local diagnostics, per-participant configuration/commands and sibling isolation, Narrative no-tool controls, narrow deterministic layout, separate Timeline identities and absence of hidden/off-screen business Roots.
- [x] 6.8 Remove Desktop Character/Room provider-execution branches and direct AgentWorkspace wiring; retain only sender-bound typed ports, resource authorization, Scene composition and public Agent/Chara port wiring, with delegation tests proving Desktop decides neither Agent execution nor mode/memory/node/Presentation policy.
- [x] 6.9 Add runtime lifecycle tests proving navigation unmounts Character Roots and releases unprotected presentation resources while exact protected Agent turns continue and reopen without duplicate runtime creation.
- [x] 6.10 Preserve the Character product promotion gate and add poison tests proving no feature flag, test route, saved Scene or legacy entry makes the production Character/Room entry successful before a later promotion change.

## 7. Persistence And Existing User Data Protection

- [x] 7.1 Implement Chara Node repositories for Storyline identity/draft/publication, Companion continuity and mode receipts using canonical codecs, exact relative workspace paths and per-record diagnostics.
- [x] 7.2 Keep unreadable or obsolete StorylineRun and run-scoped memory records visible as invalid owner-qualified catalog entries while excluding them from every new runtime success path.
- [x] 7.3 Provide an explicit offline inspect/export/cleanup operation for obsolete runtime records; require exact user selection and preserve original bytes on validation or write failure.
- [x] 7.4 Add repository corruption and sibling-isolation tests proving one invalid Storyline, memory entry, receipt or Presentation ref does not block valid Characters, Conversations, capabilities or workspace startup.
- [x] 7.5 Add deletion/poison tests proving no automatic conversion, latest-version substitution, active-Conversation fallback, dual reader, automatic repair or silent data discard remains after the canonical cutover.

## 8. Agent Evaluation And Visible Product Verification

- [ ] 8.1 Add script-driven key-free Agent Evaluation scenarios/assertions for canonical Agent path routing, participant-exact effective configuration receipts, one Companion tool/approval flow, Narrative empty Skill/Tool exposure, removed Assistant/special-path poison, Workspace Chara capability/use/validation boundaries, Narrative knowledge exclusion, Companion memory continuity and Room participant isolation.
- [ ] 8.2 Run provider-backed hidden Desktop evaluations through the public Agent input path for the same minimal CharacterVersion on at least two exact per-participant Agent configurations, one Companion tool call, one Narrative no-tool case, Companion follow-up memory/material, Workspace Chara use/validation, Narrative node constraints and multi-character Room isolation; record provider/model/capability identity, repeated-run evidence and failures.
- [ ] 8.3 Run visible real Electron flows through user-operable launch, one Character composer, exact role/participant provider/model and Companion Skill/Tool/Approval controls, Narrative disabled capability state, Storyline selection, Timeline, participant and error controls; capture evidence for exact Conversation/Scene identity, final response, transcript/tool restore and fail-visible diagnostics without any native-model selector or global Character model control.
- [ ] 8.4 Verify production Character Entry remains unavailable after successful prototype evaluation, and document which promotion evidence is still intentionally deferred to a later change.

## 9. Completion Gates And Residual Risk Review

- [ ] 9.1 Re-run focused package checks after deleting the Assistant/attachment path and updating Chara context providers: `pnpm --filter @neko/chara typecheck && pnpm --filter @neko/chara test`, `pnpm --filter @neko/chara-node typecheck && pnpm --filter @neko/chara-node test`, and `pnpm --filter @neko/chara-webview typecheck && pnpm --filter @neko/chara-webview test`.
- [ ] 9.2 Re-run Agent and Host checks after canonical Agent-path, participant configuration and Workspace Chara capability migration: `pnpm --filter @neko/agent-contracts typecheck && pnpm --filter @neko/agent-contracts test`, `pnpm --filter @neko/agent-runtime typecheck && pnpm --filter @neko/agent-runtime test`, `pnpm --filter @neko/agent-webview test`, and `pnpm --filter @neko/host test`.
- [ ] 9.3 Run Desktop and repository gates: `pnpm --filter @neko/app-desktop typecheck && pnpm --filter @neko/app-desktop test`, `pnpm check:application-boundaries`, `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec`, and `git diff --check`.
- [ ] 9.4 Run the full required quality matrix: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm check`; record any environment-blocked command without treating focused success as replacement evidence.
- [ ] 9.5 Review canonical-path evidence: list the unique owner, producer, consumer, handler/adapter and persistence path for every migrated responsibility, plus deletion/poison/fail-closed proof for StorylineRun, external Composition, run-scoped memory, Companion Assistant lane, Character-specific Agent execution/attachment paths, Narrative Skill/Tool activation, global Character model configuration, Workspace direct Character runtime calls, fixed Avatar Main and runtime-count manager.
- [x] 9.6 Document residual risks and unexecuted evidence for memory compatibility policy, context-budget behavior, provider-backed repetition, presentation provider availability, obsolete-record cleanup and future product promotion; do not mark the change complete while a required path or user-data risk remains unverified.
