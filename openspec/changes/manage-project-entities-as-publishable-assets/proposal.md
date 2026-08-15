> Supersession notice (2026-08-12):
> [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/)
> retains the canonical Project Entity repository, candidates, bindings and reference diagnostics, but
> supersedes Entity Asset lifecycle, mandatory four peer resource facets and Entity-owned Character
> dialogue/Room/embody. Those clauses are no longer implementation requirements. See its
> [`reconciliation.md`](../simplify-resource-entity-character-world-boundaries/reconciliation.md).

## Why

Project Entity facts are currently fragmented across character, per-kind, candidate, binding,
requirement, and draft files, while Resource Browser labels confirmed Entities as `materials` without
providing candidate or lifecycle management. Entity must become a searchable project semantic
aggregate that can reference content and publish into the Asset Library without creating a separate
global Entity catalog or synchronization system.

## What Changes

- Define Project Entity as the canonical mutable project instance for character, scene, object,
  location, and style identity; define Entity Asset as its immutable, versioned Asset Library
  publication form.
- Consolidate confirmed Entity identity and accepted representation intent into one canonical project
  fact authority under `neko/`; remove candidate, availability, orphan timestamps, inferred relations,
  visual drafts, and other rebuildable/workflow state from the authoritative JSON document.
- Make workspace/document analysis and Asset/Media discovery produce directly searchable candidate and
  occurrence projections; stable Entity operations require explicit create, confirm, merge, or import
  intent.
- Replace Resource Browser `materials` with four owner-preserving project resource facets: workspace
  `files`, linked `media`, reusable `assets`, and semantic `entities`. The Entity facet covers
  confirmed, candidate, needs-attention, and deprecated views plus Entity Inspector operations;
  Asset results retain global Asset identity and never become Project Entity facts implicitly.
- Add explicit Entity Asset instantiate, bind, publish, update-available, diff, and apply workflows using
  Asset Library ports. Projects retain `originAssetId` and applied revision as provenance; no implicit
  bidirectional sync or automatic overwrite is allowed.
- Distribute Entity Assets through the generic Asset Library cloud synchronization boundary. Project
  Entity facts are never uploaded by background Asset sync, and no Entity-specific cloud catalog or
  synchronization service is introduced.
- Define deletion and update behavior so missing content, removed Media Library links, uninstalled
  Entity Assets, and changed fingerprints never delete or silently mutate Project Entity facts.
- **BREAKING**: keep current `characters.json`, per-kind files, `candidates.json`, representation
  bindings, visual drafts, and requirements untouched but outside product reachability; delete
  fragmented normal readers and accept new facts only through canonical Entity operations.

## Capabilities

### New Capabilities

- `project-entity-authority`: Canonical project Entity document, candidate/confirmed lifecycle,
  searchable projections, reference-safe merge/deprecate, and derived availability rules.
- `project-entity-management-surface`: Resource Browser File, Media, Asset, and Entity facets; Entity
  Inspector; inline candidate confirmation; binding management; attention states; and typed
  project-reference/dialogue entry intents.
- `entity-asset-publication`: Project Entity instantiate/bind/publish/update workflows over Asset Library
  revisions without a separate Entity catalog or sync authority.

### Modified Capabilities

- `unified-entity-representation-bindings`: Bindings may reference manifest-backed Entity/ordinary Asset
  package resources; availability becomes derived, and an Entity Asset may carry a frozen semantic
  snapshot without becoming the live project identity authority.

## Impact

- Owning responsibility: `@neko/entity-domain` owns Project Entity semantics, codecs, conversion,
  diff/apply, and lifecycle; `@neko/entity-node` owns workspace file adapters; Search/local metadata own
  rebuildable candidate/occurrence/availability projections; Assets owns published package lifecycle.
- Affected package roles: `packages/entity/domain`, `packages/entity/node`, `packages/search/domain`,
  `packages/search/local-metadata`, `packages/assets/domain`, `packages/assets/node`,
  `packages/assets/webview`, `packages/chara`, Agent content effects, and Desktop public-port composition.
- Affected data: root `characters.json`, `neko/entities/*.json`, candidate/binding/draft/requirement files,
  SQLite Entity projections, project Asset provenance, and Resource Browser `materials` state.
- Existing non-canonical Entity-related bytes remain untouched. Canonical readers reject only the exact
  record, rebuild only proven projections, and never delete referenced content or Asset packages.
- This change depends on the generic manifest/version/publish/install boundaries from
  `establish-manifest-backed-asset-library`, including its cloud replication boundary, but remains
  independently implementable up to its Asset adapter contract and project management surface.
- Desktop project attach composes only the Entity-owned canonical application path before Resource
  Browser projection; it never invokes a legacy or migration reader.
