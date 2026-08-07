## MODIFIED Requirements

### Requirement: Media entries are source-derived projections

Media Library tree, search, recent-use, technical metadata, and availability entries SHALL be source-derived projections keyed by canonical locator and content fingerprint without a schema generation or migration marker. Ordinary discovery MAY create current entries from authorized filesystem state, but it MUST NOT inspect, convert, or automatically repair invalid persisted records. Discovery MUST NOT create Creative Entities, representation bindings, Asset IDs, or project membership facts.

#### Scenario: Discover a new file

- **WHEN** a filesystem event or bounded reconciliation discovers a supported file
- **THEN** Media Library creates or refreshes the current file projection without writing `library.json`, creating an entity, creating a binding, or consulting a data version

#### Scenario: One projection entry is invalid

- **WHEN** a projection row fails the stable current entry contract
- **THEN** Media Library leaves that row unchanged, reports the exact entry diagnostic, and continues serving valid sibling entries and workspaces without migration or automatic repair

## RENAMED Requirements

- FROM: `### Requirement: Media entries are rebuildable projections`
- TO: `### Requirement: Media entries are source-derived projections`
