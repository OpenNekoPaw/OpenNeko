## Context

`packages/media-local-metadata` (`@neko/media-local-metadata`) contains three source files: `index.ts`,
`node-workspace-media-metadata-binding.ts`, and its test. The only implementation opens
`@neko/local-metadata`'s SQLite store, resolves a workspace identity, initializes the media metadata
tables, and returns the `MediaMetadataRepository`. It duplicates the exact workspace-binding shape that
`@neko/search/local-metadata` already provides, and it is imported by nothing in `apps/`, `packages/`, or
`scripts/`.

## Goals / Non-Goals

**Goals:**

- Remove the zero-consumer package and its ledger entries without relocating any repository ownership.

**Non-Goals:**

- Removing `@neko/local-metadata`, `@neko/search-local-metadata`, or the media metadata repository.
- Creating a replacement binding or facade.
- Touching `@neko/entity-webview` or `@neko/quality` (both are retained-kernel with a documented owner).

## Decisions

### 1. Delete the shell, keep the owner

`@neko/local-metadata` owns `MediaMetadataRepository` and the SQLite schema; `@neko/search/local-metadata`
owns the active Node workspace metadata binding. `@neko/media-local-metadata` adds no independent owner,
contract, or consumer, so it is deleted rather than marked retained.

### 2. Ledger synchronization is exact

Remove the `@neko/media-local-metadata` entry from `quality/package-roles.json` and its findings block
from `quality/internal-versioning-debt.json`. No allowlist or gate is widened.

## Replacement Plan

1. Create OpenSpec artifacts.
2. Delete the package directory.
3. Remove the two ledger entries.
4. Run package-roles/product-status/boundaries/no-internal-versioning/unused/openspec gates and
   `@neko/local-metadata`/`@neko/search-local-metadata` typecheck/test.

## Risks / Trade-offs

- **Ledger drift** → the package-roles and internal-versioning-debt ledgers are the only machine-readable
  references; both are removed in the same change and re-verified by `check:package-roles` and
  `check:no-internal-versioning`.
