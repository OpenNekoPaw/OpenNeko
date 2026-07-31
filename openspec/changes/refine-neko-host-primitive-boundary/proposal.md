## Why

`@neko/host` is intended to contain host-neutral primitive ports, but it also owns the hard-coded
Desktop application identity, storage migration categories, product command catalog, a mutable
command registry, and workspace policy helpers. Without admission rules it can become the next broad
manager package after Platform is removed.

## What Changes

- Define positive admission criteria for host-neutral primitive ports, values, diagnostics, and
  immutable projections, including consumer and runtime-boundary evidence.
- Define excluded content: product application identities, storage migration plans, domain command
  catalogs/payloads, mutable registries/managers, concrete I/O, and ownerless shared DTOs.
- Move `application.ts` to a Desktop-owned shared contract, product commands to their owning
  domain/application contracts, and mutable registry implementations to the Desktop composition
  root or owning runtime.
- Audit `workspace-content-settings.ts` and `projection-attachment.ts` export by export; retain only
  host-neutral immutable primitives, otherwise move them to the content/domain owner.
- Migrate consumers directly and add import-boundary/path assertions; do not retain broad root
  re-exports, compatibility aliases, or fallback registries.

## Capabilities

### New Capabilities

- `host-primitive-boundary`: Defines `@neko/host` admission/exclusion rules, current-export
  disposition, implementation placement, and enforceable dependency constraints.

### Modified Capabilities

None.

## Impact

- Affects `packages/neko-host`, Desktop Main/shared composition and contracts,
  `packages/neko-agent-types`, command consumers, workspace-content helpers, manifests, imports,
  tests, and architecture guards.
- Package identity remains `@neko/host`; this change narrows responsibility rather than creating
  per-domain Host packages.
- Must complete before final package identity normalization.
