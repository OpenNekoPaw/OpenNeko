## Context

OpenNeko currently has three overlapping models: linked media-library directories exposed as ordinary workspace paths, an Asset catalog persisted as `AssetEntity -> AssetVariant -> AssetFile`, and Creative Entities that already own character, scene, object, location, and style identity. The Asset catalog duplicates semantic identity and forces already-readable files through import/promote membership before some consumers can use them.

This change retains two product/domain models only. Media Library is the user-facing file-resource surface; Creative Entity is the semantic identity authority. Content I/O, document access, generated-output ownership, package import/trust, semantic representations, and derived storage remain infrastructure or existing domain owners rather than additional library models.

Five-layer analysis:

- Responsibility: Media Library discovers and projects accessible files and manages only direct workspace links; Creative Entity owns semantic facts and representation bindings; resource owners retain their own durable outputs.
- Dependency: product consumers use the stable locator and representation ports finalized by the content changes; neither domain imports ResourceCache or another product package's internal service.
- Interface: Media Library entries are rebuildable projections keyed by canonical locator; entity bindings use a closed representation-reference union rather than string Asset IDs.
- Extension: generated outputs, document entries, and packages add their own locator/reference branch or projection adapter without becoming an Asset catalog source kind.
- Test: path-level tests poison AssetEntity, `project://assets/`, `library.json`, import/promote, and cache-aware fallback while proving direct file and entity-binding paths.

Prerequisites are `adopt-workspace-linked-media-libraries`, followed by the locator and representation boundaries in `simplify-workspace-content-io` and `internalize-derived-content-storage`. This dependency is contract-level: completing this change means the Media Library and Creative Entity paths use those boundaries, not that the two adjacent changes have completed their full runtime migrations. Host-private derived storage composition, product ResourceCache removal, and deletion of the old ContentAccess/ContentIngest matrix remain owned by those changes and must not be pulled back into Media Library or Creative Entity. This change must not freeze a new public contract around the current cache-coupled `ResourceRef` shape.

## Goals / Non-Goals

**Goals:**

- Keep Media Library as the only user-visible file-resource entry and Creative Entity as the only creative semantic identity authority.
- Allow workspace, linked-library, generated, document-entry, and package resources to be used and bound without Asset catalog membership.
- Remove AssetEntity catalog persistence, public APIs, commands, search paths, and resolvers with fail-closed legacy handling.
- Preserve valuable legacy data through inspection, immutable backup, deterministic migration, explicit confirmation, or visible unresolved diagnostics.
- Maintain one canonical runtime path without aliases, dual reads, dual writes, or compatibility fallback.

**Non-Goals:**

- Replace ContentReadService, ContentRepresentationService, DocumentAccess, generated-output ownership, or package trust/import.
- Add an AssetSource registry, mount service, background repair service, generic resource-ID registry, or Unity-style Asset Database.
- Guarantee that ordinary path-addressed files retain identity after rename or movement.
- Store arbitrary file tags, license, or provenance in Creative Entity metadata merely to preserve old Asset fields.
- Automatically infer, create, merge, or mutate Creative Entities from discovered filenames or legacy catalog records.

## Decisions

### 1. Media Library is a projection and bounded link manager

Media Library composes a file tree, search, recent-use view, availability, and diagnostics over authorized content. Direct children of `neko/assets/` that are valid links are linked-library roots. Their names, workspace paths, and availability are derived from the filesystem; the OS link remains the only target mapping fact.

Media Library entries are runtime/search projections, not project facts. Each entry returns a canonical content locator plus display and capability projection. It does not assign AssetEntity IDs, require import membership, persist target paths, or own generated/package/document lifecycle.

Repository-local Git hygiene is conditional infrastructure, not a Media Library dependency. When the workspace belongs to a Git repository, link creation and relink MUST maintain and verify the exact repository-local exclude rule before completing. When Git explicitly reports that the workspace is not a repository, link operations proceed without Git state; other Git inspection, write, or verification failures remain visible so a real repository cannot silently expose a physical link target.

VS Code's built-in Git extension cannot traverse a pathspec below a workspace symlink. Decoration-only settings do not prevent that Git invocation. When at least one managed linked Media Library exists, the Host therefore offers an explicit compatibility action that writes only `git.enabled = false` at the owning `WorkspaceFolder` scope. The adapter records whether it wrote the value and the prior folder-level value. Removing the last managed link restores only an unchanged plugin-owned `false`; a user-modified value is preserved, and a folder with no link and no ownership record is never mutated. This compatibility setting is Host state, not a Media Library path fact or resolver input.

Alternative rejected: rename Asset Library and AssetSource to Media Library while keeping `library.json`. This preserves the duplicate catalog under new terminology and does not simplify the system.

### 2. Source classification does not enter the read contract

The system does not define a closed `workspace | linked-local | cloud-synced | generated | external-package` AssetSource union. Those labels mix access location, synchronization, ownership, provenance, and trust.

Linked files use ordinary workspace-file locators. A cloud provider may synchronize a local directory that the user links, but provider credentials and sync lifecycle remain provider-owned. Generated output and external packages retain their owner-specific identities. Media Library may display derived origin badges, but origin does not select a second content resolver.

### 3. Creative Entity binds directly to representation references

`EntityAssetBinding` becomes `EntityRepresentationBinding` in one breaking migration. Its target is a closed representation-reference union covering:

- workspace file locator, including `neko/assets/<libraryName>/...`;
- stable document-entry locator;
- generated-output identity with revision/digest preconditions;
- package-owned representation reference for genuine multi-file packages.

