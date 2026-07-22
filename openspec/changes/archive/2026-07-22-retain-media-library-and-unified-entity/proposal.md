## Why

OpenNeko currently exposes both a linked media-library file model and an `AssetEntity -> AssetVariant -> AssetFile` catalog, while unified entities already own character, scene, object, location, and style identity. Requiring readable workspace or linked files to be registered again creates duplicate identity, search, deletion, availability, and migration semantics without adding content access capability.

## What Changes

- Retain **Media Library** as the only user-visible file-resource entry and retain **Creative Entity** as the only creative semantic identity model; do not introduce an Asset Library or Asset Source product layer between them.
- Keep `neko/assets/<libraryName>` symlink/junction roots and ordinary workspace-relative media paths as the canonical linked-library access path.
- **BREAKING**: remove `AssetEntity`, `AssetVariant`, `AssetFile`, the `neko/assets/library.json` catalog, `project://assets/<id>` resolution, import/promote membership, and Asset-specific public commands/APIs/search adapters after explicit legacy inspection and migration.
- Bind a Creative Entity representation directly to a stable content locator, generated-output identity, document entry, or package-owned representation reference instead of an AssetEntity ID.
- Treat ordinary workspace and linked files as path-addressed content with fingerprint preconditions. A moved file becomes orphaned and requires explicit rebind; the system does not add a general resource-ID registry to guess relocation.
- Keep generated outputs, external packages, document entries, content reading, semantic representations, and derived cache under their existing owners. They may be consumed or bound without becoming Media Library catalog records.
- Make Media Library discovery, availability, recent-use, and search data rebuildable projections. Link target mapping remains owned by the OS link and is never copied into a registry or project fact.
- Replace “save/promote to Asset Library” workflows with the actual user intent: retain generated output, copy to an explicitly selected writable media-library directory, or bind a representation to an entity.

## Capabilities

### New Capabilities

- `media-library-resource-entry`: Defines the single Media Library file entry, linked-root projection, direct locator use, writable-target boundaries, and the prohibition on Asset catalog membership.
- `unified-entity-representation-bindings`: Defines direct Creative Entity bindings to locators, generated outputs, document entries, and representation packages, including orphan and explicit rebind behavior.
- `legacy-asset-catalog-retirement`: Defines safe inspection and migration of valuable `library.json` data and the fail-closed removal of AssetEntity APIs, commands, search paths, and resolvers.

### Modified Capabilities

None. The completed workspace-link behavior and the in-progress content I/O and derived-representation changes remain prerequisite contracts rather than being redefined here.

## Impact

- `@neko/asset`, `neko-assets`, `neko-entity`, `neko-search`, `neko-agent`, `neko-canvas`, `neko-cut`, `neko-tools`, TUI and VS Code resource surfaces.
- Shared Asset entity/query/protocol/extension contracts, Creative Entity binding files and resolvers, project search partitions, Agent capabilities, Canvas actions, Cut services, and Tools asset diff/readers.
- Existing `neko/assets/library.json` and `project://assets/` project data require inspection, backup, deterministic migration where possible, and user-confirmed handling where intent is ambiguous.
- Depends on `adopt-workspace-linked-media-libraries`; final binding contracts depend on the locator and representation boundaries from `simplify-workspace-content-io` and `internalize-derived-content-storage`.
