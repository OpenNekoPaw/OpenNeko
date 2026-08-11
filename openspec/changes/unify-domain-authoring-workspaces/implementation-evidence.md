## Decisions

- Formal World Experience launch authority is `WorldExperienceVersion`. `WorldVersion` remains the reusable World Foundation publication and is not a compatible alias for a complete experience.
- Host settings owns standalone library root configuration. Portable locators are `${NEKO_HOME}/libraries/characters` and `${NEKO_HOME}/libraries/worlds`; expanded roots remain inside the Host boundary.

## Existing Authoring Data Inventory

Read-only inspection on 2026-08-11 queried table existence and row counts only. No payload, identity, path, or secret was read or logged.

| Table            | Rows |
| ---------------- | ---: |
| `chara_projects` |    1 |
| `chara_versions` |    1 |
| `world_projects` |    0 |
| `world_versions` |    0 |

The Character rows require an explicit Chara-owned offline export/import workflow before the SQLite authoring path can be retired. The source database bytes must remain unchanged until export and canonical file import are verified. No World authoring migration is required for the inspected profile, but the old bytes/tables are still not deleted by this change.

## Authoring and Runtime Persistence Cutover

- Desktop production composition now constructs standalone Character and World file-authoring repositories at the Host-owned `${NEKO_HOME}/libraries/characters` and `${NEKO_HOME}/libraries/worlds` roots.
- Character runtime composition receives distinct conversation-launch, interaction, room, storyline, memory, relationship, presentation, avatar-authority, and runtime-catalog objects. No returned runtime object exposes Character authoring mutation methods.
- World runtime composition receives a runtime repository and runtime-only catalog separately from the file authoring repository. Starting a runtime pins its exact immutable publication into runtime persistence; the authoring repository is not used as a SQLite fallback.
- Runtime-only table initialization does not create `chara_projects`, `chara_authoring_test_snapshots`, or `world_projects`. Existing legacy tables and bytes are not deleted.
- Desktop poison tests reject imports of `createPersistentCharacterRepository`, `initializeCharacterPersistenceTables`, `createPersistentWorldRepository`, and `initializeWorldPersistenceTables` in the production composition root.

## Explicit Character Offline Transfer

The isolated `tools/offline-repair/character-authoring-transfer.ts` module owns explicit `exportCharacterAuthoringTransfer` and `importCharacterAuthoringTransfer` operations while Chara contracts remain authoritative for record validation. The module is not exported from `@neko/chara-node` or reachable from Desktop. Export reads the three preserved Character authoring tables only when explicitly invoked, retains valid siblings when one row is invalid, and atomically writes a transfer file without an internal format-version field. Import refuses conflicting existing facts, writes through the canonical file authoring repository, and never mutates or deletes the source SQLite rows.

Verification on 2026-08-11:

- `pnpm --filter @neko/chara typecheck` and `pnpm --filter @neko/chara test`: passed, 131 tests.
- `pnpm --filter @neko/chara-node typecheck` and `pnpm --filter @neko/chara-node test`: passed, 16 tests.
- `pnpm --filter @neko/world typecheck` and `pnpm --filter @neko/world test`: passed, 24 tests.
- `pnpm --filter @neko/world-node typecheck` and `pnpm --filter @neko/world-node test`: passed, 10 tests.
- Desktop typecheck reaches only the pre-existing Agent queue fixture mismatch (`paused` missing in user-edited tests); no authoring/runtime cutover diagnostic remains.

Follow-up verification after the Agent fixture was reconciled in the shared worktree:

- `pnpm --filter @neko/app-desktop typecheck`: passed.

## Project Delegation and Workflow Evidence

- The misleading `@neko/host/desktop-project-management-service` owner was deleted. Its replacement, `DesktopProjectRegistrationService`, exposes only Host catalog registration removal, exact Workspace-conversation resolution, Agent conversation cleanup delegation, and projection reads.
- A poison test proves the old service path is absent and the registration service does not import `@neko/project`, `ContentProjectComposition`, or project-composition mutations.
- Project workflow tests now cover partial commit, exact retry-link without target recreation, membership removal without fact deletion, explicit owner-only deletion, unavailable dependency publication blocking with an unaffected sibling target, and the existing unauthorized-root Node cases.

Verification on 2026-08-11:

