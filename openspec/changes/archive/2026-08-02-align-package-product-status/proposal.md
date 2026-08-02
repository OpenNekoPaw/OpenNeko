## Why

The package catalog currently marks `@neko/chara`, `@neko/entity-node` and `@neko/search-domain` as
retained kernels even though active production runtimes import them. This makes package health reports
and cleanup decisions disagree with the code that actually ships.

## What Changes

- Define package product status from production runtime reachability from the supported application
  composition root, not from historical intent or whether every capability in a package is exposed.
- Distinguish package reachability from feature/capability availability so an active validator or Node
  adapter does not incorrectly advertise a dormant end-user feature.
- Mark runtime-reachable package code as `active-product` and record dormant capabilities in the
  capability catalog rather than downgrading the whole package.
- Add a repository gate that compares declared package status with runtime dependency reachability while
  excluding tests, tooling, type-only imports, and explicit migration-only code.
- Require `productStatus` transitions to identify the owning product path, consumers, replacement/removal
  condition, and validation evidence.

## Capabilities

### New Capabilities

- `package-product-status-reachability`: Canonical rules and automated validation connecting package
  product status to supported application runtime reachability.

### Modified Capabilities

<!-- None. -->

## Impact

- Owning responsibility: repository quality governance owns status derivation; individual domain packages
  own their features but cannot self-declare unreachable status contrary to application reachability.
- Affected package roles: `quality/package-roles.json`, package-boundary tooling, Desktop production
  dependency graph, `@neko/chara`, `@neko/entity-node`, `@neko/search-domain`, their production
  consumers, and Local Metadata.
- No user data or runtime behavior changes are intended; this change prevents unsafe cleanup and makes
  release/audit evidence reflect the shipped graph.
