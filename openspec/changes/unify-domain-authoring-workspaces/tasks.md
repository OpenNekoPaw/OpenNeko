## 1. Contract and data decisions

- [ ] 1.1 Reconcile `add-home-experience-entry-modes`, `compose-desktop-workbench-scenes`, `unify-agent-launch-and-domain-bindings`, and active Character/World changes with this change so one canonical intent, scene, target, and runtime contract remains.
- [x] 1.2 Freeze the World-owned publication identity consumed by formal World Experience launch, update this change's specs to that single name if needed, and add a poison assertion forbidding a `WorldVersion`/`WorldExperienceVersion` compatibility dispatch.
- [x] 1.3 Decide and document the owner and configured `${VAR}/...` location for standalone Character and World library roots while keeping raw roots out of renderer and domain facts.
- [x] 1.4 Inventory existing `chara_projects`, `chara_versions`, `world_projects`, and `world_versions` SQLite records without logging payloads; record whether an explicit offline export/import workflow is required before product cutover.
- [x] 1.5 Update `quality/package-roles.json`, workspace manifests, package boundary fixtures, and architecture ownership docs for `@neko/project`, `@neko/project-node`, and `@neko/project-webview` before adding production imports.

## 2. Project composition owner

- [x] 2.1 Scaffold `@neko/project` with explicit `contracts`, `application`, and `testing` public entries and strict TypeScript settings, without Electron, React, local-metadata, or direct package-internal imports.
- [x] 2.2 Implement branded Project composition identities and the canonical codec for project-local Character/World memberships and exact external publication refs, with no internal version field or embedded domain payload.
- [x] 2.3 Implement the host-neutral Project composition command service for add/remove local membership, bind/unbind immutable dependency, reference checks, and owner-qualified diagnostics.
- [x] 2.4 Implement Project catalog and target-tree projections that retain exact refs and expose invalid/unlinked entries without becoming a second fact source.
- [x] 2.5 Add Project producer tests for canonical encode/decode, identity mismatch, duplicate refs, immutable dependency binding, invalid sibling isolation, and absence of latest/name/active target resolution.
- [x] 2.6 Scaffold `@neko/project-node` and implement the single atomic `neko/project-composition.json` repository with workspace containment, symlink-escape rejection, temp-file replacement, and local decode diagnostics.
- [x] 2.7 Add Project Node tests for exact relative paths, interrupted writes, conflicting immutable refs, malformed single records, unauthorized roots, and no SQLite/cache/raw-path alternate success path.
- [x] 2.8 Move Project business mutations and catalog decisions out of `@neko/host/desktop-project-management-service`, leaving Host with registration, grant, scene, and projection attachment only; add delegation tests and delete/poison proof for the old owner.

## 3. Character authoring storage

- [x] 3.1 Split Chara authoring, runtime/interaction, memory/relationship, presentation, and durable catalog repository ports so production composition cannot satisfy them through one mixed repository object.
- [x] 3.2 Implement the canonical file-backed Character authoring repository at `neko/characters/<characterProjectId>/` for CharacterProject, immutable CharacterVersion, and authoring-test snapshots.
- [x] 3.3 Implement one Chara authoring service path for standalone and project-local placement, differing only by the exact authorized root and catalog scope.
- [x] 3.4 Implement Character library and Project-scoped catalog projections with invalid-record and unlinked-membership diagnostics; prove project-local records never enter the standalone catalog.
- [x] 3.5 Preserve Character Dialogue/Room/Run, memory, relationship, and presentation persistence under runtime-specific repositories and verify authoring Root unload does not release protected runtime ownership.
- [x] 3.6 Add Chara producer tests for atomic mutable writes, immutable publication conflicts, root mismatch, malformed sibling isolation, authoring-test versus formal runtime separation, and identical standalone/project-local service behavior.
- [x] 3.7 Remove production reads/writes of `chara_projects` and `chara_versions` from the normal authoring path and add poison tests proving file failure never reads SQLite, a global copy, cache, or active Workspace.
- [x] 3.8 If task 1.4 finds qualified user data, implement and test the explicitly invoked owner-owned offline Character export/import workflow; otherwise record why preserved SQLite bytes require no product migration.

## 4. World authoring storage

