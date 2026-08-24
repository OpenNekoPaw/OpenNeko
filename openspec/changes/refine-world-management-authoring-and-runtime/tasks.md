## 1. Reconcile active World scope and canonical paths

- [x] 1.1 Audit and close the unimplemented overlapping Foundation and future gated World proposals, reconcile `define-ai-native-interactive-world` and `unify-domain-authoring-workspaces`, and keep this change as the only production first-closure path while the roadmap retains future promotion criteria.
- [x] 1.2 Freeze one canonical production identity chain `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch`; add OpenSpec/contract poison assertions forbidding `WorldVersion`/`WorldExperienceVersion` compatibility dispatch, Foundation versus Experience dual registration, latest/active identity fallback and complete WorldExperience availability from a Foundation Run.
- [x] 1.3 Inventory every production producer/consumer of `WorldFoundationSnapshot`, `WorldFoundationCommand`, `WorldFoundationCommandService`, `OpenNekoDesktopWorldBridge`, `WorldFoundationRoot`, `WorldDetailSurface`, `createWorldDurableCatalogPort` and `world-preview-run-create`; record the exact replacement or justified non-product consumer before implementation.
- [x] 1.4 Record current WorldProject/WorldVersion/WorldRun/WorldSave/branch storage and catalog counts without logging payloads; confirm this change requires no data rewrite and define fail-visible handling for preserved invalid records.

## 2. Split World management contracts and application projection

- [x] 2.1 Define strict version-free World management catalog/detail/action projection contracts in `@neko/world/contracts`, including exact identity, placement, lifecycle, usable-version summaries, runtime eligibility/summary and owner diagnostics without mutable definitions, event/state/save payloads or generic mutation DTOs.
- [x] 2.2 Implement `@neko/world/application` management projection service over the narrow authoring/runtime catalog ports and reference validators; add producer tests for standalone/project-local scopes, deterministic sorting/search inputs, bounded runtime summaries and malformed sibling isolation.
- [x] 2.3 Define dedicated create/manual-create/import/export handoff results and exact Edit/Run target receipts; add tests that management cannot infer active/current Workspace, latest version, first-compatible target or formal runtime from selection.
- [x] 2.4 Replace or delete `createWorldDurableCatalogPort` if it has no justified internal consumer; add poison tests proving production management cannot receive the broad projects+versions+runtimes snapshot or execute `WorldFoundationCommand`.

## 3. Rebuild World Management presentation

- [x] 3.1 Split `@neko/world-webview` into package-owned World Management Catalog and Detail Roots consuming only the new management contracts; remove Studio, runtime preview, event, Save and branch mutations from detail.
- [x] 3.2 Implement the responsive card-only catalog, canonical empty/loading/error states, search/sort and fail-local invalid cards; delete list/grid mode state and add Webview tests proving one catalog Root and no fabricated active World.
- [x] 3.3 Implement one continuous detail surface with dividers for identity, lifecycle, versions, references, bounded runtime summary and actions; remove nested floating section cards and add wide/narrow layout tests for reachable top/bottom content and one scroll owner.
- [x] 3.4 Add consumer/delegation tests proving Create/Import/Export invoke only dedicated World services and Edit/Run emit exact Host transitions without mutating World facts or retaining hidden management Roots.

## 4. Converge directory World authoring and preview

- [x] 4.1 Atomically replace the World authoring binding with one strict exact Workspace/grant/WorldProject/placement shape that represents standalone-library and content-project authority without fabricated `contentProjectId`; update every producer, consumer, fixture and codec test in the same boundary change.
- [x] 4.2 Verify standalone and project-local authoring use the same `WorldAuthoringService`, codec, `WorldAuthoringFileRepository`, publication path and `WorldAuthoringStudioRoot`; add producer tests for root mismatch, membership mismatch, malformed sibling isolation and no SQLite/global/cache/active-Workspace fallback.
- [x] 4.3 Implement a World-owned deterministic authoring preview service that reuses only pure validation/reducer primitives and produces no runtime repository writes; add tests proving preview cannot create WorldRun, WorldSave, branch, event, recent-run or Agent records.
- [x] 4.4 Remove `world-preview-run-create` from authoring/management contracts and consumers; add deletion/poison tests proving preview flags, caller-based persistence branches and fallback to formal `WorldRuntimeService.createRun` do not exist.
- [x] 4.5 Compose World authoring only in Workspace Secondary Main while preserving the exact Primary Main Board or canonical fresh empty presentation; add Host, Desktop renderer and reload tests for open, close, switch, narrow layout and invalid authority without hidden Root retention.

