## Context

`packages/neko-types` publishes `@neko/shared` and is consumed by nearly the entire workspace. It
contains true L0 foundations but also domain DTOs, React/icon exports, Node helpers, local metadata,
and project-file I/O. A single bulk split would be high risk because dependency direction and user
data ownership differ by export family.

## Goals / Non-Goals

**Goals:**

- Establish a measurable admission rule for `@neko/shared`.
- Move exports to package-owned L0, L1 Node/host, or L2 UI owners without cycles.
- Preserve local project/metadata data and make removed shared entries fail.
- Leave a minimal stable shared foundation before its directory is renamed.

**Non-Goals:**

- Splitting by file size or creating a package per type.
- Moving stable cross-domain primitives solely to reduce line count.
- Renaming `packages/neko-types` in this change.

## Decisions

### Classify exports, not folders

The ledger records export/subpath, semantic owner, L0/L1/L2 layer, runtime dependencies, independent
consumers, target, and migration/data impact. Barrel reachability and non-manifest consumers are
included.

### Apply a strict Shared admission rule

An export remains only when it is host-neutral, low dependency, semantically stable across at least
two independent domains, and not owned by one bounded context. Logger, i18n, theme/error foundations
can qualify; domain DTOs, React components, concrete I/O, metadata stores, and Node helpers do not.

Alternative: keep anything used twice. Rejected because two consumers do not erase a clear domain or
runtime owner.

### Migrate one ownership family at a time

Package-owned contracts move with all producers/consumers. L2 components/icons move to `@neko/ui`.
L1 behavior moves to an existing owner or explicit Node subpath. A new package requires a real
dependency/build/lifecycle boundary and cannot use `shared`, `common`, or `platform` as its owner.

### Protect persisted data separately from API compatibility

Old imports and exports are not preserved. Project files and local metadata are protected with codec,
migration, rebuild, or rejection tests according to their value. API breakage is fail-visible while
data handling remains explicit.

## Risks / Trade-offs

- [Wide blast radius] -> Use owner-sized batches with producer/consumer tests and full repository
  gates at stable checkpoints.
- [Circular dependency appears after moving DTOs] -> Define L0 owning contracts first and run
  dependency checks before implementations.
- [Node code leaks into browser bundles] -> Add entrypoint and renderer/Webview import guards.
- [Metadata/project data is silently lost] -> Inventory storage and exercise synthetic migration
  fixtures before removing the old implementation.

## Migration Plan

1. Generate and approve the full export ledger.
2. Move domain DTO families to owning package L0 entries.
3. Move UI/icon exports to `@neko/ui`.
4. Move Node, metadata, path, and project-I/O behavior to owning L1 entries with data tests.
5. Narrow `@neko/shared` exports, poison removed entries, and update architecture guards/docs.
6. Run producer/consumer tests, full build/test/check, dependency/unused/legacy gates, Desktop package,
   and relevant Electron/data-path scenarios.
7. Hand the stable directory rename to the identity normalization change.

Rollback is by ownership batch. Any data migration must keep a tested recovery/rebuild path.

## Open Questions

- Exact export dispositions remain apply-time evidence and must be frozen before code moves.
- Any export with only infrastructure/test consumers needs an explicit rationale rather than being
  counted automatically as cross-domain reuse.
