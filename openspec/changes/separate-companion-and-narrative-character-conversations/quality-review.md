## Quality Review

### Scope and risk

High risk: public Character contracts, Chara application services, SQLite persistence, Host scene
contracts and Desktop Renderer composition changed together. The implementation keeps Chara as the
domain owner, Chara Node as persistence owner, Host as scene-contract owner and Desktop as the thin
trust/composition boundary.

### Canonical-path review

| Responsibility              | Unique owner/producer                                                               | Consumer/handler                                                          | Persistence and poison evidence                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storyline authoring         | Chara `CharacterStorylineService`                                                   | Chara Webview and bounded turn projector                                  | Chara Node Storyline tables; StorylineRun operations absent and obsolete rows diagnostic-only                                                                         |
| Companion continuity        | Chara continuity/relationship services                                              | Chara turn context projector                                              | Chara Node continuity/relationship CAS repositories; no run-scoped memory reader or copy path                                                                         |
| Narrative binding           | Chara launch/context services                                                       | Agent Character domain-binding provider                                   | exact Dialogue/Room binding plus compact turn receipt; no external Composition or latest-node lookup                                                                  |
| Character Agent execution   | Agent launch/Conversation/Turn services                                             | Character/Room domain binding plus Chara context/mode-constraint provider | Character and Room participants use exact Agent Conversations; old direct AgentWorkspace adapter and Desktop execution handler are deleted and poisoned               |
| Workspace Chara composition | Agent-owned Character role primitive ports backed by narrow Chara public operations | Workspace Agent turn and explicit Character Conversation handoff          | current dialogue runtime is testing-only; production ports, Agent capability registration, immutable Workspace binding and direct-runtime poison evidence remain open |
| Presentation                | Host Scene contract and exact registry                                              | Desktop Main surface boundary                                             | Scene ref only; unknown provider is Main-local and fixed Avatar selection is absent                                                                                   |
| Room context                | Chara Room services                                                                 | Chara Webview participant/RoomEvent projections                           | RoomRun/RoomEvent authority only; runtime-count manager removed                                                                                                       |
| Obsolete runtime data       | Chara Node obsolete-record service                                                  | explicit offline export destination                                       | exact raw bytes plus inspected-byte cleanup CAS; no conversion, repair or dual reader                                                                                 |

- Storyline mutation: one Chara authoring service and immutable publication path; no runtime
  StorylineRun success path.
- Companion memory: one user + CharacterProject continuity owner, one CAS repository and one
  CharacterVersion compatibility projector; no CharacterRun copy or dual reader.
- Narrative context: exact CharacterRun binding rematerializes one published node; turn receipts
  store identities only and AgentSession remains transcript owner.
- Presentation: Host stores one exact owner-qualified provider ref; Desktop resolves only the named
  `surfaceKind + providerId` registration and reports unknown providers inside Main without
  substituting Avatar or unmounting sibling surfaces.
- Timelines: Host stores one exact owner-qualified Timeline stack with separate Storyline and
  RoomEvent identities; the Renderer mounts only the projections applicable to the authoritative
  Character/Room snapshot.
- Obsolete records: old StorylineRun and MemoryScope rows remain catalog diagnostics and are excluded
  from new runtime repositories. Chara Node exposes only exact inspect/export/cleanup operations;
  cleanup compares the inspected original bytes and cannot delete a changed or failed export.

### Verification

- Chara: typecheck passed; 31 files / 153 tests passed.
- Chara Node (after Assistant/attachment deletion): typecheck passed; 5 files / 20 tests passed.
- Agent contracts: typecheck passed; 45 files / 290 tests passed.
- Agent runtime: typecheck passed; 122 files / 1,158 tests passed.
- Desktop: typecheck passed; the latest focused Character/Agent Main coverage passed 5 files / 41
  tests, with additional adapter/context coverage passing separately.
- Agent Evaluation key-free harness: 45 files / 307 tests and 25-suite / 74-case strict dry-run
  discovery passed. This is not provider-backed behavior evidence.
