## Context

OpenNeko currently has two useful but different resource paths:

- Media Library exposes files from linked directories through ordinary content locators. Its value is
  that files remain immediately usable without registration or catalog membership.
- The Assets packages expose a global owned-library runtime and an `AssetManifest`, including `remote`
  and `registry` source shapes. The runtime is still flat-file and path-ID oriented, and no remote
  publish/download/reconciliation path implements those source shapes.

The archived “single Media Library” decision correctly removed the legacy AssetEntity catalog from the
ordinary file path, but overreached by prohibiting any managed Asset Library. Reusable templates,
presets, models, bundles, and Entity Assets need stable identity, immutable revisions, dependencies,
integrity, installation, and cloud distribution. Restoring those properties must not make Asset
membership a prerequisite for opening a file.

This change spans Asset contracts, Node storage and transfer adapters, Resource Browser UI, local
metadata projections, and Desktop composition. It also migrates user-owned flat Asset files, so failed
or ambiguous migration must remain visible and non-destructive.

## Goals / Non-Goals

**Goals:**

- Preserve Media Library as the single direct file-resource entry for arbitrary workspace and linked
  files.
- Define Asset Library as an explicit managed-package boundary for reusable, versioned Assets.
- Make `(assetId, revision, digest)` the durable identity of an immutable Asset revision.
- Provide local-first cloud publication and replication with verified atomic installation, offline use,
  dependency transfer, resumable progress, and visible conflicts.
- Keep credentials, remote state, local installed data, and UI projections in their correct authorities.
- Provide one canonical Asset path and poison path-derived IDs and legacy catalog fallback.

**Non-Goals:**

- Cataloging, uploading, or synchronizing arbitrary workspace or Media Library files.
- Replacing `ContentLocator`, filesystem links, provider-owned synchronized directories, or project
  portability snapshots.
- A cloud multi-tenant service implementation, collaboration protocol, arbitrary provider registry, or
  generic filesystem synchronization engine.
- Background synchronization of mutable Project Entity facts.
- Preserving successful reads through legacy AssetEntity, `library.json`, or path-derived Asset IDs.

## Decisions

### 1. Asset Library manages packages; Media Library exposes files

An item enters Asset Library only through explicit import, install, or publish intent and a validated
manifest. Discovery of a workspace or linked file never allocates an Asset ID. Asset packages may copy
owned bytes or declare validated package-relative members and dependencies; they cannot persist an
absolute path or a Media Library link target.

This keeps the original simplification of `media-library-resource-entry`: ordinary files are read by
their owning `ContentLocator` path. Asset Library adds reusable-package lifecycle rather than becoming a
generic resource resolver.

Alternative considered: use Media Library folders as the Asset catalog. Rejected because filesystem
presence cannot express immutable revisions, dependency closure, publication state, or package
integrity without rebuilding the catalog that was intentionally removed.

### 2. Installed immutable revision is the offline authority

The manifest contract owned by `@neko/assets-domain` will require stable `assetId`, immutable `revision`,
package `digest`, schema version, type metadata, dependencies, provenance, license, and package-relative
members. A mutable local record points an Asset channel/head to an installed immutable revision, but
never changes the content of that revision.

Installed manifests and verified bytes below the managed Asset storage root are the runtime authority.
SQLite rows for search, remote heads, transfer progress, last reconciliation cursor, and diagnostics are
rebuildable projections/state; losing them cannot make installed Assets unusable. Credentials and
refresh tokens remain in the operating-system credential authority and are referenced only by opaque
account IDs.

The manifest `source` field is provenance only. Existing `remote` / `registry` values are inspected during
migration: portable non-secret origin identifiers may remain as provenance, while provider endpoint,
account routing, signed URL, credential-bearing URI, and synchronization policy move to machine-local
`(accountRef, repositoryRef, assetId)` binding state. No manifest source variant is invoked as a runtime
path or network resolver.

Alternative considered: make the remote catalog authoritative on every open. Rejected because it breaks
offline use and turns network/provider availability into a local creative-runtime dependency.

### 3. Cloud sync is immutable package replication, not live file sync

`@neko/assets-domain` owns a narrow `AssetRemoteRepositoryPort` vocabulary for listing remote heads,
reading manifests, transferring content-addressed blobs, committing a revision, and publishing or
reading tombstones. It also owns the sync planner/state machine and typed diagnostics. The port models a
real replacement point—remote repository implementations—without exposing provider SDK types.

`@neko/assets-node` owns filesystem staging, digest verification, atomic install, resumable transfer
checkpoints, and a concrete remote adapter. A download follows:

1. resolve the requested remote revision and dependency closure;
2. stage manifests and missing blobs outside the installed namespace;
3. verify schema, IDs, dependency graph, size limits, and digests;
4. atomically commit every validated package revision;
5. update rebuildable projections and emit completion.

A publish validates and snapshots local package content, uploads missing content-addressed blobs, then
uses compare-and-set on the expected remote head to commit a new immutable manifest revision. Partial
uploads never become visible revisions. The same `(assetId, revision)` with a different digest is an
integrity conflict and must fail closed.

Alternative considered: generic bidirectional directory sync. Rejected because its rename/delete/conflict
semantics are incompatible with immutable package revisions and would leak provider behavior into file
resolution.

### 4. Remote deletion and update never destroy local or project data

A remote tombstone removes the remote head from normal discovery but does not uninstall a verified local
revision, delete package bytes referenced by a project, or mutate a Project Entity instantiated from an
Entity Asset. Uninstall and local garbage collection are separate explicit operations and must respect
dependency and project pins.