The binding retains entity identity, role, confirmation status, availability, default selection, provenance of the binding decision, confidence, and timestamps. It does not contain cache paths, Webview/Engine tokens, link targets, or AssetEntity IDs.

Exact TypeScript names and locator fields are frozen after the content I/O prerequisites. The current cache-coupled `ResourceRef` is migration input, not the target public type.

### 4. Ordinary files are path-addressed and fail visibly after movement

Ordinary workspace and linked files persist a normalized workspace-relative locator and optional fingerprint precondition. If the path no longer resolves or resolves to different content, the binding becomes orphaned and presents explicit rebind. Fingerprint/search evidence may suggest candidates but must not rewrite confirmed bindings automatically.

Alternative rejected: a general `resourceId -> locator` registry. It would reintroduce a required catalog, reconciliation authority, rename semantics, and another persistence lifecycle. Generated outputs and packages may keep stable IDs because their existing owners already provide that authority.

### 5. Multi-file resources use narrow package ownership

Live2D bundles, model-plus-texture sets, voice/motion packages, and other real composites use a package-owned manifest that describes roles and capabilities. A package reference may be bound to an entity directly. It does not recreate a generic AssetEntity with character, object, or scene semantics.

### 6. User actions express actual ownership changes

The old save/import/promote-to-Asset operation is removed. User actions are explicit:

- add, relink, or remove a Media Library link;
- retain a generated output under its generated-output owner;
- copy bytes to an explicitly selected writable Media Library directory;
- bind or rebind a resource representation to a Creative Entity;
- import/install an external package through its package owner.

Removing a library deletes only the link. Copying or deleting through a linked directory is a real mutation of the external target and therefore requires an explicit writable target, authorization, conflict policy, and user intent. It must not be inferred from catalog membership.

### 7. Search and technical metadata remain projections

Filename, MIME, dimensions, duration, codec, availability, recent use, OCR/ASR/vision evidence, and semantic matches remain rebuildable projections. They are keyed by canonical locator and fingerprint and return that locator. Discovery never writes entity facts or bindings.

User-authored legacy metadata without a surviving owner is not silently copied into projection or entity metadata. It remains in the immutable migration archive and an unresolved migration report until the user explicitly assigns it or discards the archive.

### 8. Legacy migration is explicit and destructive only after confirmation

Inspection reads `library.json`, AssetEntity bindings, `project://assets/` references, old APIs, and search data without using them for normal runtime resolution. It classifies records into:

- deterministic resource locator/reference migration;
- deterministic existing Creative Entity reference;
- proposed Creative Entity creation/merge requiring confirmation;
- owner-specific provenance transferable to generated/package records;
- rebuildable projection data;
- unresolved metadata retained only in the migration archive/report.

Before writing, the migration stores an immutable content-addressed copy under a migration-only project archive and records the inspected project revision/digest. Changed input, ambiguous identity, missing content, or unsupported schema stops the write. After confirmed migration, runtime legacy readers are poisoned and removed; the archive is never a fallback source.

## Risks / Trade-offs

- **[Ordinary file rename breaks a binding]** -> Mark it orphaned, provide fingerprint-backed suggestions, and require explicit rebind rather than introducing a registry.
- **[Legacy metadata has no target owner]** -> Preserve it in the immutable migration archive and report; never hide data loss or contaminate Creative Entity metadata.
- **[Large producer/consumer migration]** -> Freeze prerequisite locator contracts first, migrate vertically in one non-released change, then poison and delete the old path before acceptance.
- **[Media Library becomes a god service]** -> Limit it to projection composition and bounded link/file actions; synchronization, packages, generated outputs, content reads, and cache retain separate owners.
- **[Copy/delete through a link mutates external data]** -> Require explicit destination/capability checks and user intent; link removal remains target-preserving.
- **[Search projection temporarily duplicates entries]** -> Canonicalize by locator and fingerprint, rebuild affected partitions, and test that legacy Asset partitions cannot contribute successful results.
- **[VS Code Git rejects files below a workspace symlink]** -> With explicit user confirmation, disable built-in Git only for the owning workspace folder while links exist; track configuration ownership and restore without overwriting later user changes.

## Migration Plan

1. Complete and verify workspace-link, derived-representation, and content-locator prerequisites.
2. Freeze the representation-reference union, entity binding schema, Media Library projection entry, and safe migration diagnostic contracts; add poison fixtures for every legacy success path.
3. Implement read-only legacy inspection, immutable backup, classification, dry-run plan, confirmation, revision preconditions, and recovery tests.
4. Migrate Creative Entity bindings and all Canvas, Cut, Agent, Search, Tools, TUI, and VS Code consumers to direct representation references.
5. Replace Asset Library UI/actions with Media Library file actions, generated retention, package import, and entity bind/rebind actions.
6. Rebuild derived search/recent/availability projections from current locators.
7. Poison then delete AssetEntity/Variant/File contracts and services, `library.json` runtime storage, `project://assets/` resolver, Asset Extension APIs, commands, aliases, search partitions, and import/promote adapters.
8. Update architecture/domain/package documentation and run full contract, migration, build, test, legacy-debt, unused, Agent evaluation, and VS Code runtime validation.

Rollback before confirmed migration leaves project bytes unchanged. After migration, rollback restores the immutable archive only through an explicit migration recovery operation; normal runtime never reads it.

## Open Questions

None. Exact field names are delegated to the prerequisite stable locator contract, but the ownership, failure, and migration semantics are fixed here.