## 5. Add `.neko-world` portable transport

- [x] 5.1 Define the strict World-owned portable manifest, export selection, dependency/resource inventory, import preview and result contracts with no internal format version and no Run/Save/branch/event/Agent/runtime members.
- [x] 5.2 Implement `@neko/world/application` export planning and import validation/commit orchestration over exact authoring records, explicit owner dependency classification, exact destination authority and atomic no-conflict writes.
- [x] 5.3 Implement `@neko/world-node` ZIP adapter with containment, entry-count, compressed/expanded-size, duplicate-path, symlink, normalization, digest and canonical-codec checks plus bounded cancellation/resource release.
- [x] 5.4 Add archive producer tests for selected WorldVersions, external Character/Entity/Asset/Content dependencies, explicitly authorized embedded resources, stable relative paths and exclusion of secrets/raw paths/runtime records.
- [x] 5.5 Add hostile import and destination tests for traversal, archive bombs, duplicate paths, malformed records, identity/path conflicts, overwrite/merge/rename/remap rejection, standalone versus project-local placement, cancellation and zero partial writes.
- [x] 5.6 Wire native source/destination chooser and sender-bound grants through thin Desktop adapters; add IPC delegation/fail-closed tests proving Desktop contains no package policy and archive invalidation affects only that operation.

## 6. Add `world-creator` and typed quick-generation handoff

- [x] 6.1 Create `packages/skills/skills/world-creator/SKILL.md` and metadata/catalog registration describing evidence-aware World creation methodology, review output and forbidden publish/run side effects without tool/host/path protocol prose.
- [x] 6.2 Add Skill boundary and catalog tests proving the builtin Skill is discoverable, ordinary rather than a product controller, and contains no runtime tool protocol or package authoring lifecycle instructions.
- [x] 6.3 Implement World Management quick-generation typed handoff to canonical Agent Entry/Composer with explicit standalone/project-local destination selection, exact fresh WorldProject creation and operation-level World write receipt.
- [x] 6.4 Add producer/consumer tests for fresh-target isolation, target mismatch, project membership, cancellation before authorization, rejected candidates, no second Composer/provider/model path and no automatic WorldVersion/preview/Run/Save/Conversation side effects.
- [x] 6.5 Add `skill.world-creator` Agent Evaluation suite, coverage index and cases for authoring-versus-runtime intent, evidence/inference separation, unresolved conflicts, placeholder external references, unsupported capability rejection and exact target isolation.

## 7. Add deterministic World Runtime contracts and service path

- [x] 7.1 Define strict World runtime launch/continue/binding/snapshot/intent Host contracts for exact WorldVersion, WorldRun, WorldSave, branch and participant-scoped view identities without active/recent/latest fallback or complete Experience fields.
- [x] 7.2 Reuse and narrow the canonical `WorldRuntimeService` and runtime-specific repository for formal create/continue/action/event/state/view/save/branch operations; add producer tests for exact eligibility, replay, stale intent, branch mismatch, malformed Save isolation and AI-provider independence.
- [x] 7.3 Add World runtime application projections for bounded status, available actions, participants/locations, event/checkpoint/branch timeline and diagnostics without exposing repository payloads or Renderer-owned facts.
- [x] 7.4 Add poison tests proving Management, Studio, Agent, presentation profiles and external engines cannot append events, mutate WorldState, choose another Save/source or report semantic success before the World owner commits.

## 8. Compose the World Runtime Workbench and Desktop scene

