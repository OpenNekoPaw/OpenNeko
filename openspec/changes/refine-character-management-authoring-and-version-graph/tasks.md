## 1. Contract and adjacent-change alignment

- [x] 1.1 Reconcile this change with `unify-domain-authoring-workspaces`, `separate-companion-and-narrative-character-conversations` and `unify-skill-creator-authoring-targets`; record the canonical owner/contract/handler for directory grants, Character Creator, Studio target, CharacterVersion launch and remove or supersede every duplicate active task.
- [x] 1.2 Inventory current CharacterProject/CharacterVersion file records and exact consumers without logging user payloads; document counts of missing lineage, existing references and the user-data qualification required before contract changes.
- [x] 1.3 Resolve the first-phase multiple-parent rule from design Open Questions: either reject multiple parents everywhere until an explicit merge workflow exists or add that explicit bounded workflow and tests; do not accept write-only merge data with no consumer.
- [x] 1.4 Freeze canonical public contract names for Character management detail, Workspace Character authoring capability/surface, quick-create handoff, local usable-version presentation, draft basis, lineage relation/aggregate, graph projection, comparison and reference inventory and portable package manifest/preview without internal schema/version fields or an independent Studio controller contract.
- [x] 1.5 Inventory current Character metadata, representation refs, Storyline storage, authoring-test records and Asset/Host ownership; freeze one canonical Workspace directory layout plus an explicit `.neko-character` transport layout without duplicating facts in manifest or adopting ZIP as a live repository.

## 2. Character lineage contracts and persistence

- [x] 2.1 Add strict `CharacterVersionLineage` and relation codecs under `@neko/chara/contracts`, including exact CharacterProject ownership, unique child relation, unique parents, no self-parent/cycle acceptance and stable unlinked/root semantics.
- [x] 2.2 Extend CharacterProject with the stable optional draft-basis domain semantic, where absence permanently means unbased and never selects an old codec/compatibility path; update all canonical producers, consumers and fixtures atomically.
- [x] 2.3 Add producer/codec tests for root, branch, head derivation input, invalid cross-project refs, duplicate/cyclic relationships, unbased/derived drafts, user CharacterVersion identities and absence of internal contract generation.
- [x] 2.4 Extend `@neko/chara-node` with the single relative `neko/characters/<characterProjectId>/lineage.json` repository path, atomic single-record writes, containment/symlink checks and record-local diagnostics; missing record means no declared lineage while corrupt bytes fail visibly.
- [x] 2.5 Add Chara Node tests for standalone/project-local identical behavior, missing/corrupt lineage, interrupted writes, invalid sibling isolation, exact relative paths and no SQLite/cache/active-root/chronological fallback.
- [x] 2.6 Add explicit partial-commit result/diagnostic and retry-link behavior for immutable CharacterVersion stored successfully but lineage relation write failed; prove the version remains usable/unlinked and no automatic repair, deletion or forged edge occurs.

## 3. Portable Character package

- [x] 3.1 Add strict Chara-owned portable manifest and inventory codecs for one entry CharacterProject, included CharacterVersion/Storyline identities, embedded assets, external opaque dependencies, byte lengths and integrity digests; prohibit internal schema/format generations, raw paths, secrets and duplicate Character content in manifest.
- [x] 3.2 Extend the canonical Chara directory repository for owner-qualified Storyline records and explicitly localized Character-owned asset copies plus exact opaque-ref/representation-to-entry/file bindings while preserving identical standalone/project-local relative layout; do not infer bindings from file presence, retain ZIP manifest state, move or rewrite valid existing user records implicitly.
- [x] 3.3 Implement a bounded `@neko/chara-node` ZIP writer that exports only the explicitly selected record scope and authorized embedded assets, emits deterministic safe relative entries, preserves lineage branches/exact refs and reports unresolved external dependencies instead of silently copying them.
- [x] 3.4 Implement a bounded untrusted ZIP reader that rejects path traversal, absolute/duplicate entries, symlinks, undeclared bytes, entry or expanded-size excess, codec/identity mismatch and digest failure before any authoritative write.
- [x] 3.5 Implement Chara application export/import preview and commit workflows with exact source/destination grants, embedded/external dependency inventory and identity-conflict diagnostics; imports install bytes plus canonical localized-asset bindings through the Workspace repository, release archive resources after completion/cancellation and never execute in place, retain a ZIP-derived binding/mount/watcher/sync task, overwrite, auto-merge, silently remap or infer active/recent Workspace.
- [x] 3.6 Add contract/application/Node tests for self-contained Live2D trees, unembedded VRM/voice dependencies, multi-branch lineage, Storyline refs, large/invalid archives, zip-slip/symlink/duplicate cases, immutable identity conflicts, interrupted writes, sibling isolation and absence of runtime/config/credential bytes.
- [x] 3.7 Add poison scans proving `.neko-character` does not become a Character runtime/repository authority, durable package identity, mount, watcher, recent-package binding or synchronization source; prove exported packages contain no Conversation, Room, Companion memory, narrative run, provider/model selection, Skill/Tool grant, approval, cache or presentation snapshot records.

