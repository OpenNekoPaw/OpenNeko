## 1. Architecture and canonical contracts

- [x] 1.1 Reconcile the Character proposal so current scope is Character, Dialogue, Chatroom and minimum World Foundation, while Browser Use, Computer Use, Play-use, external games and VLA remain owned by independent changes.
- [x] 1.2 Define canonical CharacterProject, immutable CharacterVersion, authoring-test snapshot, CharacterRun and UserCharacterRelationship contracts with strict codecs and fail-local diagnostics.
- [x] 1.3 Define canonical CharacterRoom, RoomRun, participant/controller, RoomEvent, scheduling policy and exact AgentSession mapping contracts.
- [x] 1.4 Define canonical WorldProject, immutable WorldVersion, WorldBook, WorldRun, WorldActionIntent, WorldEvent, WorldState, WorldView, WorldSave and branch binding contracts.
- [x] 1.5 Define companion/narrative DialogueRun and RoomRun discriminated contracts: companion World binding optional, narrative WorldVersion/Run/Save/branch binding required.
- [x] 1.6 Add architecture and contract tests proving unique owners, exact subpath imports, no internal contract versions, no alternate handlers and fail-local invalid-record isolation.

## 2. Character authoring and publication

- [x] 2.1 Implement CharacterProject draft, evidence/candidate review, canon validation and representation-ref orchestration in `@neko/chara`.
- [x] 2.2 Implement publication of immutable, user-managed CharacterVersion records without provider secret, runtime handle, raw local path, transcript or dynamic World state.
- [x] 2.3 Keep Dialogue/Embody authoring-test snapshots distinct from published CharacterVersion and reject their use in formal companion/narrative runs.
- [x] 2.4 Add producer tests for draft update, review, publication immutability, invalid record isolation and exact version selection.

## 3. Canonical AgentSession composition

- [x] 3.1 Define a narrow Chara consumer port that maps each agent-controlled CharacterRun to exactly one primary Pi AgentSession.
- [x] 3.2 Materialize frozen CharacterVersion, authorized memory, RoomView and optional WorldView into the Agent turn context without creating a Chara responder/transcript loop.
- [x] 3.3 Ensure human-controlled characters do not create hidden AgentSessions and that participant sessions never share mutable transcript, model config or memory view.
- [x] 3.4 Add path tests proving product Dialogue/Chatroom uses Pi turn, Tool Call, Approval, cancellation, transcript and compaction, with existing local session kernels restricted to authoring tests.
- [ ] 3.5 Run focused real Agent evaluations for companion dialogue, narrative knowledge boundaries, multi-participant identity and context isolation.
  - Blocked: the isolated Desktop fixture has no configured Agent provider/model, and the complete-session Evaluation driver does not yet expose Character-specific operations and neutral owner/context facts. The visible product path fails with `Choose a configured Desktop Agent provider and model before sending.`; mock or direct-runtime evidence is not counted as completion.

## 4. Dialogue and Chatroom application runtime

- [x] 4.1 Implement companion and narrative DialogueRun creation with frozen CharacterVersion, memory owner and exact primary AgentSession identity.
- [x] 4.2 Implement CharacterRoom durable records and RoomRun lifecycle with stable participant/controller identities.
- [x] 4.3 Implement the RoomEvent timeline and `expectedRoomRevision` commit invariant for messages, membership, mentions, moderation, scheduling and accepted participant responses.
- [x] 4.4 Implement bounded mentioned, turn-based and autonomous scheduling without shared responders or continuous hidden execution.
- [x] 4.5 Implement participant-scoped RoomView filtering and tests preventing private events or another participant's memory from entering an ineligible AgentSession.
- [x] 4.6 Implement UserCharacterRelationship candidate/accept/reject/correct/delete semantics for companion runs without promoting searchable transcript to accepted memory.

## 5. Minimum World Foundation

