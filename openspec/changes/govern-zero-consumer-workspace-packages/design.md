## Context

Manifest analysis currently reports no consumers for Agent test-utils, Chara, Quality, Search,
Skills, and Tools Webview, while Tools contracts is consumed only by that unconsumed Webview.
Manifest edges are incomplete evidence: Skills can be loaded as resources, scripts can resolve
packages dynamically, and a host-neutral kernel can intentionally be unintegrated. Governance must
separate these cases without treating package existence as product delivery.

## Goals / Non-Goals

**Goals:**

- Build reproducible manifest and non-manifest consumer evidence.
- Assign one documented disposition, owner, and acceptance path to each zero-consumer package.
- Integrate, merge, or delete only from package-specific evidence.
- Prevent new unexplained zero-consumer workspaces.

**Non-Goals:**

- Automatically deleting every package with zero manifest dependents.
- Declaring an unintegrated kernel as a Desktop feature.
- Designing the eventual product UX for Chara, Quality, Search, or Tools.

## Decisions

### Consumer evidence has multiple classes

The inventory records manifest, static import, dynamic/runtime loader, resource/catalog, root
script/tooling, and test-only consumers. Each class is reported separately; self-tests do not count
as a product consumer.

### Use a finite disposition model

Allowed dispositions are:

- `integrated`: a Desktop canonical path and runtime acceptance exist;
- `unintegrated-kernel`: bounded context retained with owner and explicit product exclusion;
- `resource-or-tooling-owner`: non-code resource/script consumption is proven;
- `merge`: responsibility belongs in another owner;
- `delete`: no durable owner/consumer/acceptance remains.

Every row includes owner, decision evidence, target change, and review condition.

### Separate audit from package-specific implementation

This change owns the inventory, governance gate, and approved dispositions. A package needing a
non-trivial Desktop integration or domain migration receives its own implementation OpenSpec rather
than accumulating unrelated feature work here. Simple deletion/merge may be executed here only after
data and runtime impact are proven absent.

### Fail on drift, not on intentional kernels

The repository gate fails for an unlisted zero-consumer package or stale evidence. It permits a
listed unintegrated kernel/resource owner only when owner, documentation, and review condition are
present.

## Risks / Trade-offs

- [Dynamic/resource consumers are missed] -> Search loaders, exports, scripts, fixtures, and packaged
  assets in addition to manifests/imports.
- [Governance becomes a permanent exception list] -> Require owner, reason, target/review condition,
  and stale-entry validation.
- [A retained kernel is presented as shipped] -> Add explicit package and product documentation
  labels and test that Desktop capability catalogs do not infer it.
- [Deletion removes valuable data formats] -> Audit codecs, storage, fixture formats, and migration
  paths before deletion.

## Migration Plan

1. Generate the full multi-class consumer inventory.
2. Review the current candidate set and assign owner/disposition/evidence.
3. Update package/product documentation for retained non-integrated/resource owners.
4. Create package-specific OpenSpecs for substantive integrations; merge/delete only approved
   no-data-impact packages.
5. Add drift enforcement and run dependency, unused, legacy, build/test/check, Desktop packaging, and
   relevant runtime/resource-loading validation.

Rollback restores package code and inventory together. No persisted data may be removed without a
separate explicit migration/rejection decision.

## Open Questions

- `@neko/skills` requires resource-loader and packaging evidence before its disposition is final.
- Tools contracts and Webview must be evaluated as one dependency island, not as independent counts.
