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

Verification on 2026-08-11:

- `pnpm --filter @neko/agent-runtime test`: passed, 1163 tests.
- `pnpm --filter @neko/chara test`: passed, 138 tests.
- `pnpm --filter @neko/host test`: passed, 309 tests before the final restore assertion addition; focused Host rerun is recorded with the final task verification.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/app-host.test.ts`: passed, 58 tests.
- A full Desktop run exposed two stale tests that still expected Character/Room restore to be unavailable; both were updated to assert the canonical restored Scene and no message dispatch. No production fallback was added.
