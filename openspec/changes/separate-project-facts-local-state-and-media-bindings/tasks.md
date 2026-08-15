## 1. Storage Classification And Local Layout

- [x] 1.1 Extend `@neko/local-metadata` storage classification/layout contracts with synchronized
      project facts, package-owned disposable project `.neko`, and user-global state while keeping
      project identity canonical in `neko/project.json` and forbidding a workspace database or generic
      settings owner.
- [x] 1.2 Add project-local initialization and per-record failure contracts for binding, presentation,
      and cache owners; prove deleting all `.neko` state cannot mutate or synthesize any project fact.
- [x] 1.3 Add product sync/package/project-enumerator exclusion primitives that reject root `.neko`
      before traversal and do not follow its links, independently of Git state.
- [x] 1.4 Add storage tests for absent `.neko`, malformed owner records beside valid siblings, unknown
      local files preserved untouched, no duplicate `neko.db` authority, and no `.neko/workspace.json`
      identity path.

## 2. Canonical Media Library Locator

- [x] 2.1 Add the closed `MediaLibraryContentLocator` contract, validation, equality/key behavior, drag
      and content-reference codecs to `@neko/content`, rejecting `.neko`, `neko/assets`, absolute,
      dot-segment, connection, provider, cache, and runtime fields.
- [x] 2.2 Add the exact Media Library handler to `ContentReadService` and Node content composition; keep
      Desktop limited to sender/Workspace authorization, exact native connection resolution, and
      short-lived resource publication.
- [x] 2.3 Atomically switch Canvas, Cut, Entity representation, Preview, Search, Agent context, Resource
      Browser, project reference readers, package/export, and fixtures from linked-media
      `workspace-file` locators to `MediaLibraryContentLocator`.
- [x] 2.4 Delete the `workspace-file + neko/assets` resolver, direct-link authorization root, old public
      exports, tests, and registrations; add poison/reachability tests proving the retired prefix cannot
      produce a successful media read.

## 3. Project-Local Media Binding

- [x] 3.1 Define strict per-library project-local binding, availability, diagnostic, requirement,
      immutable recovery-plan, and confirmation contracts in `@neko/assets-domain`, with no physical
      target or credential-bearing field.
- [x] 3.2 Implement the bounded `.neko/media-libraries/` repository in `@neko/assets-node`, preserving
      invalid bytes, isolating one malformed record, and initializing an absent directory as an empty
      binding set.
- [x] 3.3 Implement the single exact resolver from Project-local binding to authorized user-global
      connection to contained descendant, with relative-path/final-realpath guards and no name/history/
      active Workspace/cache/provider fallback.
- [x] 3.4 Replace workspace link add/relink/remove with plan-confirm-apply binding operations; ensure
      removal changes only the local record and selection cancellation or stale fingerprints change no
      local/global state.
- [x] 3.5 Update requirement aggregation and Resource Browser Media projection for available,
      required-unlinked, connection-missing, target-unavailable, content-incomplete, binding-invalid,
      and unreferenced-local-binding states while preserving valid sibling libraries.
- [x] 3.6 Add domain/Node tests for `.neko` deletion, exact global candidate confirmation, invalid binding
      isolation, missing target, nested-link escape, external mutation preconditions, and target-free
      contract/diagnostic/Renderer payloads.

## 4. Project Facts And Composition Projections

- [x] 4.1 Define Project-owned per-record Entity-to-Character association facts and repository paths
      below `neko/project-bindings/entity-character/`, with exact Project/Entity/Character identities,
      atomic writes, independent parsing, and preserved invalid bytes.
- [x] 4.2 Make Chara and World public owner readers expose exact Project-scoped records and derive local
      Project target membership without a Project-owned mutable membership list.
- [x] 4.3 Derive external dependency and usage summaries from fixed exact consumer reference readers,
      including Character/World versions, Asset pins, Media Library locators, and package resources;
      incomplete coverage must block only claims that require completeness.
- [x] 4.4 Switch Project Content, target navigation, Entity/Character handoff, resource usage,
      publication readiness, and authoring composition to Project identity + association facts + fixed
      owner ports, preserving row/group diagnostics beside valid siblings.
- [x] 4.5 Remove `ContentProjectComposition`, `ProjectCompositionService`, the
      `neko/project-composition.json` repository, Desktop ensure/create calls, and every producer,
      consumer, fixture, registration, and public export of the monolithic path.
