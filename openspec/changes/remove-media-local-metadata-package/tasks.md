## 1. Remove the zero-consumer package

- [x] 1.1 Delete `packages/media-local-metadata/`.

## 2. Sync quality ledgers

- [x] 2.1 Remove the `@neko/media-local-metadata` entry from `quality/package-roles.json`.
- [x] 2.2 Remove the `packages/media-local-metadata` findings block from `quality/internal-versioning-debt.json`.

## 3. Verification

- [x] 3.1 `pnpm check:package-roles`, `check:package-product-status`, `check:package-boundaries`.
- [x] 3.2 `pnpm check:no-internal-versioning`, `check:unused`, `check:openspec`.
- [x] 3.3 Typecheck/test `@neko/local-metadata` and `@neko/search-local-metadata` (the surviving owners).