Remote updates produce an update-available projection. Installation may move a local channel/head only
after the new revision and its dependency closure commit successfully. Entity-specific diff/apply is
owned by the Entity change; Asset sync only installs the immutable Entity Asset revision.

Alternative considered: mirror remote deletion locally. Rejected because remote account changes must not
silently destroy valuable offline or project data.

The default Asset Library delete icon means “remove record from library”. It changes only the mutable local
membership/head projection and leaves source files, installed immutable revisions, blobs, project pins and remote
revisions intact. Explicit uninstall and unreferenced-byte garbage collection remain separate commands with their
own blocker analysis. The current path-scanner plus `shell.trashItem` implementation cannot satisfy this contract:
the Assets-owned record repository must persist active/removed membership, and removed entries must stay absent
after restart without hiding or deleting ordinary Media Library files.

### 5. UI and Desktop depend only on typed public ports

| Owner                              | Package role and canonical public entry                          | Producer                                                            | Consumer                                | Runtime boundary               | Replaced path                                     | User-data impact                                                      |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Asset contracts and orchestration  | `packages/assets/domain` via `@neko/assets-domain`               | Manifest codecs, lifecycle/sync planner, diagnostics                | Node, Webview, Desktop adapters, Entity | Host-neutral TypeScript        | Flat `GlobalAssetItem` and path-derived identity  | Defines validated replacement facts; no direct IO                     |
| Local package and transfer runtime | `packages/assets/node` via `@neko/assets-node`                   | Managed storage, staging, integrity, atomic install, remote adapter | Desktop composition                     | Node only                      | Direct flat-file copy/remove                      | Migrates owned bytes only after archive/validation                    |
| Asset Library presentation         | `packages/assets/webview` via `@neko/assets-webview`             | Asset source UI and typed intents                                   | Desktop renderer                        | Renderer/Webview sandbox       | Generic flat Asset list and `materials` ambiguity | No durable facts; shows diagnostics and progress                      |
| Asset membership persistence       | Assets domain contract plus `packages/local-metadata` repository | Active/removed membership and one-time existing-file registration   | Asset Node/domain runtime               | Host-neutral contract + SQLite | Path scan as catalog authority                    | Preserved user choice; removal never deletes source or package bytes  |
| Rebuildable local state            | `packages/local-metadata` public local-metadata port             | Remote heads, cursors, checkpoints, projections                     | Asset Node/domain runtime               | Node/SQLite                    | Ad hoc or absent sync state                       | May be deleted and rebuilt; contains no credentials or owned bytes    |
| Application composition            | `apps/neko-desktop` public preload contract and composition root | Window/account lifecycle, IPC binding, OS credential adapter wiring | Renderer and package services           | Electron Main/preload/renderer | App-owned Asset business logic                    | No new business authority; only Electron sender binding and lifecycle |

Production logic remains in `apps/neko-desktop` only where Electron is essential: sender-bound IPC,
window lifecycle, preload projection, app paths, and operating-system credential access. Manifest rules,
sync planning, storage, provider semantics, and Asset operations remain package-owned and independently
testable.

### 6. Asset and Entity share distribution, not semantic authority

`identity` is a first-class Asset type. Its package can contain a frozen Entity semantic snapshot plus
package-owned representations, but Asset Library does not merge project facts or become the live Entity
authority. The Entity domain converts between Project Entity and Entity Asset and records provenance.
The generic cloud sync path distributes Entity Asset revisions; no `EntitySyncService` or parallel global
Entity catalog is created.

## Risks / Trade-offs

- **[Risk] A new Asset Library is mistaken for the retired generic catalog** → Require explicit package
  lifecycle, forbid discovery-created IDs, and test that ordinary locators work without Asset records.
- **[Risk] Provider interruption leaves corrupt local Assets** → Stage outside installed storage, verify
  the whole dependency closure, and atomically commit only valid immutable revisions.
- **[Risk] Remote conflicts overwrite another publication** → Use expected-head compare-and-set and expose
  a conflict that requires refresh or an explicitly new revision.
- **[Risk] Large packages consume duplicate staging space** → Deduplicate by digest, expose estimated size,
  support cancellation/resume, and garbage-collect only unreferenced staging blobs.
- **[Risk] Flat-file migration invents metadata** → Archive original inputs, classify each file, require
  confirmation for ambiguous package identity, and preserve unresolved files untouched.
- **[Trade-off] Immutable revisions require a new revision for metadata corrections** → Accept this to keep
  digest identity, reproducibility, and safe offline/project pins.

## Migration Plan

1. Introduce strict manifest/revision/package codecs and new public lifecycle ports without routing normal
   calls through them yet.
2. Implement local staging, verification, atomic install, and projection rebuild; add poison tests for
   path-derived IDs and legacy handlers.
3. Inspect current managed Asset files, create a content-addressed recovery archive, classify explicit
   reusable Assets, validate/redact existing remote/registry source values, and require user confirmation
   for ambiguous grouping/metadata.
4. Commit validated packages, rebuild Asset Library projections, and leave ordinary or unresolved files
   accessible through their existing file owners.
5. Add the remote repository adapter and key-free contract tests, then add real provider evaluation behind
   explicit credentials.
6. Switch Resource Browser and Desktop IPC to the new public ports and delete the flat runtime path.

Rollback before the final switch restores the archived flat files and old application version. After the
canonical path switch, rollback is read-only/export-based: immutable packages remain intact, but legacy
runtime success is not re-enabled.

## Open Questions

- Which cloud repository provider and authentication flow is selected for the first implementation?
- What package/revision size limits and remote retention policy apply to the first provider?
- Is remote publication private-only initially, or must public discovery/license acceptance ship in the
  same implementation?