## 4. Lineage, draft and reference application services

- [x] 4.1 Implement Chara lineage validation and graph projection services for declared roots, unlinked nodes, branch heads, ancestor paths, missing refs and cycles using exact CharacterVersions plus authoritative lineage only.
- [x] 4.2 Implement `continueFromVersion` as the only successful historical-version-to-working-draft path, requiring explicit unsaved-change resolution, copying the exact immutable definition and setting the exact draft basis without hidden branch drafts.
- [x] 4.3 Update local usable-version creation so ordinary finalization declares zero or one exact parent from the working draft basis, stores immutable content first and writes lineage through the canonical repository; delete any latest/current/time-based parent selection.
- [x] 4.4 Implement field-grouped immutable CharacterVersion comparison for identity, background/origin, canon, knowledge, behavior, expression, representation, voice and accepted evidence as a read-only projection.
- [x] 4.5 Define and implement narrow `CharacterVersionReferenceReader` ports for Chara-owned Storyline/Room/memory refs plus injected Agent Conversation and Project dependency refs; keep the destructive decision in Chara and source facts in their owners.
- [x] 4.6 Implement reference-aware deletion that blocks referenced versions, preserves exact inventory diagnostics, removes only an unreferenced version's owned relations and never rebinds consumers to a head/latest/sibling.
- [x] 4.7 Add application tests for branching, multiple heads, historical continue, unsaved draft protection, comparison, reference-reader failure, delete isolation, new branch after Conversation launch and no mutation of Storyline/Conversation/memory lineage.

## 5. Character Management and Workspace authoring separation

- [x] 5.1 Refactor `@neko/chara-webview` so reusable field/presentation primitives do not own page lifecycle, and replace the full `CharacterPanel` management-detail path with a dedicated read-only `CharacterManagementDetailSurface`.
- [x] 5.2 Make management detail show standalone/project-local placement, identity/summary, draft/finalization state, bounded lineage summary, Storyline count, exact reference inventory and explicit Quick Generate/Manual Create/Import/Open Studio/Export/Start Interaction lifecycle actions.
- [x] 5.3 Refactor `CharacterAuthoringStudioRoot` into the Chara-owned `CharacterAuthoringSurface` composed by canonical Workspace Authoring; keep it as the only complete Character definition, representation/voice, Storyline, test and local usable-version editor without owning Workspace, target switching, Workbench or Scene lifecycle.
- [x] 5.4 Replace user-visible “创建项目 / 可发布 / 发布版本 / 已发布版本 / 审阅与发布” Character copy with “创建角色草稿 / 可以定稿 / 创建可用版本 / 可用版本 / 定稿与版本” while retaining separate explicit portable export and remote sharing terminology.
- [x] 5.5 Add Workspace authoring graph/list version views, selected-node detail, exact compare, continue-from-version, reference inspection and delete-disabled states; keep graph projection read-only and avoid a generic graph/VCS editor.
- [x] 5.6 Add package export-scope/asset-policy and import-preview UI with visible self-contained/external dependency, branch, Storyline, size and identity-conflict states; never expose raw paths or imply export is publication.
- [x] 5.7 Add Chara Webview tests for management/detail/Workspace-authoring surface separation, no mutable form in Secondary Main, no independent Workspace/controller ownership, standalone/project badges, package preview/conflicts, unlinked old versions, branching graph, comparison, unsaved-draft decision, narrow/dense/empty/invalid layouts and accessibility/focus behavior.
- [x] 5.8 Simplify Character Management presentation to one responsive card catalog, one grouped creation entry and a lightweight detail containing only placement/summary/status plus Start Conversation/Edit; move lineage, Storyline/reference inventory and export into Workspace Authoring or subordinate controls, and add focused regression coverage.

## 6. Quick creation and exact handoffs

> All quick/manual/evidence/Asset/Entity-context seeds must commit through the same fresh CharacterProject
> creator. Project-local success also requires exact Project membership and Entity/Character association;
> partial completion remains visible and retries only the missing exact step.

- [x] 6.1 Add a typed Character Management quick-generation intent that opens/focuses the canonical Agent Entry/Composer with exact builtin `character-creator` activation and a minimal management return identity; do not create a management-owned Agent runtime or duplicate provider/model controls.
- [x] 6.2 Preserve the complete prompt, mentions and authorized references through the handoff, then reuse the existing operation-level standalone/project-local destination chooser, fresh-target receipt and standard Tool approval without changing Entry mode or inferring current/recent Workspace.
- [x] 6.3 Project exact `View Character` and `Open Studio` actions from successful Character Creator Tool results; selection/navigation occurs only when the user invokes one, and cancellation creates no Character/Project/runtime facts.
- [x] 6.4 Route manual creation to an explicitly authorized fresh CharacterProject opened in Workspace authoring, and keep portable import as an owner-qualified Chara workflow without sharing quick-generation handlers.
- [x] 6.5 Add Agent contract/runtime/Webview producer and consumer tests for management handoff, exact Skill activation, prompt preservation, global/project-local selection, cancellation, tool failure after target creation, exact result actions and poison proof against a second Composer/Chara provider path.