- [x] 5.1 Establish the host-neutral World package with explicit contracts, core, application and testing public subpaths; do not add empty Node/Webview/provider/control packages.
- [x] 5.2 Implement WorldProject authoring for WorldBook, background, locations, organizations, rules, initial facts and reviewed source refs.
- [x] 5.3 Implement immutable WorldVersion publication and exact dependency validation without internal format versioning.
- [x] 5.4 Implement WorldRun, strict WorldActionIntent validation, `expectedWorldStateRevision` commit, ordered WorldEvent and WorldState derivation.
- [x] 5.5 Implement participant/actor-scoped WorldView using branch, timepoint, knowledge and visibility hard filters before any Agent context materialization.
- [x] 5.6 Implement durable WorldSave and branch identity sufficient for current narrative continuation; defer advanced checkpoint/replay UX to the future World change.
- [x] 5.7 Implement RoomWorldBinding: optional for companion runs and mandatory for narrative runs, with no active/recent World fallback or runtime-kind downgrade.
- [x] 5.8 Add tests proving Room utterances do not mutate WorldState, only committed WorldEvent changes state, and one invalid World record leaves sibling Rooms/Worlds available.

## 6. Desktop and Webview composition

- [x] 6.1 Add sender-bound typed IPC and concrete repository adapters for Character, Room and minimum World public services while keeping all host-neutral workflow out of `apps/neko-desktop`.
- [x] 6.2 Replace the four-tab Character Foundation product surface with a Project Management-style Character catalog Main and exact Character detail Secondary Main; delete the old successful navigation and hidden-root path.
  - Follow-up layout convergence: Character catalog/detail and Character Interaction surfaces use the same edge-to-edge Workbench composition as Workspace; shared Shell tests also protect the adjacent Asset management/preview split from reintroducing scene gutters.
- [ ] 6.3 Move Dialogue/Chatroom creation out of Character Management. Add typed Agent Entry `@CharacterVersion` selection so one role atomically creates Dialogue and multiple roles atomically create Room without treating the selection as prompt context.
  - Partial: Agent Entry now keeps Character launch tokens separate from ordinary context, one exact published CharacterVersion creates a companion Dialogue, and multiple ordered CharacterVersions atomically create a companion Room with isolated participant AgentSessions. Narrative Entry remains incomplete because no exact WorldVersion/WorldRun/WorldSave/branch selector or participant actor mapping is available; the product does not infer either authority.
- [x] 6.4 Keep incomplete narrative, World and Character routes registered as explicit unavailable diagnostics; do not create empty project, implicit owner or no-op success paths.
- [x] 6.5 Add exact `character-interaction` Desktop scene composition with Agent Interaction, Avatar/Scene Main, Character/World Manager, optional Timeline and Status slots; switching scene must unmount every Root without cancelling protected runtimes.
- [x] 6.6 Add the canonical Room message/participant-turn command path through package application service, typed Host command and Agent participant sessions; remove the disabled Room submission placeholder.
  - Completed: first and subsequent Room messages enter one Chara-owned submission service. It atomically commits the human message and scheduling event, materializes each exact participant context, invokes that participant's primary AgentSession, and accepts responses through the observed `roomRevision`; provider failures and stale provisional responses remain local and diagnostic. The Agent Interaction feed and Room Timeline now consume the same rebuildable, user-filtered `RoomView` through a sender-bound Host subscription, while composer, Tool Call and Approval remain owned by Agent. Renderer reload replaces the prior subscription; snapshot and projection events share an exact request identity and sequence baseline, so request-time updates are buffered while stale callbacks are rejected.
- [ ] 6.7 Add the minimum WorldActionIntent product bridge through the World application service and show accepted WorldEvent in the combined projection; remove the World evolution read-only placeholder without inventing free-form event commits.

## 7. Character Avatar and runtime management

- [ ] 7.1 Define strict Character representation kinds and active-selection contract for portrait, Live2D, VRM, MMD and PNGTuber using stable authorized resource identities rather than raw paths.
- [ ] 7.2 Add a package-owned Avatar Surface contract and exact renderer selection. Implement only formats with a real renderer; return a local unavailable diagnostic for every unimplemented kind and prohibit renderer fallback.
- [ ] 7.3 Mount the first real Avatar representation in Character Workbench Main, prove disposal on scene exit and preserve only viewport/camera/pose/layout in the package-owned presentation snapshot.
- [ ] 7.4 Add Character Runtime Management projections for relationship memory, Dialogue/Room runs, Agent Conversation status, narrative WorldSave/branch and representation state without copying their authoritative data.
- [ ] 7.5 Add explicit continue/branch/archive/delete operations only where the owning domain already supports them; keep unsupported memory/story/save controls unavailable rather than successful no-ops.

## 8. Verification and delivery