- [x] 8.1 Implement a package-owned `@neko/world-webview` Runtime Root that renders authoritative WorldView/status/timeline projections and submits exact typed intents; add Webview tests for loading, reload/reattach, stale binding, visible errors and no local fact reducer.
- [x] 8.2 Add one Host-owned World Runtime scene composition with fixed World-owned Main, interaction, right-manager, bottom-timeline and status surfaces; reject unknown/mismatched surfaces locally without a dynamic panel registry or Content Cut authority.
- [x] 8.3 Wire sender-bound runtime launch/continue/intent IPC and Desktop scene transitions through package public ports; add delegation tests proving `apps/neko-desktop` owns only authorization, bridge and visible slot composition.
- [x] 8.4 Add lifecycle tests proving leaving Runtime unmounts Renderer/subscriptions and releases unprotected resources while durable Run/Save/branch and exact protected background operations remain unchanged and never rebind to the next Workspace.
- [x] 8.5 Add product capability tests and copy proving the surface is deterministic Foundation runtime, works without AI providers and leaves Story, Gameplay, complete Experience, Agent Play and realtime generation owner-qualified unavailable.

## 9. Delete the mixed Foundation product path

- [x] 9.1 Atomically switch management, authoring, runtime, preload, Host scene, Desktop renderer, fixtures and tests to the narrow public entries, then delete production registration and value consumption of `OpenNekoDesktopWorldBridge.worldFoundation`, `WorldManagementRuntime.execute`, `WorldFoundationRoot` mixed detail and catch-all command IPC.
- [x] 9.2 Delete or narrow `WorldFoundationCommandService` so no production caller can combine authoring, runtime, transformation and branch commands; add source/registration poison tests for the replaced bridge, handler, Root and `world-preview-*` operations.
- [x] 9.3 Add end-to-end failure isolation tests proving one invalid World record, archive, Workspace binding, runtime intent or Save cannot fail Desktop startup, clear sibling catalogs, replace Workspace Primary Main, disable unrelated capabilities or activate an old adapter.
- [x] 9.4 Run `pnpm check:unused`, inspect all remaining Foundation symbols and document any retained host-neutral domain primitive with its exact non-product consumer; remove unused CSS, exports, fixtures and compatibility aliases.

## 10. Verification, UI evidence and completion review

- [x] 10.1 Run focused package gates: `pnpm --filter @neko/world test && pnpm --filter @neko/world typecheck && pnpm --filter @neko/world-node test && pnpm --filter @neko/world-node typecheck && pnpm --filter @neko/world-webview test && pnpm --filter @neko/world-webview typecheck && pnpm --filter @neko/host test && pnpm --filter @neko/app-desktop test && pnpm --filter @neko/app-desktop typecheck`.
- [ ] 10.2 Run architecture/spec gates: `pnpm check:no-internal-versioning && pnpm check:application-boundaries && pnpm check:agent-boundaries && pnpm check:webview-boundaries && pnpm check:storage-authorities && pnpm check:package-boundaries && pnpm check:unused && pnpm check:openspec`.
- [ ] 10.3 Run key-free Agent Evaluation readiness with `pnpm test:agent:eval`, then explicitly run the authorized real-provider focused suite with `pnpm test:local:api -- --mode focused --suite skill.world-creator`; record provider/model, visible/hidden evidence, outcomes and any unexecuted cases without treating dry-run as behavior proof.
- [ ] 10.4 Use the repository `neko-ui-validation` workflow and authoritative visible Electron runtime (`pnpm test:local:ui` or its accepted focused fixture) to verify installed World card management, continuous detail, non-fullscreen/narrow layout, Project-bound authoring composition, install/import/adaptation previews, recovery diagnostics, and Runtime Workbench interaction/reload/exit; retain screenshot evidence and fail-visible diagnostics.
- [ ] 10.5 Run `pnpm gate:local`, review canonical-path evidence for old Foundation deletion and sibling isolation, then update implementation/evaluation evidence with exact commands, results and residual risks including any unqualified advanced World capabilities or unexecuted real Electron/provider cases.
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Completed standalone/quick-generation tasks are historical evidence. Unchecked acceptance work MUST exclude those retired success paths and defer installed-library, Project-only creation, adaptation, and recovery behavior to the successor.
