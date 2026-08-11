## Quality Review

### Scope and risk

High risk: public Character contracts, Chara application services, SQLite persistence, Host scene
contracts and Desktop Renderer composition changed together. The implementation keeps Chara as the
domain owner, Chara Node as persistence owner, Host as scene-contract owner and Desktop as the thin
trust/composition boundary.

### Canonical-path review

| Responsibility | Unique owner/producer | Consumer/handler | Persistence and poison evidence |
| --- | --- | --- | --- |
| Storyline authoring | Chara `CharacterStorylineService` | Chara Webview and bounded turn projector | Chara Node Storyline tables; StorylineRun operations absent and obsolete rows diagnostic-only |
| Companion continuity | Chara continuity/relationship services | Chara turn context projector | Chara Node continuity/relationship CAS repositories; no run-scoped memory reader or copy path |
| Narrative binding | Chara launch/context services | Agent Character domain-binding provider | exact Dialogue/Room binding plus compact turn receipt; no external Composition or latest-node lookup |
| Character Agent execution | Agent launch/Conversation/Turn services | Character/Room domain binding plus Chara context/mode-constraint provider | Character and Room participants use exact Agent Conversations; old direct AgentWorkspace adapter and Desktop execution handler are deleted and poisoned |
| Workspace Chara composition | Agent-owned Character role primitive ports backed by narrow Chara public operations | Workspace Agent turn and explicit Character Conversation handoff | current dialogue runtime is testing-only; production ports, Agent capability registration, immutable Workspace binding and direct-runtime poison evidence remain open |
| Presentation | Host Scene contract and exact registry | Desktop Main surface boundary | Scene ref only; unknown provider is Main-local and fixed Avatar selection is absent |
| Room context | Chara Room services | Chara Webview participant/RoomEvent projections | RoomRun/RoomEvent authority only; runtime-count manager removed |
| Obsolete runtime data | Chara Node obsolete-record service | explicit offline export destination | exact raw bytes plus inspected-byte cleanup CAS; no conversion, repair or dual reader |

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

| Area | Current code | Required canonical result |
| --- | --- | --- |
| Removed Assistant owner | `packages/chara/src/contracts/character-companion-assistant.ts`, `application/character-companion-assistant-service.ts`, their tests/exports and the Chara Node `chara_companion_assistant_lanes` repository/table | Delete lane identity, service and persistence success path; delete Chara-owned attachment codecs rather than moving them to another Chara module |
| Agent execution | Exact Agent domain Conversation service and provider router own Character/Room participant execution; Desktop wires only public Agent/Chara ports | Keep old adapter/handler poison checks and add real Character Scenario evidence after promotion support exists |
| Model and capabilities | Chara presentation stores chat config while Agent owns effective configuration, provider/model, Skill/Tool and permission runtime; current UI does not own exact participant configuration commands | Make Agent configuration/receipts authoritative per CharacterRun/participant; role manager configures provider/model and Companion capabilities through Agent ports, Narrative freezes no Skill/Tool, and no global Character setting is consulted |
| External material | `CharacterInteractionService.prepareTurn` uses Chara-specific refs/materialization beside Agent reference/resource-grant support | Reuse Agent reference/grant/context providers; Chara only rejects Narrative and handles explicit memory/authoring candidates |
| Workbench | Context manager shows provider/model receipts, while Companion has no completed one-lane composer/material controls | Add one Character composer using standard Agent model/Skill/Tool/Approval projections; poison any native-model lane selector or Assistant identity |
| Workspace Chara use | Dialogue/validation runtime exists only under `@neko/chara/testing`; Workspace Agent has no production primitive ports or canonical capability composition | Add Agent-owned Character role primitive ports backed by narrow Chara public operations, preserve Workspace binding, return artifacts or explicit handoff refs, and poison testing-runtime/direct-provider access |
| Evaluation | Existing tests cover mode/context/persistence but not canonical Agent routing or Character tool use | Add path-level Agent routing/tool lifecycle assertions first, then real-provider repetition and visible Electron evidence before promotion |
