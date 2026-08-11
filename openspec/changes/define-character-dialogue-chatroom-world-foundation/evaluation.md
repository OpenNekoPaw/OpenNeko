## Evaluation Scope

- Change: Character background story, Character origin setting, Character storyline, Character/relationship memory, Character Studio, Agent Entry `@CharacterVersion` launch, Dialogue/Room, per-participant Chat/TTS, Character Runtime Workbench and Avatar/Voice presentation.
- External scope: World authoring/runtime/storyline/save and Character + World Composition are excluded and owned by other changes. This Evaluation only proves Chara keeps those paths absent or unavailable.
- Deterministic contract behavior: `excluded` from real Agent Evaluation. Strict codecs, immutable user-managed versions, exact identities, storyline/memory CAS, record-local diagnostics and removed Character-owned external operations use deterministic package/path tests.
- Agent composition behavior: `update` target-scoped `agent-runtime.character-interaction` because background/origin lore, storyline view, Character/relationship memory, participant model configuration and Workbench restore affect effective Agent context and output.
- Shared session regression: `reuse` `agent-runtime.workflow-controller` and `agent-runtime.stream-delivery` for unchanged Pi queue, Approval, cancellation, transcript, compaction, persistence and terminal projection. Reuse is supplemental and cannot prove Chara-specific context identity.

## Cases

### Deterministic contract phase (`excluded`)

- User behavior: create, edit, publish and load exact Character background/origin/storyline/memory records; invalid siblings remain visible and isolated.
- Canonical path: Chara strict parser -> owning application service -> durable Chara record/projection.
- Evidence: Chara contract/application/repository tests, Chara Webview/Host consumer tests, package-boundary audit and internal-versioning audit.
- Forbidden path: `CharacterOriginSetting` becoming a runnable world; transcript/external event becoming accepted memory; external storyline/save fields entering Chara records; active/recent identity fallback; removed Character Foundation external command/snapshot succeeding.
- Expected failure: only the affected Character record or operation is rejected with an exact diagnostic while valid Character, Room and unrelated external records remain usable.

### Character interaction suite (`update`, deterministic implementation complete)

- Canonical positive cases: Character responds consistently with its published BackgroundStory/OriginSetting; one accepted CharacterStoryline transition affects later turns; accepted CharacterMemory is recalled only in its exact scope; companion RelationshipMemory remains separate; multiple Character participants keep isolated profile/storyline/memory/model/TTS context; exact-owner reopen restores the Character Workbench.
- Boundary cases: draft/unpublished Character; contradictory origin lore; stale storyline transition; unaccepted/deleted memory; wrong CharacterRun/MemoryScope; cross-room private event; human-controlled Character; external Composition provider absent; active turn while model/TTS changes.
- Required evidence: selected CharacterVersion identity, BackgroundStory/OriginSetting source identity, CharacterStorylineVersion/Run and revision, CharacterMemoryScope/entry source refs, UserCharacterRelationship identity, one primary Pi AgentSession per agent participant, zero AgentSession for human participants, requested/effective Chat/TTS receipt, RoomView identity, Workbench scene/slot identity, terminal state and record-local diagnostics.
- Forbidden fallback: prompt-only fake Character lore, Chara responder loop, shared participant session/storyline/memory/model/voice, in-place active-turn rebinding, implicit model/voice fallback, transcript-backed accepted memory, active/recent Character selection, or Chara-local external composition DTO/success path.
- Expected fail-visible behavior: missing or invalid Chara authority rejects only the affected launch/turn; missing external Composition rejects narrative composition before partial CharacterRun/storyline/memory/session creation while standalone Chara remains available.

## Foundational Matrix

| Cell                                | Disposition          | Reason                                                                                               |
| ----------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Basic and multi-turn conversation   | reuse + Chara update | Generic Pi behavior is covered; exact Character lore/storyline/memory context requires new evidence. |
| Context compaction and continuation | reuse + Chara update | Pi compaction remains canonical; Chara authority must remain exact after compaction.                 |
| Owner/application reopen            | update               | Exact CharacterRun, CharacterStorylineRun, MemoryScope and Workbench slot identity must restore.     |
| Multiple conversation switching     | update               | Character, Room, storyline and memory scopes must not exchange context.                              |
| Chat/TTS configuration isolation    | update               | Per-participant requested/effective receipts and next-turn-only changes require path evidence.       |
| External Composition behavior       | excluded             | Owned and evaluated by another change; Chara only proves absence/unavailable behavior.               |

## Verification

