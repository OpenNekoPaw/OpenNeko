> Scope reconciliation (2026-08-13):
> [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/)
> supersedes `identity`/Entity Asset conversion. This change covers local managed Asset packages only;
> remote distribution requires a separate future OpenSpec. The Asset Library remains one user-global
> managed package owner; projects keep exact revision pins and do not create a workspace Asset Library.
> Project `.neko` and Media Library binding changes belong to
> [`separate-project-facts-local-state-and-media-bindings`](../separate-project-facts-local-state-and-media-bindings/).

## Why

OpenNeko has an owned Asset directory and a flat path-derived catalog, but that model cannot express a
reusable package's stable identity, immutable revisions, dependency closure, integrity, or safe local
removal. Ordinary workspace and Media Library files must remain directly usable without being silently
promoted into another catalog.

## What Changes

- Keep Asset Library and Media Library as distinct models: Asset Library owns explicitly imported or
  installed reusable packages; Media Library exposes ordinary linked files through `ContentLocator`.
- Replace path-derived Asset identity with a strict local manifest using stable `assetId`, user-managed
  immutable revision, digest, typed metadata, dependencies, provenance, license, and package-relative members.
- Add verified local staging, atomic dependency-closure install, exact local lookup, update-head,
  uninstall, garbage collection, and project/dependency pin diagnostics.
- Expose Installed Assets as an owner-preserving Resources source with local search, import/install,
  update, remove-record, inspect, uninstall, and garbage-collection intents.
- Define ordinary removal as membership removal only. It preserves source files, installed revisions,
  blobs, and project references.
- Keep each Resources source fail-local: an invalid Project composition may diagnose Project Elements,
  but cannot make Installed Assets, Project Files, or Shared Media unavailable.
- **BREAKING**: retire successful flat-file identity based on filename/path. Existing bytes remain
  untouched and enter the managed library only through explicit import.
- Exclude network repositories, publication, synchronization, credentials, remote heads, tombstones,
  reconciliation, transfer checkpoints, and Entity Assets from this change.

## Capabilities

### New Capabilities

- `manifest-backed-asset-library`: strict local package identity, revisions, dependencies, storage,
  import/install/update/remove/uninstall/garbage-collection lifecycle, and local projection.
- `asset-library-resource-surface`: Installed Assets browsing and local management inside Resources.

### Modified Capabilities

- `media-library-resource-entry`: ordinary files remain catalog-free and directly locator-addressed.
- `legacy-asset-catalog-retirement`: retired AssetEntity/`library.json` data remains outside runtime;
  no compatibility import or automatic inventory is introduced.

## Impact

- `@neko/assets-domain` owns manifest and local lifecycle contracts; `@neko/assets-node` owns local
  package storage and verified filesystem operations; `@neko/assets-webview` owns presentation.
- `packages/local-metadata` may store mutable membership and rebuildable local search projection, but
  installed manifests and bytes remain the Asset authority.
- `apps/neko-desktop` supplies sender-bound IPC and Host file adapters only; it does not own Asset rules.
- Existing `~/.neko/assets` bytes, workspace files, Media Library targets, Entity records, Character
  projects, and World projects are never silently converted, rewritten, uploaded, or deleted.