- `check:legacy-debt`, strict OpenSpec validation and `git diff --check` passed.
- `check:unused` has no finding in this change after removing one unused adapter export; it remains
  non-zero because concurrent `packages/agent/webview/package.json` declares an unused
  `@neko/generation` dependency.

### Open findings and residual risk

1. The Companion Assistant contract/service/table and Chara-owned external-material contract have
   been deleted; focused poison scans find only the intentional negative-test pattern.
2. Character and Room participant execution now use the Agent lifecycle and exact Conversation
   configuration. Agent owns the strict outer-Room-versus-participant provider route; the deleted
   `executeRoomInitialInput`, `CharacterPrimaryAgentSessionAdapter` and external-owner runtime
   shortcut cannot return success. Tasks 5.7 and 6.8 are closed with delegation and poison evidence.
3. Single Character future turns now use the standard Agent controller, rematerialize Chara context
   with the exact reserved Turn identity and freeze the corresponding Narrative/Presentation
   receipt against the actual AgentWorkspace Turn identity. The controller prepares Chara context,
   starts the Turn and then runs the freeze hook; a freeze failure cancels that exact Turn. This
   avoids both provider execution without a receipt and an orphan receipt when Turn creation fails.
   The removed AppHost `characterInteractions.submitTurn` branch has no successful replacement
   outside Agent, and Room participant turns use the same canonical execution service.
4. Agent now freezes an owner-qualified capability constraint. Narrative rejects Skill/command and
   external references before commit, omits capability prompt fragments, discovers an empty Skill
   snapshot and exposes no Tool (including `read_skill`). The frozen Agent constraint now also owns
   reference availability, so later Narrative file references fail before domain/reference
   materialization. Unqualified Room references fail visibly. Exact per-participant Agent
   configuration/constraint receipts are isolated in the application service; Companion external
   material qualification and the user-operable configuration UI remain unimplemented.
5. Provider/model is not yet managed as exact role/participant Agent configuration from the
   Character Workbench. The current projection is insufficient: one participant's update must not
   mutate siblings, CharacterVersion, existing receipts or a global Character setting.
6. Character Dialogue/validation support currently lives behind `@neko/chara/testing`; Workspace
   Agent has neither production `CharacterRoleSkillPrimitivePorts` nor an owner-qualified catalog
   contribution. The implementation must extract narrow public Chara operations without promoting
   the testing runtime, keep the role responder tool-free and require confirmation for suggestions.
7. Workbench task 6.7 remains open for user-operable per-participant commands and explicit narrow
   layout acceptance. Exact owner matching, provider-local failure, Timeline identities and Root
   unmount are covered, but do not replace those missing interactions.
8. Desktop typecheck passes. The full Desktop test command still has three unrelated resource
   display projection failures from concurrent preview work (100 files and 663 tests otherwise
   pass); the Character/Agent controller failure discovered by the full run was fixed and its
   focused test now passes.
9. The no-internal-versioning audit is blocked by stale shared allowances and concurrent changes; it
   also requires explicit domain/CAS allowances for the new user-managed Storyline versions and
   continuity/relationship CAS tokens before completion.
10. Provider-backed Agent Evaluation and visible Electron UI validation remain unexecuted; production
    promotion must remain closed.

### Remaining code map after proposal correction

