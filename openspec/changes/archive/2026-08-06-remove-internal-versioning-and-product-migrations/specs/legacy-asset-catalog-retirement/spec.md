## MODIFIED Requirements

### Requirement: Legacy Asset data is outside product runtime

`neko/assets/library.json`, AssetEntity/Variant/File records, `project://assets/` references, legacy Asset APIs, and legacy search documents MUST NOT be read, inspected, migrated, rejected by a dedicated legacy handler, or resolved by normal product startup and authoring. Current canonical readers MAY reject an input that fails their own stable contract but MUST NOT classify or convert the legacy shape.

#### Scenario: Open a project with a legacy catalog

- **WHEN** a project contains `neko/assets/library.json`
- **THEN** normal product startup leaves the file untouched and does not import, inspect, register, or convert it

#### Scenario: New request carries an Asset URI

- **WHEN** a normal authoring or content request contains `project://assets/<id>`
- **THEN** the current canonical locator decoder rejects the request locally without invoking a legacy Asset service or migration diagnostic handler

### Requirement: Legacy runtime paths are deleted

AssetEntity contracts and services, Asset commands and Extension APIs, Asset search partitions, import/promote adapters, `project://assets/` resolvers, migration planners, migration archives, and compatibility registries SHALL be absent from production imports, registration, startup, and build output. No alias, dual-read, dual-write, poison handler, or fallback path may remain.

#### Scenario: Verify the canonical path

- **WHEN** tests read, preview, search, bind, package, or export a current media resource
- **THEN** path evidence proves the Media Library, Content, and Entity handlers were used and registry/import assertions prove legacy and migration paths are absent

## REMOVED Requirements

### Requirement: Migration preserves original data before writes

**Reason**: Product runtime migration is forbidden; legacy bytes remain untouched until a user explicitly chooses an offline repair action.

**Migration**: None in the product. Any separately authorized offline repair must back up and target exact data outside product reachability.

### Requirement: Migration classifications are explicit

**Reason**: Product code must not inspect or classify legacy data generations.

**Migration**: None in the product. Current canonical contracts reject only their own invalid input.

### Requirement: Migration does not create a replacement catalog

**Reason**: The entire product migration path is removed rather than constrained.

**Migration**: None; current Media Library and Entity owners remain the only product paths.

## RENAMED Requirements

- FROM: `### Requirement: Legacy Asset data is inspection-only`
- TO: `### Requirement: Legacy Asset data is outside product runtime`
- FROM: `### Requirement: Legacy runtime paths are removed after migration`
- TO: `### Requirement: Legacy runtime paths are deleted`