- `pnpm --filter @neko/host exec vitest run src/desktop-project-registration-service.test.ts`: passed, 5 tests.
- `pnpm --filter @neko/project test`: passed, 12 tests.
- `pnpm --filter @neko/project-node test`: passed, 6 tests.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/app-host.test.ts`: passed, 51 tests.
- Character formal launch resolves the publication from file authority, atomically pins it with Dialogue/Run/relationship/memory records, then reopens those runtime records after the authoring root is removed.
- World formal launch pins the publication with Run/Save runtime persistence and reopens the exact aggregate after the authoring root is removed.
- `pnpm --filter @neko/chara-node test`: passed, 17 tests. `pnpm --filter @neko/world-node test`: passed, 11 tests.

## Creative Management Cutover

- Host now owns one `creative-management` Window scene with the closed `content-projects | characters | worlds` catalog selection and one `open-creative-management` typed transition.
- The old `project-management`, `character-management`, and `world-management` scene/surface/intent success paths were deleted in the same contract update. A contract poison assertion rejects an old management intent.
- Project, Character, and World are opened directly from application-sidebar intents. The Host catalog remains navigation identity, while the destination page renders no cross-domain selector.
- Renderer mounts package-owned `ProjectCatalogRoot` and `CharacterCatalogSurface` directly. World management now mounts `WorldCatalogSurface` in Main and the exact `WorldDetailSurface` in Secondary Main through the controlled Workbench split; both share one World-owned management runtime.
- The expanded sidebar projects Projects, Conversations, Characters, and Worlds. Character Dialogue and Room Conversation groups retain exact Agent navigation identities under Characters; Worlds stays visible with count zero until an exact World-owned Conversation producer exists.
- Content, Character, and World authoring all pass through `ProjectAuthoringTargetSwitchRoot`, `MainViewGroupSurface`, and the same controlled Workbench Main slot. Owner-specific Studio Roots, commands, authority validation, snapshots, and protected runtimes remain separate.

Verification on 2026-08-11:

- `pnpm --filter @neko/host exec vitest run src/desktop-scene-contract.test.ts src/desktop-shell-service.test.ts`: passed, 67 tests.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopApplication.test.tsx src/architecture-boundary.test.ts`: passed, 72 tests.
- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopShell.test.tsx src/architecture-boundary.test.ts`: passed, 56 tests.
- `pnpm --filter @neko/project-webview test`: passed, 7 tests; `pnpm --filter @neko/chara-webview test`: passed, 12 tests; `pnpm --filter @neko/world-webview test`: passed, 7 tests. All three package typechecks passed.
- `pnpm --filter @neko/app-desktop typecheck`: passed.

The sidebar regrouping changes only Desktop presentation. Agent Conversation ownership, restore/delete identities, session runtime, and provider routing are unchanged, so real Agent Evaluation is excluded for tasks 6.9-6.12; deterministic Host/Desktop navigation and projection tests are authoritative for this scope.

### Focused UI validation for tasks 6.9-6.12

- **Scope:** direct Project, Character, and World management navigation; absence of the cross-domain management selector; expanded sidebar sections; World empty catalog, toolbar, and create-detail split. This is user-visible UI work, so `neko-ui-validation` applies.
- **Runtime:** the current visible Electron development runtime was used for direct image-capable inspection. The isolated development scenario could not acquire the checkout's existing Forge bundle owner, and an independently built current packaged artifact stopped in a native startup alert before creating a BrowserWindow. Reports: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T22-55-36.697Z-domain-management-workbench-development/report.json` and `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T23-01-58.368Z-domain-management-workbench-packaged/report.json`.
- **Inventory and evidence:** normal sidebar clicks opened Project, Character, and World owner catalogs directly. Pixel inspection confirmed that none rendered the removed segmented selector, the sidebar retained Projects/Conversations/Characters/Worlds, and the World empty state exposed list/grid, sort, refresh, and create controls. Opening `New world` displayed the World-owned catalog in Main and the editable definition form in Secondary Main without writing a World record.
- **Visual findings:** the first World capture exposed a real cascade defect: the generic World form-control `width: 100%` rule compressed the catalog search control and stretched the sort control. The management selectors now override that generic form rule; a second direct image inspection confirmed a stable single-row toolbar and a coherent two-column create composition with no visible overlap or clipping at the current desktop window size.
- **Adjacent regression:** `@neko/world-webview` passed 7 tests and typecheck after the CSS correction and a lifecycle fix that prevents late World catalog responses from restoring inactive management state; focused Desktop application and architecture tests passed 72 tests. Project and Character management remained visually coherent during the same navigation sequence.
- **Result:** `blocked`. Supplementary development-runtime functional and visual evidence passed for the states above, but the authoritative isolated scenario did not complete save/detail, narrow-window, invalid/loading, or Root-unmount checks. No pass is inferred from the blocked packaged/development automation paths.