- [x] 4.1 Split World authoring/publication and Run/Save repository ports so production composition cannot satisfy authoring and runtime through one mixed repository object.
- [x] 4.2 Implement the canonical file-backed World authoring repository at `neko/worlds/<worldProjectId>/` for WorldProject and the single eligible immutable publication shape.
- [x] 4.3 Implement one World authoring service path for standalone and project-local placement, differing only by the exact authorized root and catalog scope.
- [x] 4.4 Implement World library and Project-scoped catalog projections with invalid-record and unlinked-membership diagnostics; prove project-local records never enter the standalone catalog.
- [x] 4.5 Preserve WorldRun/WorldSave persistence under the runtime-specific repository and verify authoring Root unload or Workspace navigation does not cancel, redirect, or transfer a run.
- [x] 4.6 Add World producer tests for atomic mutable writes, immutable publication conflicts, root mismatch, malformed sibling isolation, deterministic preview versus formal runtime separation, and identical standalone/project-local service behavior.
- [x] 4.7 Remove production reads/writes of `world_projects` and `world_versions` from the normal authoring path and add poison tests proving file failure never reads SQLite, a global copy, cache, latest publication, or active Workspace.
- [x] 4.8 If task 1.4 finds qualified user data, implement and test the explicitly invoked owner-owned offline World export/import workflow; otherwise record why preserved SQLite bytes require no product migration.

## 5. Project-local workflows and dependencies

- [x] 5.1 Compose the Project-local Character creation workflow so Chara creates the exact file target, Project commits membership, and a binding is returned only after both durable commits succeed.
- [x] 5.2 Compose the equivalent Project-local World creation workflow through the World owner.
- [x] 5.3 Implement fail-visible unlinked-target handling for a domain commit followed by composition failure, with exact retry-link and explicit owning-domain delete actions but no automatic deletion or repair.
- [x] 5.4 Implement exact immutable Character and World publication dependency binding plus source-Studio handoff, and block affected publication when a dependency is missing without selecting latest or copying facts.
- [x] 5.5 Add workflow tests for partial commit, retry-link, membership removal without fact deletion, source deletion/reference checks, inaccessible roots, and unaffected sibling Project/target behavior.

## 6. Creative Management and Authoring Workbench

- [x] 6.1 Add a Host-owned `creative-management` scene with the closed `content-projects | characters | worlds` visible catalog selection and typed transitions; remove separate successful Character/World/Project management scene paths in the same boundary update.
- [x] 6.2 Scaffold `@neko/project-webview` and move Project catalog presentation out of `apps/neko-desktop`, consuming only `@neko/project` projection and a typed Desktop host port.
- [x] 6.3 Compose the shared Creative Management shell from package-neutral `@neko/ui` controls and package-owned Project/Chara/World catalog Roots, with owner-specific commands and no generic mutable item DTO or combined destructive action.
- [x] 6.4 Extend Project Workspace navigation to show Content, project-local Character, project-local World, and external dependency refs while retaining only exact navigation identities and minimal package-owned presentation snapshots.
- [x] 6.5 Extend the closed Workbench surface union and slot projector for exact Content/Character/World authoring targets and owner-provided tools; reject unknown/mismatched surfaces locally.
- [x] 6.6 Implement target switching as outgoing snapshot commit, Root unload, incoming authority validation, and incoming Root mount; add React lifecycle assertions proving no hidden Root, subscription, provider, media handle, or runtime is retained as visit history.
- [x] 6.7 Add Desktop consumer/delegation tests proving Renderer maps only public Roots, Desktop does not inspect domain files or mutate facts, and missing one owner/record/Root leaves sibling catalogs, Project tree, Window Shell, and background runtimes usable.
- [x] 6.8 Add responsive UI tests for catalog switching, invalid rows, create/open/edit-versus-run actions, compact Workbench target navigation, keyboard/focus behavior, and no text/control overlap at desktop and narrow-window sizes.
- [x] 6.9 Remove the visible cross-domain management segmented control and route Project, Character, and World directly from the application sidebar while retaining one typed Host scene contract.
- [x] 6.10 Split World management into a package-owned list/grid catalog Surface and exact configuration/detail Surface composed through controlled Workbench Main and Secondary Main slots.
- [x] 6.11 Verify Content, Character, and World authoring use the same controlled Workbench geometry while retaining owner-specific components, commands, snapshots, and runtime boundaries.
- [x] 6.12 Project expanded application-sidebar sections for Projects, Conversations, Characters, and Worlds; group Character Dialogue/Room conversations exactly and keep Worlds empty until an exact World Conversation owner exists.

## 7. Agent Entry and target routing

