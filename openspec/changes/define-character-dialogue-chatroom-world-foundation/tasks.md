## 1. Chara ownership and canonical contracts

- [x] 1.1 Define canonical CharacterProject, immutable CharacterVersion, authoring-test snapshot, CharacterRun and UserCharacterRelationship contracts with strict codecs and fail-local diagnostics.
- [x] 1.2 Define canonical CharacterRoom, RoomRun, participant/controller, RoomEvent, scheduling policy and exact AgentSession mapping contracts.
- [x] 1.3 Add CharacterBackgroundStory and CharacterOriginSetting to CharacterDefinition/Project/Version, explicitly forbidding runnable-world, state, save and branch fields.
- [x] 1.4 Define CharacterStorylineVersion, CharacterStorylineRun, observation candidate, accepted transition and evidence-backed storyline CAS revision.
- [x] 1.5 Define CharacterMemoryScope, CharacterMemoryCandidate and CharacterMemoryEntry with independent accept/correct/reject/delete semantics and exact CharacterRun/StorylineRun binding.
- [x] 1.6 Define exact public Chara refs for external Composition consumers without declaring external storyline/runtime/save shape or storing active/latest fallback identity.
- [x] 1.7 Add architecture/contract tests proving Chara owns only Character lore/storyline/memory/run/room, imports no external-domain private implementation and keeps invalid records fail-local.

## 2. Character authoring and publication

- [x] 2.1 Implement CharacterProject draft, evidence/candidate review, canon validation and representation-ref orchestration in `@neko/chara`.
- [x] 2.2 Implement publication of immutable, user-managed CharacterVersion records without provider secret, runtime handle, raw local path or transcript.
- [x] 2.3 Keep Dialogue/Embody authoring-test snapshots distinct from published CharacterVersion and reject their use in formal CharacterRuns.
- [x] 2.4 Implement BackgroundStory/OriginSetting authoring, source review and publication while keeping long-form content bytes under Content owner.
- [x] 2.5 Add producer tests for background/origin draft update, publication immutability, invalid lore isolation and proof that publication cannot create an external runtime/save.

## 3. Character storyline and memory

- [x] 3.1 Implement CharacterStoryline authoring/publication with exact CharacterVersion binding and multiple explicitly selectable personal arcs.
- [x] 3.2 Implement CharacterStorylineRun creation and expected-revision transition acceptance; reject stale, wrong-run and unreviewed external observation candidates.
- [x] 3.3 Implement CharacterMemoryScope/Candidate/Entry lifecycle and source diagnostics independently from UserCharacterRelationship.
- [x] 3.4 Keep companion relationship memory and Character-subjective memory separate even when they share one transcript/event source; require independent review operations.
- [x] 3.5 Add path tests proving external evidence can only create candidates, external save/branch/delete operations cannot mutate Character memory, and cross-run/storyline recall cannot succeed.

## 4. Canonical AgentSession and Room runtime

- [x] 4.1 Map each agent-controlled CharacterRun to exactly one primary Pi AgentSession; keep local Character session kernels restricted to authoring tests.
- [x] 4.2 Ensure human-controlled Characters do not create hidden AgentSessions and participants never share mutable transcript, model config or memory view.
- [x] 4.3 Implement CharacterRoom durable records, RoomRun lifecycle, ordered RoomEvent commit, bounded scheduling and participant-scoped RoomView filtering.
- [x] 4.4 Implement UserCharacterRelationship candidate/accept/reject/correct/delete semantics without promoting searchable transcript to accepted memory.
- [x] 4.5 Remove external world/version fields from CharacterRoom and Chara-owned run contracts; bind narrative runs only through the exact typed Composition ref once its owning provider exists, otherwise fail unavailable before partial creation.
- [x] 4.6 Materialize frozen CharacterVersion, CharacterStorylineRun, Character/relationship memory and RoomView into Agent turns without adding a Chara responder/transcript loop.
- [x] 4.7 Connect Agent Entry CharacterVersion Draft selections to one canonical submit-time `CharacterConversationLaunchService` path: one Character creates Dialogue, multiple Characters create Room, the returned primary AgentSession owns the Interaction Surface, and no generic Assistant first-submit Conversation is created.
- [x] 4.8 Add Desktop producer/consumer/path tests for exact Draft/Scene validation, unpublished/duplicate selection rejection, launch cleanup before commit, Character/Room Workbench handoff, first-message dispatch and exact-owner reopen.
- [ ] 4.9 Run focused real Agent evaluations for background/origin adherence, storyline progression, memory isolation, companion Dialogue and multi-participant identity/context isolation.
  - Current blocker: the isolated Desktop fixture has no configured Agent provider/model, and the complete-session Evaluation driver lacks Character-specific lore/storyline/memory facts. Mock or direct-runtime evidence does not complete this task.

## 5. Chat, TTS, Avatar and presentation

- [x] 5.1 Implement per-CharacterRun/participant Chat and TTS configuration with CharacterVersion voice defaults, next-turn-only updates and immutable per-turn receipts.
- [x] 5.2 Define strict portrait, Live2D, VRM, MMD and PNGTuber representation refs using stable authorized resource identities rather than raw paths.
- [x] 5.3 Add package-owned Avatar Surface contract and exact renderer selection; unavailable formats fail locally without first-compatible or portrait fallback.
- [x] 5.4 Mount one dynamic Avatar runtime in Workbench Main, consume Voice timing/viseme projection and prove resource disposal on scene exit.
  - Completed with one package-owned Three/GLTF VRM runtime, an exact Main/preload-authorized opaque resource lease, timing-driven morph-target projection and scene-exit disposal tests. Missing or unsupported resources remain local diagnostics and never select another representation.
