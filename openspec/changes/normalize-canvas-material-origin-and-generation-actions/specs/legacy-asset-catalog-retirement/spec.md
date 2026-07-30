## MODIFIED Requirements

### Requirement: Legacy runtime paths are removed after migration

After all producers and consumers use direct media/resource references, the system SHALL poison and delete AssetEntity contracts and services, Asset commands and Extension APIs, Asset search partitions, import/promote adapters, and `project://assets/` resolvers. Canvas normal authoring MUST NOT call `AssetLibrary.importFile`, `saveCanvasMaterialToAssetLibrary`, or an equivalent membership adapter. No alias, dual-read, dual-write, promotion fallback, or compatibility path may return success.

#### Scenario: Verify the canonical path

- **WHEN** tests read, preview, search, bind, package, export, add to Canvas, or copy a migrated media resource
- **THEN** path evidence proves the Media Library/content/entity handlers were used and every legacy handler is poisoned

#### Scenario: Canvas requests legacy promotion

- **WHEN** a Canvas message or action requests save-to-AssetLibrary, Asset import, or promotion membership
- **THEN** the Host rejects it with a migration-required diagnostic and does not copy content or report success

#### Scenario: Canvas copies to an explicit media destination

- **WHEN** a Canvas material is copied to a selected project-linked or global Media Library
- **THEN** the owning media-library copy operation is used directly and no Asset catalog service participates

#### Scenario: Keep a migration archive

- **WHEN** migration has completed successfully
- **THEN** the archive remains available only to explicit recovery/inspection tooling and is never consulted by normal runtime
