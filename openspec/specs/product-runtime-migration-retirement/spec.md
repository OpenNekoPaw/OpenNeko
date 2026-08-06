# product-runtime-migration-retirement Specification

## Purpose
TBD - created by archiving change remove-internal-versioning-and-product-migrations. Update Purpose after archive.
## Requirements
### Requirement: Product runtime contains no data migration path

Desktop startup, application composition, workspace packages, package public entries, ordinary readers and writers, product builds, and normal tests MUST NOT import, register, invoke, or retain migrators, upgrade handlers, legacy readers or writers, compatibility codecs, migration markers, automatic repair, or automatic rebuild behavior for persisted data.

#### Scenario: Desktop starts with current data

- **WHEN** Desktop initializes its stores and package runtimes
- **THEN** startup opens the canonical stores directly and invokes no migration registry, legacy import, downgrade export, or compatibility reader

#### Scenario: Product encounters old data

- **WHEN** a canonical reader encounters a record that does not satisfy its stable shape
- **THEN** it leaves the bytes unchanged, reports the affected record, and does not convert, rebuild, import, or rewrite it

### Requirement: Offline repair is outside product reachability

Any user-authorized offline data repair tool SHALL require an explicit target and confirmation, create a backup before modification, validate the bounded result, and remain unreachable from product imports, build, install, startup, package public entries, ordinary tests, and CI.

#### Scenario: User runs an offline repair

- **WHEN** the user explicitly invokes a repair tool for one identified invalid record or component
- **THEN** the tool backs up the target, changes only that target, validates the result, and does not register a reusable product compatibility path

#### Scenario: Product dependency graph is checked

- **WHEN** repository reachability checks inspect production and build imports
- **THEN** no offline repair module is reachable from the application or workspace package runtime

### Requirement: Stable persisted shapes evolve additively

OpenNeko-owned persisted shapes SHALL retain existing field names and semantics. Evolution MAY add optional fields only when their absence has one permanent documented meaning; it MUST NOT require a schema discriminator, field rename, old-shape branch, or default that depends on release generation.

#### Scenario: Optional field is introduced

- **WHEN** a current reader opens an existing record written before an optional field existed
- **THEN** it applies the field's permanent absence semantics and leaves the original record unchanged

#### Scenario: Persisted root contains unknown metadata

- **WHEN** a persisted authority root contains unknown top-level fields beside valid required collections
- **THEN** the reader retains and reports those fields without interpreting them as a schema generation
- **AND** ordinary writes preserve their JSON values without migration, automatic repair, or field-name-specific compatibility logic

#### Scenario: Existing authority row has unknown table columns

- **WHEN** the state repository commits an authority identity that already exists in its stable table
- **THEN** it updates only the canonical owned columns and leaves unknown columns untouched
- **AND** it does not execute an insert branch, inspect those columns, or synthesize values for them

#### Scenario: Proposed change cannot be additive

- **WHEN** a persisted data change would rename, delete, or reinterpret an existing field
- **THEN** implementation stops until an explicit user-data and offline repair decision is approved
