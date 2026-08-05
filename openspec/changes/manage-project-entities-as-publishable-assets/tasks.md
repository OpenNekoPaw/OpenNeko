## 1. Canonical Entity contracts

- [x] 1.1 Inventory all current Entity, character, per-kind, candidate, binding, draft, requirement, and project-reference producers/consumers and classify authoritative versus rebuildable/workflow fields.
- [x] 1.2 Define the versioned Project Entity document, expected-revision operations, lifecycle, provenance/import-base, package binding, candidate evidence, and typed diagnostic contracts in `@neko/entity-domain`.
- [x] 1.3 Add contract/codec tests for all supported Entity kinds, including the `scene` identity metadata decision, invalid authority fields, exact package references, conflicts, and unknown schema/version failure.
- [x] 1.4 Define the typed project-reference index/rewrite participants required for merge, deprecate, and delete without an app-owned registry or silent partial rewrite.

## 2. Entity authority and migration

- [x] 2.1 Implement the atomic `neko/entities.json` repository in `@neko/entity-node` with path authorization, expected revision, cancellation, and fail-visible diagnostics.
- [x] 2.2 Implement a read-only migration inventory, immutable archive, field classification, ambiguity report, and expected-source/project-revision plan for fragmented authorities.
- [x] 2.3 Migrate confirmed facts and bindings atomically, preserve unresolved values, rebuild proven projections, and retain old files only through explicit recovery/inspection.
- [x] 2.4 Delete or poison fragmented normal readers/writers, dual authorities, and fallback mappings; add producer tests, consumer/delegation tests, and proof that legacy paths cannot return success.

## 3. Candidates, availability, and references

- [x] 3.1 Implement workspace/document/Asset/Media candidate and occurrence projections in Search/local metadata without writing canonical Entity facts.
- [x] 3.2 Implement explicit create, confirm, merge-into, dismiss, merge, deprecate, and delete operations with expected revision and complete reference plans.
- [x] 3.3 Derive binding availability and needs-attention state through owning resource ports for files, documents, generated outputs, and exact Asset revisions.
- [x] 3.4 Add tests proving candidate disappearance, missing files, removed links, unavailable accounts, and uninstalled Assets never delete or mutate confirmed Entity facts.

## 4. Entity Asset workflows

- [x] 4.1 Implement Entity Asset instantiation with a new Project Entity ID, frozen import base, and exact origin revision/digest provenance through the generic Asset adapter.
- [x] 4.2 Implement portable publication conversion that snapshots accepted semantics and packages or rejects external representations before generic Asset publication.
- [x] 4.3 Implement update-available projection and explicit three-way semantic diff/apply with selected changes, conflict preservation, and expected project revision.
- [x] 4.4 Add tests proving Asset cloud sync never reads/uploads the mutable project Entity document and Asset uninstall/tombstone never controls Project Entity lifecycle.

## 5. Resource Browser and Desktop composition

- [x] 5.1a Replace the Resource Browser `materials` facet with owner-preserving `files`, `media`, `assets`, and `entities` facets, retain per-facet selection/navigation display state, and reject the retired facet through the versioned contract.
- [x] 5.1b Add confirmed, candidate, needs-attention, and deprecated Entity projections plus owner-preserving cross-source search.
- [x] 5.2 Implement Entity Inspector and typed confirm, edit, bind, merge, deprecate, instantiate, publish, diff, apply, reference, Character dialogue, Room open, and Character embody intents with visible provenance, capability gating, and blockers.
- [ ] 5.3 Wire Entity domain/node/search/webview and generic Asset ports through sender-bound Desktop IPC without retaining Entity semantics or file IO in the Renderer/application root.
  - Basic Entity operations use the package-owned `entity.manage` path through the existing sender-bound Resource Browser bridge. Generic Asset production wiring is blocked by `establish-manifest-backed-asset-library` (0/25); unsupported capabilities remain hidden.
- [ ] 5.4 Add producer, Webview consumer, Desktop delegation, stale-event, conflict, and canonical-handler path tests for every ownership migration.
  - Canonical/basic Entity ownership paths have producer, Webview, Desktop delegation, stale revision, conflict, journal recovery, and handler-path coverage. Asset and complete reference-owner migrations do not yet have production owners to exercise.

## 6. Verification and documentation

- [x] 6.1 Update Entity, Asset Library, Resource Browser, workspace data, local metadata, and package-boundary documentation in Chinese and English where semantics changed.
- [x] 6.2 Run affected package tests/typechecks plus `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`; record results and canonical-path/poison evidence.
  - Affected Entity, Search, Assets, Desktop, and AppHost tests/typechecks passed. `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused` passed on 2026-08-05.
  - Canonical and poison evidence is asserted by `legacy-authority-poison.test.ts`, `project-entity-resources.test.ts`, `node-project-entity-migration.test.ts`, `node-project-entity-inspector-runtime.test.ts`, Entity Webview consumer tests, and Desktop Resource Browser delegation tests.
- [ ] 6.3 Run a real Electron fixture scenario covering candidate confirmation, binding attention, merge blockers, Entity Asset instantiate/publish/update conflict, and remote Asset tombstone.
  - `pnpm test:local:ui --scenario resource-browser-entity-management` passed against real Electron on 2026-08-05. Its report records candidate confirmation to canonical revision 2, binding needs-attention, two reference blockers, hidden unsupported Asset actions, and no console errors, warnings, or exceptions.
  - Asset instantiate/publish/update/tombstone runtime coverage depends on the manifest-backed Asset production owner and must not be replaced by an in-memory or flat-file success path.
- [x] 6.4 Complete `pnpm ci:local`, record unresolved migration classifications and residual reference, publication, provider, and user-data risks, and verify no fragmented authority returned success.
  - `pnpm ci:local` passed on 2026-08-05, including formatting, lint, all workspace typechecks/builds, Desktop arm64 packaging, all tests, unused/dependency checks, architecture gates, and strict OpenSpec validation.
  - Unknown legacy fields remain `unresolved-archive`; ambiguous identity/binding values remain explicit user-confirmation items. Immutable archives preserve their source bytes, while normal fragmented readers are poisoned and canonical resource tests prove they cannot return success.
  - Residual risks remain capability-blocked: incomplete reference-owner participation, absent manifest-backed publication/provider/tombstone runtime, and real heterogeneous user-workspace migration coverage. None is exposed through a fallback success path.
