## Why

`packages/neko-types` publishes `@neko/shared` but contains L0 contracts alongside domain DTOs,
React assets, Node helpers, metadata persistence, and project I/O. Its large consumer count makes
this mixed ownership a dependency-direction risk and a default dumping ground for unrelated code.

## What Changes

- Inventory every `@neko/shared` public export by owner, runtime layer, consumers, and disposition.
- Move domain-specific contracts to package-owned L0 entries, React primitives/icons to `@neko/ui`,
  and Node/host/project-I/O behavior to the owning L1 package or explicit Node entry.
- Retain in `@neko/shared` only low-dependency L0 capabilities with stable semantics and at least two
  independent domain consumers.
- Migrate producers and consumers in owner-sized batches with public-entry and dependency-direction
  tests; poison removed shared exports so they cannot silently fall back.
- Rename `packages/neko-types` only after responsibility convergence and through the separate package
  identity normalization change.

## Capabilities

### New Capabilities

- `shared-layer-ownership`: Defines admission, export inventory, runtime-layer placement, and
  migration requirements for the shared foundation package.

### Modified Capabilities

None.

## Impact

- Affects most workspace packages because `@neko/shared` is widely consumed, especially shared
  contracts, metadata, host-node, project-file I/O, UI/icon exports, and package entry points.
- Requires producer/consumer tests, dependency and architecture guards, full build/test/check gates,
  and explicit protection of project files and local metadata.
- Must complete before renaming `packages/neko-types` to `packages/neko-shared`.