| Area                    | Current code                                                                                                                                                                                                       | Required canonical result                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removed Assistant owner | `packages/chara/src/contracts/character-companion-assistant.ts`, `application/character-companion-assistant-service.ts`, their tests/exports and the Chara Node `chara_companion_assistant_lanes` repository/table | Delete lane identity, service and persistence success path; delete Chara-owned attachment codecs rather than moving them to another Chara module                                                                                                   |
| Agent execution         | Exact Agent domain Conversation service and provider router own Character/Room participant execution; Desktop wires only public Agent/Chara ports                                                                  | Keep old adapter/handler poison checks and add real Character Scenario evidence after promotion support exists                                                                                                                                     |
| Model and capabilities  | Chara presentation stores chat config while Agent owns effective configuration, provider/model, Skill/Tool and permission runtime; current UI does not own exact participant configuration commands                | Make Agent configuration/receipts authoritative per CharacterRun/participant; role manager configures provider/model and Companion capabilities through Agent ports, Narrative freezes no Skill/Tool, and no global Character setting is consulted |
| External material       | `CharacterInteractionService.prepareTurn` uses Chara-specific refs/materialization beside Agent reference/resource-grant support                                                                                   | Reuse Agent reference/grant/context providers; Chara only rejects Narrative and handles explicit memory/authoring candidates                                                                                                                       |
| Workbench               | Context manager shows provider/model receipts, while Companion has no completed one-lane composer/material controls                                                                                                | Add one Character composer using standard Agent model/Skill/Tool/Approval projections; poison any native-model lane selector or Assistant identity                                                                                                 |
| Workspace Chara use     | Dialogue/validation runtime exists only under `@neko/chara/testing`; Workspace Agent has no production primitive ports or canonical capability composition                                                         | Add Agent-owned Character role primitive ports backed by narrow Chara public operations, preserve Workspace binding, return artifacts or explicit handoff refs, and poison testing-runtime/direct-provider access                                  |
| Evaluation              | Existing tests cover mode/context/persistence but not canonical Agent routing or Character tool use                                                                                                                | Add path-level Agent routing/tool lifecycle assertions first, then real-provider repetition and visible Electron evidence before promotion                                                                                                         |

## 2026-08-25 Character Dialogue presentation repair

### Risk and boundary review

- Classification: L2. The repair crosses the Chara launch contract, Agent Conversation publication
  adapter and Desktop/Webview presentation, but does not add an IPC channel, persistence format,
  provider route or execution owner.
- The Global Character catalog remains the sole source of the launch display name. Chara carries
  that value only as presentation metadata; Character and CharacterVersion identities remain the
  routing and ownership keys.
- Agent still owns Conversation publication. Desktop resolves the exact selected Global Character
  before launch and fails visibly when it is absent; no identity-derived label or fallback path was
  added.
- The Agent Webview i18n catalog owns the two supported locale variants for the mode selector. The
  selector continues to emit only the canonical `companion` or `narrative` mode value.

### Focused verification

- `pnpm --filter @neko/chara typecheck` and Chara tests: 44 files / 242 tests passed.
- `pnpm --filter @neko/chara-node typecheck` and Chara Node tests: 9 files / 42 tests passed.
- `pnpm --filter @neko/agent-webview typecheck` and Agent Webview tests: 8 files / 68 tests passed.
- `pnpm --filter @neko/app-desktop typecheck` passed; focused Desktop adapter/application tests:
  2 files / 65 tests passed.
- Strict OpenSpec validation: 173 passed; `git diff --check` passed.

### Residual risk

- Existing Character Conversations retain their persisted historical title. The repair intentionally
  avoids silently rewriting user records; newly launched Conversations use the authoritative
  Global Character display name.
- The full Desktop suite still has unrelated failures in architecture/style/Board tests from the
  shared dirty worktree. Focused Character presentation coverage passes.

## 2026-08-25 Participant manager read-model slice

### Risk and architecture review

- Classification: L2. A shared Chara Webview public surface and Desktop composition changed; no IPC,
  persistence, Agent execution or provider boundary changed.
- Chara foundation records remain authoritative. The pure projector resolves exact CharacterRun,
  RoomRun, CharacterVersion, GlobalCharacter, Storyline publication and participant AgentSession
  identities and fails at the affected surface when any required authority is absent.
- `@neko/chara-webview` owns participant presentation. Desktop now only supplies locale, exact owner
  and snapshot, keeping the application shell thin and avoiding a second rendering policy.
- Dialogue and Room share one projection. Dialogue renders one details card; Room adds local-only
  search and selection over all projected participants. Neither interaction mutates domain facts.
- Provider/model summaries and configuration commands were intentionally not inferred from Chara
  data. They remain Agent-owned work under task 6.6.

### Focused verification