## Agent Formal Runtime First Submit

- Agent application owns one runtime Entry materialization port. An exact Character Dialogue receipt delegates to Chara before Conversation commit; request replay reuses the committed context and does not invoke Chara a second time.
- One Character reuses the exact Chara primary AgentSession identity as the Agent Conversation and binds the Dialogue/CharacterRun/optional role profile context. Multiple Characters create one Room and use one exact Room Conversation identity while participant primary sessions remain Chara-owned.
- The first message is dispatched only through `CharacterInteractionService` or `CharacterRoomConversationService`. Character/Room context validation and Scene handoff do not resolve Assistant or Authoring Workspace providers.
- Character and Room Conversations restore into the package-qualified `character-interaction` Scene after the previous Root is unloaded without sending another message or recreating a runtime.
- Complete World Experience remains owner-qualified unavailable because the canonical `WorldExperienceVersion` producer is not yet composed. The implementation does not reinterpret World Foundation `WorldVersion`, create a generic World runtime, encode a prompt handler, or fall back to Assistant/Authoring.

### Chara Entry launch discovery wiring

- Chara Foundation now projects one compact conversation launch catalog from the canonical durable catalog: every valid published CharacterVersion carries its exact CharacterProject identity, display/version labels and matching optional CharacterStorylineVersion choices. An orphan publication is excluded locally with a catalog diagnostic while valid siblings remain selectable.
- The typed Character Foundation bridge exposes that Chara-owned projection on demand. Loading failure is isolated to Character Dialogue after the mode is selected; it does not block Assistant, Authoring, the Window Shell or other Character records.
- Agent Webview configures one exact Character Dialogue target receipt whenever the selection changes. One selected Character may carry one storyline; selecting multiple Characters clears storyline configuration and produces the canonical Room launch binding. Mode switching clears the receipt and selected Character tokens while retaining unsent text and model/execution presentation.
- The Entry presenter enables submit only when the selected project/version/storyline set exactly matches the current receipt. Desktop Main still validates the publication and Chara launch selection before formal runtime materialization, so a stale catalog row fails visibly rather than becoming an Assistant/Authoring submit.
- The old Workspace/Entity roleplay discovery is not called by the Character Dialogue Entry. World Experience remains visible and owner-qualified unavailable.

Focused verification on 2026-08-11:

- `pnpm --filter @neko/chara test`: passed, 138 tests.
- `pnpm --filter @neko/agent-contracts test`: passed, 284 tests.
- `pnpm --filter @neko/agent-webview test`: passed, 747 tests.
- `pnpm --filter @neko/app-desktop test`: passed, 667 tests; the focused Character bridge, launch adapter, and Main host subset passed 72 tests.
- `pnpm --filter @neko/chara typecheck`, `pnpm --filter @neko/agent-contracts typecheck`, `pnpm --filter @neko/agent-webview build`, and `pnpm --filter @neko/app-desktop typecheck`: passed.
- `pnpm check:quality`, strict OpenSpec validation, changed-file formatting, and `git diff --check`: passed.

### Focused UI validation for Chara Entry wiring

