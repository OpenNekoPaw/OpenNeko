## Why

The workspace currently repeats the product prefix in every physical package directory and splits internal package identities across `@neko/*` and multiple `@neko-<domain>/*` scopes. This leaves the newly converged ownership topology harder to navigate, makes package identity inconsistent with a single repository owner, and contradicts the documented requirement for a deterministic directory-to-package mapping.

## What Changes

- **BREAKING** Replace all internal package identities with the single `@neko/*` scope, using `<domain>-<role>` names for split runtime families.
- **BREAKING** Replace the flat `packages/neko-*` layout with `packages/<domain>/<role>` for multi-package families and `packages/<name>` for single-package owners.
- Update every workspace dependency, import, export, build entry, evaluator, architecture rule, quality ledger, fixture, and documentation reference to the canonical names and paths.
- Remove old `@neko-<domain>/*` identities and `packages/neko-*` paths without aliases, compatibility exports, or fallback discovery.
- Enforce the canonical mapping through workspace/package-role validation so future packages cannot reintroduce mixed scopes or redundant prefixes.

## Capabilities

### New Capabilities

- `workspace-package-naming`: Defines the canonical package identity, physical directory layout, discovery rules, and fail-visible validation for all workspace packages.

### Modified Capabilities

None.

## Impact

- Affects all package roles under `packages/`: contracts, domain/application, Node adapters, browser/Webview adapters, infrastructure, content-only packages, retained kernels, and test support entries.
- Affects the Desktop application only as a consumer/composition root: its package dependencies, imports, build configuration, typed boundary tests, and bundled-resource paths change, but no domain ownership moves into `apps/neko-desktop`.
- Updates root workspace manifests, the pnpm lockfile, TypeScript/Vite/Vitest/ESLint/Prettier/Knip/dependency-cruiser configuration, quality ledgers, architecture scripts, Agent evaluation metadata, OpenSpec references, and architecture/development documentation.
- Internal package identities and repository paths are intentionally breaking. No legacy package aliases or old directory paths remain valid after migration.