- `pnpm --filter @neko/chara-webview typecheck` passed.
- `pnpm --filter @neko/chara-webview test` passed: 6 files / 30 tests.
- `pnpm --filter @neko/app-desktop typecheck` passed.
- Focused Desktop application tests passed: 1 file / 60 tests.
- Focused ESLint, `check:application-boundaries`, `check:webview-boundaries`, strict OpenSpec (173
  items) and `git diff --check` passed.
- Visible real Electron Dialogue inspection passed; authoritative Room pixel inspection was blocked
  by the absence of a current Room fixture.

No new actionable correctness, boundary or user-data finding was identified. Residual risk is
limited to unexecuted Room pixel-level validation and the separately tracked Agent-owned
provider/model/write-control work. The repository-wide internal-versioning gate remains blocked by
stale allowances and unrelated new occurrences already present across the shared dirty worktree;
the participant fixture's required Room timeline CAS occurrence is registered with exact
correctness evidence. The existing Renderer style suite also remains blocked by an unrelated
Extension-card height expectation (`82px`) versus the current dirty-worktree CSS (`120px`); the
participant manager's package and visible UI checks pass independently.

### Conversation context placement repair

- Classification: L1 presentation-only fix. No contract, state owner, command, persistence or
  runtime lifecycle changed.
- Desktop right-slot composition now owns one vertical scroll boundary. The package-owned
  participant and continuity components retain their data/interaction ownership and are only laid
  out sequentially by the Desktop composition.
- A focused CSS regression test asserts column flow, one owning scroll container, content-sized
  participant presentation and uncapped continuity presentation.
- Focused style regression and Desktop application tests passed; visible Electron inspection
  confirmed continuity follows participant details and does not move or cover the Agent composer.
- Final Desktop typecheck was blocked by concurrent unrelated AI video changes: `ProviderConfig`
  currently lacks `onExternalTaskId` for `newapi-video-model.ts` and
  `media-generation-executor.ts`. This presentation-only repair introduces no TypeScript source.

No actionable quality finding remains for this repair. Room dense-state pixel validation remains the
same separate residual item recorded above.

## 2026-08-25 Participant message identity slice

### Risk and architecture review

- Classification: L2. The change extends a Chara-owned resource contract, Chara and Agent Webview
  presentation, and Desktop trust-boundary wiring; it adds no persistence format, provider route,
  prompt behavior or Agent execution owner.
- Agent transcript events remain the single canonical role-based shape. Desktop supplies only an
  optional React presentation node, so Character identity cannot become a second Agent event owner.
- Chara's exact participant projection owns display facts and selected portrait representation.
  Desktop authorizes the exact representation for the active Character/Room Scene and releases one
  lease per participant on Scene/Workbench change. Renderer receives only the authorized URL.
- Room message ownership remains `RoomEvent.authorParticipantId`. Current-Scene selection is local
  presentation state and the right manager is controlled by that exact identity; tests prove the
  Room snapshot is unchanged.
- Portrait failure is fail-local and explicit. It produces a neutral initial plus
  `未配置`/`不可用`, does not try another representation and does not expose a resource ref or path.

### Focused verification

- Chara contract/service tests: 2 files / 6 tests passed.
- Chara Webview participant/Room tests: 2 files / 24 tests passed.
- Agent Webview transcript presentation tests: 1 file / 32 tests passed.
- Desktop Character resource and application integration tests: 2 files / 63 tests passed.
- `@neko/chara`, `@neko/chara-webview`, `@neko/agent-webview` and Desktop typechecks passed.
- Focused ESLint, application/Webview boundary gates, strict OpenSpec (163 items) and
  `git diff --check` passed.
- Visible real Electron Dialogue focus/profile inspection passed; a configured portrait and Room
  dense-state pixel check remain unavailable in the current authoritative data.

No actionable finding remains in the changed path. Repository-wide quality gates remain blocked by
unrelated concurrent dirty-worktree findings: stale/new internal-versioning allowances, an
unreachable `@neko/agent-dsh-plugin` product-status declaration, renderer test files importing
`node:`, and the Extension grid-card `82px` assertion versus current `120px` CSS. None is in the
participant message identity contract, resource runtime or presentation path.
