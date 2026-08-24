## 1. Canonical Entity contracts

- [x] 1.1 Inventory all current Entity, character, per-kind, candidate, binding, draft, requirement, and project-reference producers/consumers and classify authoritative versus rebuildable/workflow fields.
- [x] 1.2 Define the canonical Project Entity document, owner-serialized operations, lifecycle, provenance/import-base, package binding, candidate evidence, and typed diagnostic contracts in `@neko/entity-domain`.
- [x] 1.3 Add contract/codec tests for all supported Entity kinds, including the `scene` identity metadata decision, invalid authority fields, exact package references, conflicts, and unknown-field failure.
- [x] 1.4 Define the typed project-reference index/rewrite participants required for merge, deprecate, and delete without an app-owned registry or silent partial rewrite.

## 2. Entity authority and retired paths

- [x] 2.1 Implement the atomic `neko/entities.json` repository in `@neko/entity-node` with path authorization, owner serialization, cancellation, and fail-visible diagnostics.
- [x] 2.2 Delete product migration inventory/archive/classification paths for fragmented authorities and keep existing bytes untouched.
- [x] 2.3 Compute only proven candidate/search/availability projections from canonical facts; do not inspect or import retired files.
- [x] 2.4 Delete fragmented normal readers/writers, dual authorities, and fallback mappings; add producer tests, consumer/delegation tests, and proof that retired paths cannot return success.

## 3. Candidates, availability, and references

- [x] 3.1 Implement workspace/document/Asset/Media candidate and occurrence projections in Search/local metadata without writing canonical Entity facts.
- [x] 3.2 Implement explicit create, confirm, merge-into, dismiss, merge, deprecate, and delete operations with exact request identity, owner serialization and complete reference plans.
- [x] 3.3 Derive binding availability and needs-attention state through owning resource ports for files, documents, generated outputs, and exact Asset revisions.
- [x] 3.4 Add tests proving candidate disappearance, missing files, removed links, unavailable accounts, and uninstalled Assets never delete or mutate confirmed Entity facts.

## 4. Superseded Entity Asset scope

- Superseded 4.1-4.4: Entity Asset instantiate/publication/provenance/diff/apply was retired by the
  resource/entity boundary successor and is not promoted by this change. Ordinary Asset ownership and
  the invariant that resource availability cannot control Project Entity lifecycle remain covered by
  their current owners.

## 5. Resource Browser and Desktop composition

- Superseded 5.1a: Mandatory peer Resource Browser facets were retired. Current Resources and Project
  Content surfaces preserve their own owners and do not copy Entity payloads.
- [x] 5.1b Add confirmed, candidate, needs-attention, and deprecated Entity projections for the
      owner-preserving Project Content and Entity inspection paths.
- [x] 5.2 Implement the Entity-owned Inspector with typed confirm, edit, bind, merge, deprecate,
      reference planning and blocker presentation; exclude Entity Asset and Entity-owned Character runtime intents.
- [x] 5.3 Wire Entity domain/node/search/Webview ports through sender-bound Desktop IPC without retaining
      Entity semantics or file IO in the Renderer/application root. Superseded Asset and Character paths
      are absent rather than hidden behind unsupported success states.
- [x] 5.4 Add producer, Webview consumer, Desktop delegation, stale-request, conflict and canonical-handler
      path tests for every retained ownership replacement.
- Historical evidence 5.5: Workspace File context-menu/import/Trash behavior was verified during this
  change but is now owned by the canonical Workspace resource-acquisition capability, not Entity management.
- [x] 5.6 Keep Resource Browser component presentation data unversioned and migration-free, prevent Desktop Assets wire contracts from entering stale Vite dependency prebundles, and contain invalid runtime data inside the owner-local surface.
  - The Desktop architecture gate enforces canonical Assets wire-contract loading. Assets Webview coverage proves snapshot failure leaves a sibling surface mounted, and live Electron verification confirmed Resource Browser recovery with no console error after the canonical contract rebuilt.

## 6. Verification and documentation

- [x] 6.1 Update Entity, Asset Library, Resource Browser, workspace data, local metadata, and package-boundary documentation in Chinese and English where semantics changed.
- [x] 6.2 Run affected package tests/typechecks plus `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`; record results and canonical/retired-path evidence.
  - Affected Entity, Search, Assets, Desktop, and AppHost tests/typechecks passed. `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused` passed on 2026-08-05.
  - Canonical and retired-path evidence is asserted by repository reachability tests, `project-entity-resources.test.ts`, `node-project-entity-inspector-runtime.test.ts`, Entity Webview consumer tests, and Desktop Resource Browser delegation tests.
- [x] 6.3 Run a real Electron fixture scenario covering candidate confirmation, binding attention and merge blockers.
  - `pnpm test:local:ui --scenario resource-browser-entity-management` passed against real Electron on 2026-08-05. Its report records candidate confirmation, binding needs-attention, two reference blockers, hidden unsupported Asset actions, and no console errors, warnings, or exceptions.
  - Superseded Entity Asset runtime acceptance is excluded and ordinary Asset lifecycle verification remains owned by `establish-manifest-backed-asset-library`.
- [x] 6.4 Complete `pnpm ci:local`, record untouched retired-data and residual reference, publication, provider, and user-data risks, and verify no fragmented authority returned success.
  - `pnpm ci:local` passed on 2026-08-05, including formatting, lint, all workspace typechecks/builds, Desktop arm64 packaging, all tests, unused/dependency checks, architecture gates, and strict OpenSpec validation.
  - Unknown retired fields remain untouched; normal fragmented readers are absent and canonical resource tests prove they cannot return success.
  - Residual risks remain capability-blocked: incomplete reference-owner participation and absent manifest-backed publication/provider/tombstone runtime. None is exposed through a fallback success path.
- [x] 6.5 Compose the Entity-owned canonical project-open path with local metadata, add producer/delegation/fail-closed tests, and verify valid sibling records remain visible beside one invalid Entity in an isolated Electron Resource Browser flow.
  - Historical migration evidence is superseded by `remove-internal-versioning-and-product-migrations`; current acceptance must use canonical records and retired-path absence.
- [x] 6.6 Verify pointer/keyboard context-menu behavior, large-file Host-only import, Trash cancellation/failure, stale locator rejection, default list presentation, and owner-specific command absence in an isolated Electron Resource Browser flow.
  - The same packaged report records default list presentation, pointer root commands, keyboard directory commands, a real OS Trash result, and no generic Trash command for Media or Entity content, with zero console errors, warnings, exceptions, or forbidden requests. Focused Assets Domain/Node tests cover picker cancellation, stale request/identity rejection, failure propagation, portable names, and a multi-megabyte Node-only import without Host byte-buffer calls.
- [x] 6.7 Keep unsupported canonical document metadata and foreign Project identity failures inside the Entity facet, preserve source bytes, keep valid sibling records visible, and verify the Resource Browser request returns diagnostics instead of rejecting the surface.
  - Focused Entity Domain/Node and Desktop delegation tests preserve source bytes, return exact owner-local diagnostics, reject strict mutation and Agent reads, and keep valid sibling records available. The isolated Electron `resource-browser-invalid-entity-document` scenario passed on 2026-08-07 with the Entity facet diagnostic and Files facet both visible, plus zero console errors, warnings, or exceptions.
