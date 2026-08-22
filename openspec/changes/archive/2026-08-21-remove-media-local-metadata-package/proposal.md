## Why

`@neko/media-local-metadata` is a zero-consumer thin wrapper: it only re-exports one
`createNodeWorkspaceMediaMetadataBinding` factory that opens the SQLite store, resolves workspace
identity, and returns the `MediaMetadataRepository` already owned by `@neko/local-metadata`. The same
workspace-binding pattern already exists in `@neko/search/local-metadata`, and production media metadata
consumers use `@neko/local-metadata` directly (for example
`packages/assets/node/src/workspace-media-library-sync-binding.ts`). The package has no production
import, no dynamic load, no Desktop composition, no active OpenSpec, and no roadmap position; its
`internal-versioning-debt.json` entries already reference a deleted `media-metadata-migration.test.ts`.

## What Changes

- Delete the `packages/media-local-metadata` workspace package and its `package-roles.json` entry.
- Remove the stale `packages/media-local-metadata` findings block from `internal-versioning-debt.json`.
- No code is migrated to another package: the media metadata repository remains owned by
  `@neko/local-metadata`, and the search binding remains the active Node workspace metadata binding.

## Capabilities

### New Capabilities

- `media-local-metadata-package-removal`: Deletion rule for the zero-consumer `@neko/media-local-metadata`
  shell without relocating any media metadata repository ownership.

### Modified Capabilities

<!-- None. -->

## Impact

- Owning responsibility: `@neko/local-metadata` keeps the `MediaMetadataRepository` and SQLite store;
  `@neko/search/local-metadata` keeps the active workspace metadata binding.
- Affected package roles: remove `packages/media-local-metadata` from the workspace and the package-roles
  ledger. No user-data shape, persisted data, or third-party contract changes.
