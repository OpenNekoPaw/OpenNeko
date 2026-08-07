## Why

OpenNeko already exposes a global Asset Library runtime and an `identity` Asset type, but current
architecture documents and archived requirements incorrectly collapse owned reusable Assets into
Media Library file browsing. The remaining flat-file, path-derived catalog cannot provide stable
identity, revisions, dependencies, package integrity, or Entity Asset distribution without recreating
another catalog later. The manifest already models remote and registry origins, but there is no runtime
for publishing, downloading, verifying, reconciling, or working offline with cloud-backed Assets.

## What Changes

- Re-establish Asset Library and Media Library as distinct product/domain models: Asset Library owns
  imported or installed reusable Assets; Media Library exposes linked external directories and files.
- Replace the global flat-file projection and path-derived Asset IDs with manifest-backed Assets using
  stable `assetId`, immutable revision, digest, typed metadata, dependencies, provenance, license, and
  install/remove lifecycle.
- Keep ordinary workspace and Media Library files directly addressable by `ContentLocator`; they do not
  require Asset membership or receive Asset IDs through discovery.
- Add local-first cloud synchronization for explicitly managed Asset packages: immutable revision and
  digest identity, atomic verified install, publish conflict detection, dependency transfer, resumable
  progress, offline use, and non-destructive remote deletion handling.
- Keep cloud Asset synchronization outside Media Library path resolution. It MUST NOT upload arbitrary
  workspace files, traverse linked Media Library directories, or turn a synchronized directory into an
  Asset catalog.
- Separate portable, non-secret Asset provenance from machine-local cloud account/repository binding;
  existing `remote` / `registry` source values no longer act as runtime download resolvers.
- Add Asset Library browsing, search, import/install, update, remove, publish, and dependency diagnostics
  as an explicit Resource Browser source distinct from Media Library.
- Define the ordinary “remove from Asset Library” action as record/membership removal only. It MUST preserve
  source files and installed package bytes; byte deletion remains a separate explicit garbage-collection action.
- Support `identity` / Entity Asset packages as a first-class Asset type while leaving project Entity
  creation, facts, merge, binding, and update application to the Entity owner.
- **BREAKING**: retire successful flat-file Asset identity based on filename/path; existing bytes remain
  untouched and enter validated manifest-backed Assets only through explicit user import, without
  treating legacy `library.json` or ordinary media discovery as the new catalog authority.
- **BREAKING**: reject credential-bearing manifest `remote.uri` / registry routing values in the exact
  package and keep runtime account/repository selection in credential-backed local state.

## Capabilities

### New Capabilities

- `manifest-backed-asset-library`: Stable Asset identity, manifests, revisions, dependencies, storage,
  import/install/update/remove/publish lifecycle, Entity Asset support, and Asset Library projection.
- `asset-library-cloud-sync`: Provider-neutral, local-first publication and replication of immutable
  Asset package revisions with integrity, dependency, conflict, deletion, offline, and credential
  boundaries.
- `asset-library-resource-surface`: Asset Library browsing and management as a distinct Resource Browser
  source with typed Asset operations and diagnostics.

### Modified Capabilities

- `media-library-resource-entry`: Media Library remains the single direct file-resource entry and keeps
  ordinary files catalog-free; only the blanket prohibition on a separate explicitly managed Asset
  Library is narrowed.
- `legacy-asset-catalog-retirement`: Legacy AssetEntity/library.json remains retired, while a new
  manifest-backed Asset Library is allowed only for explicitly imported, installed, or published
  reusable Assets—not as a compatibility destination for ordinary media.

## Impact

- Owning responsibility: `@neko/assets-domain` owns Asset manifest and lifecycle contracts;
  `@neko/assets-node` owns local package/file installation adapters; Media Library owners retain link
  and external-file lifecycle; Entity owns semantic project instances and conversion rules.
- Affected package roles: `packages/assets/domain`, `packages/assets/node`, `packages/assets/webview`,
  `packages/content`, `packages/local-metadata`, and `apps/neko-desktop` composition through public Asset
  ports only.
- Remote provider credentials remain in the operating-system credential authority. Remote catalog,
  transfer, and reconciliation rows are rebuildable local state; installed manifests and bytes remain
  the offline runtime authority.
- Affected data: current `~/.neko/assets` flat files, Asset manifests/packages, local Asset catalog
  projection, dependency metadata, thumbnails, and Resource Browser state. User files and Media Library
  targets remain protected and are never silently absorbed.
- The Entity change `manage-project-entities-as-publishable-assets` consumes the generic Asset publish,
  install, version, dependency, and lookup ports defined here; neither change introduces a separate
  global Entity catalog or sync service.
- The current flat scanner/trash command is replaced at this boundary: `shell.trashItem` is not a valid
  implementation of record removal, and restart must not rediscover a removed membership as active.
