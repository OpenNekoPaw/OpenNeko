## 1. Preconditions And Contract Freeze

- [x] 1.1 Verify `adopt-workspace-linked-media-libraries` is complete and finish the required public locator and representation boundaries from `simplify-workspace-content-io` and `internalize-derived-content-storage` before changing Asset and Entity contracts.
- [x] 1.2 Inventory every AssetEntity/Variant/File type, `library.json` store, `project://assets/` resolver, import/promote path, command, Extension API, search partition, TUI capability, Canvas/Cut/Agent consumer, Tools reader/diff path, and legacy project fixture.
- [x] 1.3 Freeze one Media Library projection-entry contract and one closed EntityRepresentationBinding target union for workspace files, document entries, generated outputs, and package-owned representations.
- [x] 1.4 Add compile/runtime poison fixtures proving new contracts cannot contain Asset IDs, `project://assets/`, cache/materialized paths, runtime tokens, absolute/link-target paths, dual `assetRef` fields, or AssetSource routing kinds.

## 2. Safe Legacy Inspection And Migration

- [x] 2.1 Define versioned inspection, classification, migration-plan, unresolved-field, archive, revision-precondition, and safe diagnostic contracts without exposing physical paths.
- [x] 2.2 Implement read-only inspection of `library.json`, EntityAssetBinding files, project Asset URIs, Asset-backed Canvas/Cut data, and legacy search data without registering runtime resolvers.
- [x] 2.3 Implement immutable content-addressed migration archives and prove archive failure or changed input leaves every project byte unchanged.
- [x] 2.4 Implement deterministic classification into locator migration, existing Entity association, confirmation-required Entity proposal, owner-specific provenance, rebuildable projection, and unresolved archived metadata.
- [x] 2.5 Implement dry-run, explicit confirmation, atomic apply, partial-failure rollback, and explicit archive recovery; normal runtime must never read the archive.
- [x] 2.6 Add migration fixtures for valid, ambiguous, missing, changed, unknown-version, non-portable, generated, package, and user-authored metadata records, including tests that prevent silent loss or Creative Entity metadata contamination.

## 3. Direct Entity Representation Bindings

- [x] 3.1 Replace shared EntityAssetBinding/assetRef contracts and codecs with EntityRepresentationBinding and the frozen representation-reference union in one schema migration.
- [x] 3.2 Migrate `neko-entity` storage, facade, commands, projections, Inspector, representation resolver, availability watcher, requirements, and character adapters to direct references.
- [x] 3.3 Implement workspace/document/generated/package resolution adapters through existing content and owner ports without Asset service or ResourceCache dependencies.
- [x] 3.4 Implement fingerprint-precondition validation, visible orphan state, candidate suggestions, and explicit rebind; poison automatic relocation and legacy resolver fallback.
- [x] 3.5 Add producer/consumer and lifecycle tests proving bind, resolve, unbind, deletion, entity deprecation, package resolution, and orphan/rebind do not cross ownership boundaries.
- [x] 3.6 Wire the existing Host ContentReadService into the VS Code Entity runtime and Media Library copy flow so real Extension Host rebind never depends on a test-only injection.

## 4. Media Library Resource Surface

