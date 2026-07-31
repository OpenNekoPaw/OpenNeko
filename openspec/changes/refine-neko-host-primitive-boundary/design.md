## Context

`@neko/host` currently exports ports and diagnostics alongside `application.ts`, `commands.ts`,
`workspace-content-settings.ts`, and `projection-attachment.ts`. Some content is host-neutral, but
hard-coded Desktop identity, storage migration taxonomy, product command IDs, and a mutable registry
belong to application/domain owners or composition. The package needs a smaller admission policy
before Platform/Shared migrations can use it as a default target.

## Goals / Non-Goals

**Goals:**

- Define enforceable Host admission and exclusion criteria.
- Classify every existing Host export and move non-primitives to one owner.
- Keep only minimal host-neutral ports, values, diagnostics, and immutable projections.
- Place mutable implementations at the runtime/composition owner.

**Non-Goals:**

- Creating per-domain `*-host` packages.
- Moving concrete Electron adapters out of Desktop Main.
- Renaming `@neko/host`.

## Decisions

### Host admission requires neutrality and a real boundary

An admitted export is product/domain neutral, contains no concrete I/O, models a minimal host
capability/value/diagnostic or immutable projection, and has at least two real consumers or a
documented cross-runtime security boundary. Consumers receive narrow ports rather than the full
`NekoHostPorts` aggregate.

### Current exports receive explicit dispositions

| Current area                                                                     | Target                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| primitive environment/workspace/files/path/secret/external ports and diagnostics | retain after export-level audit                                                           |
| `application.ts` Desktop identity, handoff, storage categories/migration         | Desktop-owned shared contract                                                             |
| product command IDs and payloads in `commands.ts`                                | owning domain or Desktop application contract                                             |
| mutable command registry implementation                                          | Desktop composition root or owning runtime                                                |
| `workspace-content-settings.ts`                                                  | retain only immutable host-neutral projection/validation; otherwise content/Desktop owner |
| `projection-attachment.ts`                                                       | retain only if it meets admission and cross-runtime consumer evidence                     |

Moving code is direct; the Host root barrel does not re-export excluded content afterward.

### Keep contracts and implementations separated

Host ports define capability contracts and diagnostics. Desktop Main constructs concrete Electron,
filesystem, secret, and external implementations. Registries/managers with mutable lifecycle belong
where they are constructed and disposed, not in the primitive contract package.

### Enforce by imports and export review

Architecture guards reject application IDs, product command catalogs, manager/registry
implementations, concrete filesystem/Electron code, React, and ownerless domain DTOs in Host.
Package subpath imports are preferred so consumers declare the precise boundary.

## Risks / Trade-offs

- [Moving application contracts creates IPC churn] -> Define the Desktop-owned L0 contract first and
  migrate Main/preload/renderer producers and consumers together.
- [Overly strict admission duplicates primitives] -> Reuse qualifying neutral values and document
  narrower owner differences before creating local alternatives.
- [Workspace policy ownership is ambiguous] -> Classify each helper by input/state/effect and retain
  only immutable host-neutral projection/validation.
- [A mutable registry remains through a barrel] -> Add export-surface and poison-path assertions.

## Migration Plan

1. Inventory every Host export, consumer, mutability/lifecycle, product/domain coupling, and target.
2. Introduce Desktop-owned application contracts and migrate all runtime boundaries.
3. Move product commands/payloads to owners and registries to composition/runtime.
4. Resolve workspace/projection helpers export by export.
5. Narrow Host exports and add architecture/legacy guards.
6. Run producer/consumer tests, Desktop typecheck/build/package, full build/test/check, dependency and
   legacy/unused gates, and real Electron IPC/application-start acceptance.

Rollback is commit-based. Application storage contracts must preserve or explicitly diagnose
existing Desktop data.

## Open Questions

- Exact owners for each product command are chosen from current call paths during the export audit.
- A workspace helper can remain only if its semantics are host-neutral and it carries no concrete
  storage or application policy.
