## Context

`quality/package-roles.json` is used as architectural and cleanup evidence, but `productStatus` is
currently curated independently from the production import graph. `@neko/entity-node` is imported by
active production runtimes, `@neko/search-domain` validators are imported by Agent/Local Metadata, and
Search in turn executes Chara-owned guards, while all three packages are labeled `retained-kernel`.

Package status and capability availability answer different questions. A package may ship active
validators while its search UI/execution capability remains unavailable. Using one field for both makes
either the build graph or the product catalog false.

## Goals / Non-Goals

**Goals:**

- Make runtime-reachable package status mechanically verifiable.
- Preserve a separate capability-level description of exposed, dormant, experimental, and retired use.
- Correct the current Chara, Entity Node and Search classifications without moving stable code only to
  satisfy a label. The Entity change is catalog metadata only and does not redesign excluded behavior.
- Prevent cleanup from deleting code used by a supported application path.

**Non-Goals:**

- Declaring every export in a reachable package an exposed product feature.
- Counting test, dev-tool, type-only, migration-only, example, or OpenSpec references as production use.
- Splitting packages merely to obtain a more granular status label.

## Decisions

### 1. Derive package activity from value-import reachability

The repository quality owner computes a directed graph from supported application composition entries
to workspace packages. Static value imports, re-exports, declared package dependencies required by
those imports, and resolvable production dynamic imports form edges. `import type`, tests, fixtures,
scripts, tooling, docs, and explicitly migration-only modules do not.

Any package reachable from `apps/neko-desktop` production entries is `active-product` at package level.
A `retained-kernel` or `inactive-prototype` package must be unreachable from supported application
production code. A removed package must also be absent from normal workspace consumers.

Alternative rejected: infer activity from package dependencies alone. Declared dependencies may be
unused or type-only and cannot prove a runtime path.

### 2. Keep capability state in the capability catalog

Feature exposure is recorded per capability/operation in the Desktop capability catalog. An
`active-product` package can contain a dormant capability only when the active imports are narrower
supporting surfaces and the catalog does not advertise the dormant operation.

For the current graph:

- `@neko/entity-node` becomes `active-product` because Assets runtime executes its resource reader.
- `@neko/search-domain` becomes `active-product` because production validators are executed by Agent Webview and
  Local Metadata.
- `@neko/chara` becomes `active-product` because Search-owned production validation executes its guards.
- Operation/UI exposure remains an independent capability-catalog concern.

Alternative rejected: move validators to a generic package so `search-domain` can remain retained.
These codecs validate Search-owned data; moving them would falsify ownership and add churn.

### 3. Add one repository gate and auditable evidence

The canonical quality script reads workspace metadata, supported app entries, source imports, package
roles, and capability catalog evidence. It reports a shortest production reachability path for every
status mismatch. Exceptions require an explicit kind, owner, reason, expiry/removal condition, and a
path test; generic allowlists are forbidden.

The gate is invoked by package boundary/quality checks and CI. `quality/package-roles.json` remains the
human-reviewed declaration, while reachability is computed evidence—not another committed status
source.

### 4. Keep production code in owning packages

No business logic moves into `apps/neko-desktop`. Application code remains composition-only. Entity
Node owns Node resource resolution; Search Domain owns Search validators; consumers use their public
entries. This change updates governance and classification, not user data or runtime semantics.

## Risks / Trade-offs

- **[Dynamic imports evade static analysis]** → Resolve literal workspace imports and require explicit,
  owner-scoped declarations plus runtime path tests for non-literal registries.
- **[A large package is `active-product` for one small surface]** → Track capability state separately and propose a
  package split only when independent responsibility/dependency closure justifies it.
- **[Generated or conditional entries create false positives]** → Use the same supported production
  entries and conditions as build/package checks and include reachability paths in diagnostics.

## Migration Plan

1. Define graph inputs and status invariants in quality contracts.
2. Add characterization fixtures for value, type-only, test-only, dynamic, and migration-only imports.
3. Update Entity Node and Search Domain package status and capability evidence.
4. Wire the gate into local quality/CI and document status transition procedure.

Rollback removes the gate and role corrections only; no persistent data migration is involved.

## Open Questions

None. New supported application roots must be explicitly added to quality configuration in the same
change that introduces them.