- Deterministic delta is implemented: BackgroundStory/OriginSetting codecs and publication; CharacterStoryline/Memory services and CAS; exact memory separation; Character Foundation external command/catalog deletion with poisoned old path; immutable per-turn presentation receipts; Character Studio/Runtime projections.
- The latest focused rerun passed 131 Chara tests, 5 Chara Node tests, 11 Chara Webview tests, 273 Agent contract tests, 696 Agent Webview tests and 541 Desktop tests. `pnpm build`, full workspace typecheck, dependency audit, application-boundary audit, internal-versioning audit, legacy-debt audit and strict OpenSpec validation passed; the changed Chara, Chara Node/Webview and Desktop typechecks were repeated after the final launch-recovery audit.
- `pnpm check:unused` remains a repository baseline failure with 3 unused files, 154 unused exports and 3 configuration hints; the report did not identify a new Chara file or export from this change.
- Key-free Agent Evaluation passed 44 files / 294 tests and the all-suite dry-run passed 24 suites / 64 cases. This remains harness readiness only.
- Product-path status: Agent Entry now searches published CharacterVersion/Storyline variants, performs one submit-time Chara launch, atomically binds fresh StorylineRun/MemoryScope records, hands off to the exact Character/Room Workbench, routes first and later messages through the owning service, and reopens by persisted owner identity. Character Studio now provides editable Storyline publication, Character/relationship memory review and Voice defaults. The remaining Evaluation gap is Character-specific runtime fact projection and provider authorization, not a mockable product-path substitute.
- Real provider status: after the product and evidence paths are complete, execution still requires `OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID` and `OPENNEKO_AGENT_EVAL_COST_AUTHORIZED`. A prompt-only context payload, unsupported Scenario field, mock, direct AgentSession runner or final-text match does not replace this lane.

## UI Validation

- Scope: Character Studio background/origin/storyline/memory authoring, catalog/detail, Agent Entry single/multiple Character selection, Character/Room Workbench, Avatar/Voice, Chat/TTS, exact restore and unavailable external Composition diagnostic.
- Authoritative runtime: visible isolated Electron Desktop with typed preload/Main IPC, durable Chara records and normal user-operable controls.
- Required states: normal/small/dense Character detail, long lore content, empty and multi-storyline states, accepted/pending/deleted memory, invalid record, unavailable Avatar/Voice, Room participant isolation and scene reopen.
- Current status: `partial`, with direct visible Electron evidence. In isolated durable fixtures, the user flow created a Character, edited overview/background/origin, Voice defaults and one exact VRM resource identity, set review-ready, published an immutable version, authored a Storyline, inspected the Chara-owned capability/history inventory, reached the published Character selector from Agent Entry and switched scenes. Direct image review covered the normal split view, an approximately 900 × 650 window, collapsed overview and expanded dense authoring states. The final Character Studio keeps identity essentials visible, groups Definition and Presentation into discoverable disclosures, separates review/publication into its own card, collapses Storyline/CharacterMemory/RelationshipMemory authoring by default, aligns every region to one content track and switches publication controls to one column at narrow detail widths. No overlap, clipping, per-character title wrapping or inaccessible primary action was observed after the fixes. Deterministic UI coverage additionally exercises editable Voice defaults, explicit Storyline publication, Character memory CAS review, published Character roleplay search, Dialogue/Room launch/handoff and exact-owner reopen. Room cover, selected participant portrait and latest-message speaker state stay on the left Room interaction surface, including when the Agent boundary is unavailable; Room Main does not duplicate those identities or mount another Avatar.
- Diagnostic evidence: submitting from the actual Entry composer failed visibly with `Choose a configured provider and model before sending.` This preserves the exact missing-provider boundary and creates no false Character conversation. Provider-backed Agent Entry/Dialogue/Room, visible authorized VRM/Voice timing and runtime close/reopen remain unavailable in this environment. Deterministic tests cover the new Storyline/Memory/Voice controls and concrete opaque-resource VRM runtime, timing consumption, single Main mount and disposal, but do not substitute for that visible provider-backed lane.

## Residual Risk

Production Chara now owns the canonical Character lore, storyline, subjective memory, relationship, Room and presentation contracts and no longer exposes external World commands/catalog through Character Foundation. A concrete exact-identity, opaque-resource VRM path now exists and is locally isolated/disposed. Remaining risk is concentrated in the provider-dependent visible Dialogue/Room/Voice flow and the missing Character-specific Evaluation fact support plus provider authorization. External Composition remains deliberately unavailable before partial creation.