- [x] 5.5 Add deterministic tests for participant-isolated Chat/TTS, active-turn freezing, explicit bounded batch updates, provider failure isolation and no shared Room model/voice state.

## 6. Character Foundation boundary replacement

- [x] 6.1 Remove WorldProject/Version/Run/Save commands, parsers and types from `CharacterFoundationCommand` and its Host/preload contract.
- [x] 6.2 Remove the full external world catalog from `CharacterFoundationSnapshot` and `CharacterFoundationService`; retain only Chara records and record-local diagnostics.
- [x] 6.3 Remove `worldAuthoring`, `worldRuntime` and `worldCatalog` dependencies from Chara application services and Desktop Character composition.
- [x] 6.4 Update Chara Webview, Desktop fixtures and IPC tests atomically; poison removed operations and prove they cannot return success, route through Character IPC or reappear through optional old snapshot fields.
- [x] 6.5 Keep external Composition unavailable until its owning public contract/producer exists; do not add Chara-local external DTO, string bag, compatibility alias or successful no-op adapter.

## 7. Character Studio and Runtime Workbench

- [x] 7.1 Replace the four-tab Character Foundation surface with Character catalog Main and exact Character detail Secondary Main; delete the hidden-root navigation path.
- [x] 7.2 Add exact `character-interaction` scene with Agent Interaction/Room, Avatar/Scene Main, Character Runtime Configuration, optional Room Timeline and Status slots; scene exit unmounts Roots without cancelling protected Agent turns.
- [x] 7.3 Expand Character Studio detail into overview, background story, origin setting, cognition/behavior, editable Character storyline publication, Character memory review, relationship memory, presentation resources, editable voice defaults, runtime history and published versions. Summary counters alone do not complete authoring or review behavior.
- [x] 7.4 Add Character Runtime projections for CharacterStorylineRun, CharacterMemoryScope, relationship memory, Dialogue/Room, Agent Conversation status, Chat/TTS and representation state without copying authority.
- [x] 7.5 Replace generic `storyline / saves / world` Character capability placeholders with Chara-owned storyline/memory sections and an optional owning-Composition read-only summary/navigation slot.
- [x] 7.6 Add Room cover/participant portrait identity projection and prove dynamic Avatar mounts only once in Main; CharacterOriginSetting must never become a runnable scene state.
  - Completed with exact Room cover and author-selected portrait projections, one owner-qualified dynamic Avatar mount/release path, and path tests proving CharacterOriginSetting never becomes runtime scene authority.
- [x] 7.7 Wire CharacterStorylineService, CharacterMemoryService and CharacterPresentationService through strict Chara Host commands and Main composition; keep each invalid record/operation fail-local and preserve exact CAS revisions.

## 8. Verification and delivery

- [x] 8.1 Update fixtures for Character background/origin authoring, storyline selection/progression, Character/relationship memory isolation, single/multiple Character launch, Workbench restore, Chat/TTS and invalid Avatar renderer.
- [x] 8.2 Run focused Chara, Chara Node/Webview, Agent consumer and Desktop Character producer/consumer tests/typechecks; include deletion/poison proof for the removed Character-owned external path.
- [x] 8.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:application-boundaries`, `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt` and `pnpm check:unused`, recording exact results and repository baseline separately.
- [ ] 8.4 Run visible real Electron flows through Character Studio background/origin/storyline/memory authoring -> publication -> Agent Entry -> Dialogue/Room Workbench -> Avatar/Voice -> close/reopen.
  - Current evidence: isolated visible Electron passed Character create, background/origin, editable Voice defaults, exact VRM-resource authoring, review-ready publication, Storyline authoring/publication, capability/history inspection, Agent Entry Character roleplay access, scene switching, and standard/small/dense layout review. The actual user composer then failed visibly with `Choose a configured provider and model before sending.` A runtime-created CharacterMemory candidate was unavailable without that provider-backed turn, and provider-backed Dialogue/Room, Voice timing and runtime close/reopen therefore remain unverified; mock or direct-runtime evidence does not complete this task.
- [ ] 8.5 Update `agent-runtime.character-interaction` Evaluation authoring for lore/storyline/memory evidence, run the applicable real provider subset and classify unavailable Composition cases as blocked rather than replacing them with mock output.
  - Current blocker: the product now has a real visible Character search/selection/launch path, but the strict Evaluation Desktop workflow cannot yet drive its roleplay selector or project Character lore/storyline/memory/effective-presentation facts from the complete session owner. The required provider/model/cost authorization is also absent. Indexing a prompt-only or unsupported Scenario would make the key-free suite invalid rather than provide evidence.
- [x] 8.6 Repeat `neko-quality-review` and `neko-ui-validation` after implementation, including normal/small/dense/diagnostic Character states and direct visible Electron evidence.
  - Evidence: full quality gates passed; isolated visible Electron fixtures covered normal and long/dense Character Studio, approximately 900 × 650 small-window layout, immutable publication, Storyline publication and Agent Entry roleplay access. Direct image review found and fixed narrow Storyline title wrapping, unbound Entry action suppression, inconsistent flex-item content widths and the flat long-form hierarchy. The final Studio uses one aligned content track, persistent essentials, collapsible Definition/Presentation/Storyline/Memory regions and a responsive single-column publication path. Room cover/portrait/speaker projection and Avatar resource/disposal states have deterministic UI/runtime coverage. The provider-backed end-to-end lane remains explicitly blocked under 8.4 and 8.5 rather than being treated as UI evidence.