- [x] 4.1 Replace Asset Library tree/history/recent/catalog projections with a single Media Library projection over canonical locators and filesystem-derived linked roots.
- [x] 4.2 Preserve direct link add/relink/remove and availability behavior while removing AssetSource records, target registries, catalog membership state, and import/promote prerequisites.
- [x] 4.3 Replace save/import/promote actions with explicit retain-generated, copy-to-selected-writable-library, package import, bind, and rebind operations with target-preserving deletion semantics.
- [x] 4.4 Migrate project Search file results, freshness, deduplication, recent use, technical metadata, navigation, and rebuild behavior to canonical locators; discovery must not write Entity facts.
- [x] 4.5 Update VS Code and TUI Media Library labels, commands, empty/error states, configuration surfaces, and diagnostics so no separate Asset Library or Asset Source product concept remains.
- [x] 4.6 Add path-level tests for workspace files, linked files, broken/relinked roots, cloud-synchronized local links, generated outputs, documents, packages, copy/delete authorization, and no cache/physical-path disclosure.
- [x] 4.7 Decouple add/relink/remove from Git in non-repository workspaces while preserving exact exclude verification and fail-visible behavior for real Git repositories.
- [x] 4.8 Replace the decoration-only mitigation with confirmed `WorkspaceFolder`-scoped `git.enabled = false`, track the prior explicit value and plugin ownership, restore only an unchanged owned value after the last link is removed, and add path-level regression tests for multi-root isolation and user-setting preservation.

## 5. Consumer And Agent Migration

- [x] 5.1 Migrate Canvas media nodes, material actions, authoring, persistence, reopen, and entity routes from Asset IDs/import promotion to direct locators and representation bindings.
- [x] 5.2 Migrate Cut services, timeline references, export/package reads, entity representation selection, and file actions from AssetService to content and Entity ports.
- [x] 5.3 Replace Agent ListAssets/GetAsset/import-promote behavior and prompts with Media Library file search/read plus Creative Entity query/bind behavior; keep tool schemas free of cache, AssetSource, and physical paths.
- [x] 5.4 Migrate Tools readers, diagnostics, asset diff behavior, TUI reference suggestions/capabilities, and remaining Extension API consumers to the new canonical paths or remove obsolete features whose semantics require AssetEntity.
- [x] 5.5 Add end-to-end path assertions for Media Library -> ContentRead/Representation, Entity -> RepresentationBinding -> resource, Agent -> media/document read, Canvas/Cut reopen, and package/export dereference with every legacy handler poisoned.

## 6. Remove The Asset Catalog

- [x] 6.1 Poison then delete AssetEntity/Variant/File/Source/query/protocol contracts, services, registries, storage implementations, classifiers, public exports, dependency registrations, and package-local compatibility adapters.
- [x] 6.2 Delete `library.json` runtime reads/writes, `project://assets/` resolution, Asset Extension APIs, commands, aliases, search partitions, Agent capabilities, Canvas/Cut promotion routes, and obsolete tests/fixtures.
- [x] 6.3 Rebuild local search/recent/availability projections and add legacy-debt rules that reject new Asset catalog symbols, paths, URIs, API names, and fallback branches outside migration-only allowlists.
- [x] 6.4 Run unused/dependency analysis and remove now-unreachable Asset UI, diff, storage, service, localization, configuration, documentation, and package exports without deleting migration-only data protection code.

## 7. Documentation And Verification

- [x] 7.1 Rewrite `adr-asset-library-sources-and-unified-entity-boundary.md` around Media Library + Creative Entity, update `asset-library.md` to a media-library architecture document or retire it explicitly, and synchronize unified-entity, content/path, package-boundary, domain, package, TUI, and user documentation.
- [x] 7.2 Run focused shared contract, migration, Media Library, Entity, Search, Agent, Canvas, Cut, Tools, TUI, document, package/export, and path-security tests plus affected package builds.
- [x] 7.3 Run `pnpm build`, `CI=1 pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, and `pnpm check:quality`, resolving all non-allowlisted residuals.
- [x] 7.4 Use `neko-agent-evaluation` to validate real Media Library read/search, document-entry use, generated representation binding, and forbidden Asset fallback cases.
- [x] 7.5 Use Extension Development Host with `vscode-extension-debugger` to verify add/relink/remove, browse/search/open, copy authorization, entity bind/rebind/orphan, Canvas/Cut consumption, and safe diagnostics in isolated fixture workspaces.
- [x] 7.6 Run strict OpenSpec validation and record commands, host/model identities where applicable, migration evidence, unresolved user-data cases, and remaining risks before declaring the change complete.