- [x] 4.6 Add producer/repository/projection/consumer tests plus source poison tests proving invalid or
      absent `project-composition.json` cannot block Workspace entry or be recreated as an empty success.

## 5. Desktop And Resource Surfaces

- [x] 5.1 Change Desktop scene transition to commit exact authorized Workspace navigation independently
      from Project Content projection and keep any Project projection failure inside its owning Surface.
- [x] 5.2 Update preload/renderer typed contracts and Assets Webview to show project-linked Media state
      without physical targets, `.neko` paths, global connection identities, raw filesystem errors, or
      implicit recovery.
- [x] 5.3 Reserve `neko/` and `.neko/` from generic Resource Browser rename, trash, copy-over, and import
      destinations; add delegation tests proving owner application services are the only mutation path.
- [x] 5.4 Present Files, project-linked Media, and globally installed Assets as owner-preserving sources;
      distinguish project use, global Asset availability, and missing exact dependencies without a
      workspace Asset Library.

## 6. Synchronization And Portable Packaging

- [x] 6.1 Update normal project sync planning to transfer synchronized facts, project-owned files, and
      logical locators while excluding `.neko`, global connections, external media bytes, caches,
      credentials, and physical targets.
- [x] 6.2 Update portable snapshot planning to reread all authoritative Media Library and Asset/package
      references, require complete owner coverage, preflight capacity/conflicts, and reject stale or
      missing sources before publish.
- [x] 6.3 Collect only referenced external media into deterministic project-owned paths, rewrite only
      staged owner documents to `workspace-file` locators, validate fingerprints and forbidden local
      values, and publish with one atomic rename.
- [x] 6.4 Add cancellation, restart-checkpoint, missing-byte, stale-owner, path-escape, publish-conflict,
      and staging-cleanup tests proving source projects/global libraries remain immutable and partial
      destinations never appear.
- [x] 6.5 Add sync/package leakage tests that seed `.neko` with physical-looking paths, binding IDs,
      symlinks, unknown files, and credentials and prove none reaches project facts, Renderer/Agent
      payloads, logs, staged output, or final packages.

## 7. Explicit Offline Conversion

- [x] 7.1 Build a product-unreachable exact-target inspector that reports recognized
      `project-composition.json`, `neko/assets` links, and linked-media workspace-file locators without
      changing bytes or importing product runtime composition.
- [x] 7.2 Add explicit confirmation, immutable backup, bounded conversion to new association facts and
      Media Library locators/bindings, atomic commit, and complete post-validation; reject unknown or
      incomplete records without partial conversion.
- [x] 7.3 Add reachability and failure tests proving startup, public package entries, Desktop build,
      ordinary tests, and runtime readers cannot import or invoke the converter and cannot use converted
      backups as fallback authority.
- [x] 7.4 Cover real retired Canvas documents whose material identity is a document entry inside a
      linked EPUB/CBZ, and recognize the exact earlier composition shape without association facts;
      preserve explicit confirmation, immutable backup, atomic publish, and product unreachability.

## 8. Documentation And Verification

- [x] 8.1 Update the Local Metadata, Media/Asset Library, Content/path, package-boundary, creative-resource,
      sync/package, and Project architecture documents; mark the replaced decisions in
      `optimize-workspace-media-library-sync` and
      `simplify-resource-entity-character-world-boundaries` as superseded by this change.
- [x] 8.2 Run focused contract/unit suites and package checks for Content, Assets, Local Metadata, Project,
      Chara, World, Entity, Canvas, Cut, Agent, Preview, Search, and Desktop, recording the exact commands
      and results in implementation evidence.
- [x] 8.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and
      `pnpm check:unused`; inspect source/dependency gates for duplicate owners, old locators,
      `project-composition.json`, generic `.neko` access, and app-owned business logic.
- [ ] 8.4 Run isolated visible Electron scenarios for fresh project, deleted `.neko`, invalid binding,
      clone requiring relink, explicit confirmed recovery, invalid Project association beside valid
      siblings, generic fact-mutation rejection, and atomic portable packaging.
- [ ] 8.5 Validate macOS local/removable/NAS connections and Windows local directory/junction/UNC behavior,
      record unavailable platform coverage as an explicit release blocker, and document measured large
      package cancellation/cleanup behavior.
- [ ] 8.6 Perform `neko-quality-review` and `neko-ui-validation`, record canonical-path evidence,
      validation commands, remaining unconverted user-data/platform risks, and confirm that no required
      task remains before marking the change complete.