- [ ] 8.1 Update isolated fixtures for Character catalog/detail, single-mention Dialogue, multi-mention Room, Workbench slots, companion room without World, narrative room with World, invalid Avatar renderer and scene recovery.
  - Partial: focused Renderer fixtures cover Character catalog/detail selection, single/multiple Character launch projection, Character/Room Workbench slots, the shared Room Interaction/Timeline projection, Room-only Timeline and Root unmount on navigation. Main/preload fixtures also cover exact Room Scene authorization, subscription replacement, request-time event buffering, stale request callback rejection and event-sequence restart after renderer reload. Visible Electron evidence, narrative World binding and real Avatar renderer states remain incomplete.
- [ ] 8.2 Add producer/consumer/path tests for exact launch selection, atomic no-partial failure, single AgentSession per CharacterRun, exact Avatar renderer, Room/World timeline separation, memory isolation, stale CAS rejection and fail-local Surface errors.
  - Partial: exact launch selection, atomic aggregate failure, distinct AgentSession identity, Character/Room scene contract, unavailable Surface isolation, canonical Room message/scheduling, participant provider failure isolation, stale-response CAS rejection, user-scoped Room projection and one authoritative projection feeding both Room surfaces are covered. Exact Avatar renderer, combined Room/World timeline and runtime-management projection tests remain incomplete.
- [ ] 8.3 Run focused package tests/typechecks, `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt` and `pnpm check:unused` after the replacement path is complete.
  - Passed: all workspace tests, production Desktop build/package, quality orchestration, OpenSpec, dependency, application/Webview boundary, legacy-debt and internal-versioning gates. The full run recorded Chara at 18 files / 97 tests, World at 3 files / 15 tests and Desktop at 70 files / 443 tests; the final review then added a command-failure visibility regression and reran Chara Webview at 2 files / 6 tests plus its strict typecheck.
  - Repository baseline: `pnpm check` / `pnpm check:unused` still reports the existing Knip baseline of 3 unused files and 149 unused exports. All new Chara/World unused findings were removed; the unrelated baseline remains visible rather than being changed by this proposal.
  - Replacement review: focused Chara, Chara Webview, Agent contracts/Webview, Host and Desktop tests/typechecks passed. Application/Webview boundaries, dependency direction, package roles, OpenSpec, legacy-debt and internal-versioning checks passed; internal versioning reports zero new occurrences.
  - Room projection review: Chara passed 20 files / 106 tests and typecheck; Chara Webview passed 2 files / 7 tests and typecheck; Agent Webview passed 90 files / 711 tests and typecheck; focused Desktop Main/preload passed 2 files / 45 tests and Desktop typecheck. A preceding full Desktop run passed 71 files / 451 tests.
- [ ] 8.4 Run visible real Electron flows through Character catalog -> detail/publication -> Agent Entry `@角色` -> Dialogue/Room Workbench -> Avatar/Scene -> World-bound narrative -> close/reopen, recording exact commands, evidence and residual risks.
  - Partial: the isolated visible Electron fixture completed Character creation/publication, relationship creation, human-controlled companion Dialogue, World publication/save, companion Chatroom without World, scene unmount and full application restart recovery. Normal and smaller window states showed no clipping or overlap; the restarted 1229 x 768 Chatroom capture is `${FIXTURE_HOME}/character-room-restart.jpg`.
  - Blocked: Agent Dialogue, RoomRun and World-bound narrative require a configured real provider/model. The visible diagnostic is preserved and these flows are not counted as passed.
- [ ] 8.5 Update the Character-focused Evaluation authoring for first-submit owner selection and Workbench restore, run the applicable real Agent subset, and classify any unexecuted matrix as residual risk rather than replacing it with mock or direct-runtime evidence.
  - Blocked: `pnpm test:agent:eval` passed its key-free harness (44 files / 285 tests; 23 suites / 54 dry-run cases), but no provider-backed Character case could run. The exact missing provider/model configuration and Character complete-session observability gap remain release residual risks.
- [ ] 8.6 Repeat `neko-quality-review` and `neko-ui-validation` after the replacement implementation, including canonical-path proof, normal/small/dense/diagnostic Avatar states and direct visual evidence.
  - Current replacement review: no blocking code-quality finding remains after focused typechecks, component/contract tests, canonical Room subscription race tests and repository architecture gates. The UI inventory now covers Room loading/empty/update/private-filter/reload/error states and adjacent Agent controls, but visible Electron screenshots for the replacement layout have not yet been produced, so UI review remains `blocked`, not passed. Real-provider Agent, narrative, Avatar renderer and runtime-management states remain unverified.