## 7. Directory Workspace and Desktop composition

- [x] 7.1 Reuse the existing Host sender-bound directory/file grants, canonical Workspace Authoring owner and exact CharacterProject target for standalone library-managed and Content Project Workspace authorities; add no raw path/ZIP path Renderer contract, fake Content Project, independent Chara Workspace/controller, active/recent root inference or alternate global repository.
- [x] 7.2 Update Desktop Creative Management composition to mount catalog Main plus read-only Character detail Secondary Main only, transition `Open Studio` to the exact directory-authorized Workspace Authoring target whose Main surface is contributed by Chara, and delegate import/export file selection to bounded Host ports.
- [x] 7.3 Verify canonical Workspace target switching commits only allowed presentation snapshot, unmounts the outgoing management/Character surface, validates incoming authority and mounts one visible Root; protected Character Conversation/Room runtime continues without retaining React/provider/resource state.
- [x] 7.4 Wire reference-reader, lineage and portable-package public ports in Desktop Main/preload/renderer using package public entries; keep only Electron sender/window/grant/file adapters and Scene wiring in `apps/neko-desktop`, with no ZIP parsing, lineage computation or Character mutation policy.
- [x] 7.5 Add Host/Desktop delegation and lifecycle tests for standalone/project-local Workspace authorities, package source/destination authorization, invalid grants, membership mismatch, exact handoffs, no hidden management editor/Character surface, no independent Studio Scene/Workbench/controller, sibling catalog availability and poison scans for raw path/ZIP path/fake Project/latest-version fallback.

## 8. Exact runtime and local usable-version integration

- [x] 8.1 Update Character launch/version selectors to show exact lineage label/path and require an explicit CharacterVersion when multiple heads exist; do not add implicit preferred/latest selection.
- [x] 8.2 Implement the explicitly labelled “Finalize and start Conversation” UI as local usable-version creation followed by the existing exact Character launch transaction; preserve the version and show a launch diagnostic if stage two fails.
- [x] 8.3 Keep CharacterStorylineVersion, Companion provenance, Room participant and Project dependency refs unchanged when new branches appear; add path-level tests proving reopen/compaction uses the original exact CharacterVersion.
- [x] 8.4 Keep CharacterVersion graph, Storyline graph/timeline and Agent Conversation branch projections separate in contracts, UI and source imports; add poison tests against cross-graph mutation or unified Timeline authority.

## 9. Documentation, quality and acceptance

- [x] 9.1 Update Chinese Chara/domain-authoring architecture docs for management/quick-create/Workspace Character Authoring/Interaction separation, Chara-as-Workspace-capability semantics, standalone/project-local Workspace authorities, local usable versions, portable package/asset ownership, lineage graph and user-data handling; update English docs where product terminology changes.
- [ ] 9.2 Run formatting and spec checks: `pnpm exec prettier --check openspec/changes/refine-character-management-authoring-and-version-graph packages/chara packages/chara-node packages/chara-webview apps/neko-desktop`, `pnpm check:openspec`, and `git diff --check`.
- [x] 9.3 Run package tests/typechecks: `pnpm --filter @neko/chara typecheck && pnpm --filter @neko/chara test`, `pnpm --filter @neko/chara-node typecheck && pnpm --filter @neko/chara-node test`, and `pnpm --filter @neko/chara-webview typecheck && pnpm --filter @neko/chara-webview test`.
- [x] 9.4 Run Agent/Project/Host/Desktop verification: affected `@neko/agent-*`, `@neko/project*`, `@neko/host` tests/typechecks plus `pnpm --filter @neko/app-desktop typecheck && pnpm --filter @neko/app-desktop test`.
- [ ] 9.5 Run repository gates `pnpm check:application-boundaries`, `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:no-internal-versioning`, `pnpm check:storage-authorities`, `pnpm check:unused`, `pnpm check`, and record unrelated failures without treating focused success as replacement evidence.
- [x] 9.6 Add key-free Agent Evaluation scenarios for management-to-Character-Creator handoff, exact destination/approval, no implicit usable version/runtime, and version branch exact selection; run `pnpm test:agent:eval` as harness readiness only.
- [ ] 9.7 Execute `neko-ui-validation` in authoritative visible Electron for global/project-local management, quick-create handoff, manual Workspace authoring, directory grant failure, package export/import preview, graph/list/compare, unlinked old data, narrow/dense states and finalize-and-launch; capture image-capable review and adjacent regressions.
- [ ] 9.8 With explicit provider/model/cost authorization, run real visible and hidden full-Desktop Character Creator/Conversation flows, then package with `pnpm package:desktop` and repeat standalone/project-local create, portable export/import, branch, exact launch and reopen paths.
- [x] 9.9 Execute `neko-quality-review`, listing the canonical owner/producer/consumer/repository/Scene path, removed-path and poison evidence, user-data preservation, all verification commands/results, unexecuted checks and residual risks before marking the change complete.