- [x] 7.1 Replace the Agent launch mode contract with `assistant | authoring | character-dialogue | world-experience` and separate mutable authoring bindings from eligible publication/runtime launch bindings.
- [x] 7.2 Implement owner-qualified Authoring target providers for Content Project, standalone/project-local CharacterProject, and standalone/project-local WorldProject using exact Workspace grants and target receipts.
- [x] 7.3 Implement mode-switch cleanup so incompatible receipts, results, and pending queries are invalidated while valid unsent text and model presentation remain, with stale/cross-Draft/cross-sender receipts rejected locally.
- [x] 7.4 Update Agent Webview Entry UI to show the four intent-qualified modes only in the canonical Draft and configure targets in-place without management navigation or runtime materialization.
- [x] 7.5 Route every Agent authoring mutation through the exact owner application service and add tests proving prompt text, mentions, mounted Surface, selected row, and current/recent Project cannot grant or infer write authority.
- [x] 7.6 Preserve Character Dialogue/Room and World Experience first-submit transactions from exact eligible publications, blocking unavailable owners without Assistant/Authoring fallback or prompt-encoded special handlers.
- [x] 7.7 Delete old Workspace/Character/World label aliases, special text launch handlers, duplicate submit routes, active-target inference, and legacy provider registrations; add architecture poison tests for their absence.
- [ ] 7.8 Add Agent contract producer tests, runtime provider tests, Webview consumer tests, and Desktop delegation tests covering all four modes, mode switches, provider unavailability, local failures, and formal runtime materialization.

## 8. Composition, documentation, and static quality

- [ ] 8.1 Wire the new Project, Chara file-authoring, World file-authoring, runtime-specific, catalog, Agent provider, and package Root public entries in Desktop Main/preload/renderer without app-owned business DTOs or direct `packages/**/src` imports.
- [ ] 8.2 Update storage-authority, package-boundary, application-boundary, product-status, no-internal-versioning, offline-repair-reachability, and no-multipath checks for the new canonical owners and removed paths.
- [ ] 8.3 Update Chinese domain and architecture docs for Authoring Workspace, Project composition, management/authoring/runtime separation, file layout, package ownership, and user-data recovery; update English docs where entry terminology changes.
- [ ] 8.4 Run formatting and artifact checks: `pnpm exec prettier --check openspec/changes/unify-domain-authoring-workspaces docs packages apps/neko-desktop`, `pnpm check:openspec`, and `git diff --check`; fix all failures within change scope.
- [ ] 8.5 Run package tests and typechecks: `pnpm --filter @neko/project test`, `pnpm --filter @neko/project-node test`, `pnpm --filter @neko/project-webview test`, `pnpm --filter @neko/chara test`, `pnpm --filter @neko/chara-node test`, `pnpm --filter @neko/chara-webview test`, `pnpm --filter @neko/world test`, `pnpm --filter @neko/world-node test`, and `pnpm --filter @neko/world-webview test`.
- [ ] 8.6 Run Agent/Host/Desktop verification: `pnpm --filter @neko/agent-contracts test`, `pnpm --filter @neko/agent-runtime test`, `pnpm --filter @neko/agent-webview test`, `pnpm --filter @neko/host test`, `pnpm --filter @neko/app-desktop test`, and all affected package typechecks.
- [ ] 8.7 Run repository gates `pnpm check:quality`, `pnpm check`, and `pnpm gate:local`; record any unrelated pre-existing failures separately and do not mark affected failures complete.

## 9. Runtime, UI, and Agent acceptance

- [ ] 9.1 Use the authoritative packaged/development Electron runtime to verify direct Project, Character, and World sidebar navigation opens only the selected owner catalog, invalid records remain locally visible, and leaving a manager unmounts its package Root.
- [ ] 9.2 Verify in one real Project Workspace that Content, a project-local Character, and a project-local World can be created and alternated; confirm files land only in canonical relative paths and standalone catalogs do not acquire local records.
- [ ] 9.3 Verify standalone Character/World authoring uses the same Studio/service/publication behavior as project-local targets, and external publication refs remain read-only with explicit source handoff.
- [ ] 9.4 Verify authoring tests/previews do not create formal runtimes, while published Character Dialogue/Room and World Experience create exact runtimes that continue after Studio/Workspace Root unload.
- [ ] 9.5 Execute the `neko-ui-validation` acceptance inventory for direct sidebar navigation, Project/Character/World management, World list/grid + detail, Entry, Studio, shared authoring Workbench, empty, invalid, loading, unavailable, dense, and narrow-window states; inspect current screenshots with an image-capable Agent and report adjacent regressions.
- [ ] 9.6 Add or update declarative Agent Evaluation scenarios for the four Entry intents, exact authoring target mutation, cross-target denial, provider unavailability, and published runtime launch; run key-free harness readiness without treating it as behavior evidence.
- [ ] 9.7 With explicit provider/model/cost authorization and `~/.neko/config.toml`, run visible real Electron UI Agent acceptance and the affected hidden full-Desktop real-API matrix; record final response, terminal state, exact Conversation/Workspace/target/runtime identities, isolation, reopen behavior, and all unexecuted baseline cases.
- [ ] 9.8 Package the Desktop with `pnpm package:desktop`, repeat the critical create/switch/publish/run flows from the packaged app, and record platform-specific blockers.
- [ ] 9.9 Complete `neko-quality-review`, listing canonical owner/path evidence, deleted/poisoned paths, verification commands/results, user-data handling, unexecuted checks, and residual risks before marking the change implementation complete.
