## ADDED Requirements

### Requirement: Legacy Asset data is inspection-only
`neko/assets/library.json`, AssetEntity/Variant/File records, `project://assets/` references, legacy Asset APIs, and legacy search documents SHALL be readable only by an explicit inspection, migration, rejection, or diagnostic path. Normal runtime and authoring MUST NOT resolve new requests through them.

#### Scenario: Open a project with a legacy catalog
- **WHEN** the Host detects `neko/assets/library.json` before migration
- **THEN** it reports that explicit inspection and migration are required and does not load the catalog as the active Media Library authority

#### Scenario: New request carries an Asset URI
- **WHEN** a normal authoring or content request contains `project://assets/<id>`
- **THEN** the request fails closed with a migration-required diagnostic rather than resolving through the legacy Asset service

### Requirement: Migration preserves original data before writes
Before applying any migration, the system MUST create an immutable content-addressed archive of the inspected legacy facts and record source digests and project revision preconditions. A changed source or failed archive write MUST abort migration without modifying project data.

#### Scenario: Create a migration plan
- **WHEN** inspection produces a candidate migration plan
- **THEN** the plan identifies the exact input digests, proposed outputs, unresolved fields, and archive location before confirmation

#### Scenario: Project changes after inspection
- **WHEN** a catalog, binding, or target project file changes after inspection
- **THEN** migration aborts visibly and requires a new inspection

### Requirement: Migration classifications are explicit
Migration SHALL classify each legacy value as a deterministic locator/reference conversion, existing Creative Entity association, user-confirmed entity proposal, owner-specific provenance, rebuildable projection, or unresolved archived metadata. It MUST NOT silently discard values or copy resource metadata into Creative Entity metadata without semantic ownership.

#### Scenario: Migrate a deterministic file record
- **WHEN** a legacy AssetFile maps unambiguously to an existing portable workspace locator
- **THEN** references are rewritten to the canonical representation reference and the original bytes remain unchanged

#### Scenario: Encounter ambiguous semantic identity
- **WHEN** a legacy AssetEntity could create or merge a character, scene, object, location, or style identity
- **THEN** migration requires explicit user confirmation and leaves current project facts unchanged until confirmed

#### Scenario: Encounter unsupported metadata
- **WHEN** a legacy license, tag, alias, source field, or custom metadata value has no valid target owner
- **THEN** the value remains in the immutable archive and unresolved report rather than being discarded or written to an unrelated model

### Requirement: Migration does not create a replacement catalog
Migration MUST NOT create an AssetSource registry, generic resource-ID mapping table, renamed `library.json`, dual binding field, or Media Library membership database as a compatibility destination.

#### Scenario: Migrate ordinary media files
- **WHEN** legacy records point to ordinary workspace or linked files
- **THEN** migration emits canonical locators and optional fingerprint preconditions without allocating replacement Asset IDs

### Requirement: Legacy runtime paths are removed after migration
After all producers and consumers use direct media/resource references, the system SHALL poison and delete AssetEntity contracts and services, Asset commands and Extension APIs, Asset search partitions, import/promote adapters, and `project://assets/` resolvers. No alias, dual-read, dual-write, or fallback path may return success.

#### Scenario: Verify the canonical path
- **WHEN** tests read, preview, search, bind, package, or export a migrated media resource
- **THEN** path evidence proves the Media Library/content/entity handlers were used and every legacy handler is poisoned

#### Scenario: Keep a migration archive
- **WHEN** migration has completed successfully
- **THEN** the archive remains available only to explicit recovery/inspection tooling and is never consulted by normal runtime