- **Scope/applicability:** applicable to the Character Dialogue Entry mode, published-version selector, optional storyline control, selected tokens, loading/empty/error/disabled feedback, submit gating and reversible mode switching. Adjacent Assistant, Authoring, World-unavailable and shared composer presentation are in scope.
- **Runtime:** the currently visible Electron development runtime at the normal typed preload/Main/Renderer boundary was used. It is sufficient for empty-catalog lookup, mode configuration, submit gating and mode-switch presentation; its current isolated Character library contains no published CharacterVersion, so it cannot prove the normal/dense single/multi/storyline states.
- **Inventory/evidence:** selecting Character Dialogue stayed in the canonical Entry, read the Chara-owned empty catalog, displayed a Character-specific empty message and disabled send with the matching diagnostic. Entering an unsent draft, returning to Assistant and restoring the original empty draft proved text preservation and reversible mode switching without management navigation or Conversation creation. Deterministic UI tests cover loading versus empty, exact single selection, storyline display, multi-selection storyline clearing, exact receipt submit, stale receipt blocking and World-unavailable adjacency.
- **Visual findings:** direct pixel inspection of the live Character empty state found the mode selector, title/description, empty catalog card, composer diagnostic and disabled send control aligned to one content track with no visible overlap, clipping, overflow or unreadable text at the current window size. The new selector did not obscure the composer or sidebar.
- **Result:** `blocked`. The inspected empty and return states passed, but authoritative visible normal, dense, multi-Character, storyline, failure-recovery and narrow-window evidence was not produced. The live library had zero published Characters, and modifying the user's durable Character library was outside this validation authority; no component test is promoted as a substitute.
- **Residual risk:** card wrapping and storyline control layout under a dense real catalog, narrow-window interaction, actual first-submit handoff and provider-backed Dialogue/Room remain unverified in visible Electron. World Experience intentionally remains unavailable.

### Agent Entry current-mode quick actions and UI validation

- The existing four-mode segmented selector remains the only Entry mode switch. The removed Overlay is not replaced by duplicate mode buttons: the normal-flow surface below the unchanged Composer renders only operations qualified for the current mode.
- One controlled `@neko/ui` Collapsible owns the current-mode surface and defaults to expanded whenever the explicit mode has qualified content. Assistant explicitly labels its body as Skills and keeps up to four executable Agent catalog Skills inside it; Authoring mounts one direct Project/Character/World resource grid while expanded; Character Dialogue loads the Chara launch catalog after its mode is selected and locally collapses when that owner catalog is empty or unavailable; World Experience omits the component while no qualified owner operation exists.
- Assistant Skills, Authoring entry operations, exact Project/Character/World candidates, and Character Dialogue choices share one responsive card grid. Every card has a stable media/title/metadata/action structure. Current owner contracts do not expose authorized thumbnails, so the live implementation uses neutral type icons and never infers a raw path or synthetic image.
- Authoring exposes Host directory authorization only in the Composer toolbar. Exact selectable Content Project, standalone Character, and standalone World targets are rendered directly as peer cards in the only Authoring grid; category buttons, their second candidate layer, project-local expansion layer, and the Entry creation form are absent. New target creation remains with the owning management/Workbench flow. Character Dialogue separates single-Character selection from new multi-Character Room configuration; Room participants remain local and submission stays blocked until at least two exact Character versions are selected. Existing Room selection is not fabricated because Chara does not yet expose the durable Room catalog required by task 7.11.
- The Entry renders one centered 28px mode title aligned with the Codex Entry hierarchy and no explanatory subtitle. Its four-mode selector uses compact 24px controls within a 480px track and the adjacent 12px interface type scale. Canonical validation still disables send, but prerequisite, empty Character library, and unavailable World diagnostics are no longer repeated as visible Composer or Entry prose. An empty Chara catalog closes and disables its local trigger without creating a Conversation, Room, runtime, navigation change, or synthetic target.
- The Composer keeps its existing shell, width, input row and model/execution controls; Authoring adds only the directory authorization action to its toolbar. One Entry-only normal-flow wrapper centers the title, Composer, and current-mode component as a group with safe overflow behavior. The component follows the Composer, wraps and grows without width breakpoints, and never creates a right Overlay, drawer, backdrop, or reserved side column. Collapsing, resizing, switching mode, and leaving Entry unmount the body without clearing Draft text or exact receipts.
- Deterministic tests cover default and controlled expansion, semantic card structure, catalog-qualified Skills, owner-body lazy mounting, separate action routing, project-local child loading, World omission, title-only Entry copy, minimal blocked Composer, exact Character target launch, reversible mode switching, and removal after materialization. The Desktop scenario now asserts default-expanded accessibility state, responsive card containment, collapse/reopen behavior, no visible validation copy, and unchanged Composer geometry.
- **Visible UI result:** `passed`. Direct image-capable inspection of the current Electron development runtime confirmed the default-expanded Assistant Skills grid and single-level Authoring resource grid. The final Authoring state displayed `打开目录` in the Composer toolbar and the exact Blame、灯神、neko-test Project cards directly below it. Accessibility and pixel inspection confirmed that the former Project/Character/World category buttons, `选择项目` second layer, and `新建创作目标` Entry form were absent. Authoring catalog loading no longer inserts `正在读取创作目标…` or another transient status row; a deterministic unresolved-catalog test preserves the existing direct Project cards, while real failures remain explicit diagnostics. The title, Composer, and expanded mode component remain vertically centered as one group, without overlap, clipping, horizontal overflow, or duplicated explanatory copy at the current wide desktop size.
- The shared `@neko/ui` segmented-control thumb now divides only the track width remaining after its two-pixel horizontal insets. Direct Electron inspection confirmed intact rounded boundaries for the first Assistant and final World Experience selections at the application minimum width; the Composer and quick-action flow remained unchanged.
- The isolated `desktop-agent-entry-workspace-skill` rerun was infrastructure-blocked because a user-owned development process already owned the checkout's Forge/Vite bundle; it was not terminated. Failure evidence: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-11T10-43-36.112Z-desktop-agent-entry-workspace-skill-development/report.json`. The earlier isolated scenario remains evidence for the canonical target/submit/materialization path, while the current live runtime and deterministic tests are authoritative for the final presentation revision.
- Agent Webview passed 755 tests and typecheck/build; Desktop passed 668 tests. `node --check` passed for the updated Desktop functional scenario. Strict OpenSpec validation, `pnpm check:quality`, `pnpm check`, and `git diff --check` passed after the final Room-selection correction.
- **Residual risk:** dense real Character catalogs and real provider-backed Dialogue/Room remain covered only by deterministic tests or the earlier explicit UI-validation gap; task 7.11 and World task 7.12 remain open.

#### Aggregate Authoring resource catalog follow-up

- Authoring Entry now requests one read-only aggregate Project authoring catalog when its default-expanded body mounts. Desktop Main resolves every registered, available Project through its exact stored Workspace identity and delegates navigation projection to the canonical Project authoring service. Renderer receives only Workspace/Project identities and owner-qualified navigation refs; it does not receive a raw path or mint a writable Draft binding for unselected resources.
- The aggregate includes all Content Project cards, every available project-local CharacterProject and WorldProject, and standalone CharacterProject/WorldProject cards in the same flat resource grid. The obsolete `loadProjectAuthoringCatalog` Webview contract and `onLoadProjectAuthoringTargets` Desktop callback were deleted, so a Project card cannot act as a second candidate-menu trigger. Selecting a final resource card remains the only operation that obtains its exact Workspace grant and configures the Draft target.
- Main isolates each Project catalog read with `Promise.allSettled`; Renderer independently isolates Character, World, and Project owner reads. A failed Project or owner contributes an explicit local diagnostic while already qualified sibling cards remain available. Tests poison one Project read and prove another Project's Content, Character, and World navigation refs still return together.
- Deterministic UI evidence renders one Content Project, one Character, and one project-local World simultaneously and verifies all three resource kinds share the single grid without category buttons or an Entry creation form. Agent Webview passed 755 tests; the focused Desktop set passed 166 tests and the full Desktop package passed 670 tests. Project tests passed 22 tests; Desktop, Agent Webview, and Project typechecks passed. Strict OpenSpec validation, `pnpm check:quality`, and `git diff --check` passed.
- **Focused visible UI result:** `blocked` for the complete mixed-resource claim. The running Electron development instance was not restarted across the Main/preload contract change and its current visible catalogs contain three Content Projects, zero standalone Characters, and zero standalone Worlds. Direct functional and pixel inspection did confirm that Authoring stays default-expanded, renders no second menu, preserves all three Project cards after selecting and clearing Blame, and leaves the Composer geometry unchanged. No durable Character/World data was created for validation, so the real mixed Project/Character/World state is not claimed as visually passed.

Verification on 2026-08-11:

- `pnpm --filter @neko/agent-runtime test`: passed, 1163 tests.
- `pnpm --filter @neko/chara test`: passed, 138 tests.
- `pnpm --filter @neko/host test`: passed, 309 tests before the final restore assertion addition; focused Host rerun is recorded with the final task verification.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/app-host.test.ts`: passed, 58 tests.
- A full Desktop run exposed two stale tests that still expected Character/Room restore to be unavailable; both were updated to assert the canonical restored Scene and no message dispatch. No production fallback was added.
