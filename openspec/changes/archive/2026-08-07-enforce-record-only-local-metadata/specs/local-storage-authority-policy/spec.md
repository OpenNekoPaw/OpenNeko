## ADDED Requirements

### Requirement: SQLite accepts bounded structured records only

The Local Metadata boundary SHALL accept only scalar SQL bindings and bounded structured JSON records. Application writes MUST reject native binary containers, serialized byte containers, byte-bearing data/blob URLs, Base64 payloads, and application schemas with BLOB-capable columns before committing the affected operation. Hashes, fingerprints, byte counts, MIME types, stable locators and other non-reversible record metadata SHALL remain valid. SQLite engine-owned FTS implementation tables MAY use their required internal representation but MUST NOT expose or accept domain binary payloads.

#### Scenario: Binary value reaches a JSON repository

- **WHEN** an owning repository attempts to persist a Buffer, typed array, ArrayBuffer, byte array, data/blob URL, Base64 payload or oversized serialized record
- **THEN** Local Metadata rejects the current record with an operation-qualified diagnostic
- **AND** no SQLite write is committed

#### Scenario: Package proposes a binary-capable table

- **WHEN** application table initialization introduces a BLOB or untyped column outside the exact FTS engine-owned table family
- **THEN** initialization fails in its transaction
- **AND** unrelated existing tables and records remain available

#### Scenario: Record contains a content locator and digest

- **WHEN** a repository persists a stable content locator, hash, MIME type, byte count and lifecycle status without content bytes
- **THEN** Local Metadata accepts the structured record
- **AND** the owning file, artifact or cache store remains the only byte authority

### Requirement: Rebuildable semantic projection stores current consumer records

The Search semantic cache SHALL persist source identity, source fingerprint, freshness, compact index metadata and separately-owned Entity projections required by current production consumers. It MUST NOT persist one full evidence record for every transient text segment when no production consumer requires that record. Retired evidence tables and rows MUST NOT be read, written, migrated, repaired, or selected as a fallback by the canonical runtime.

#### Scenario: Semantic source is analyzed

- **WHEN** a source produces transient text segments and Entity analysis results
- **THEN** the cache stores one compact semantic source/index record and the required Entity projections
- **AND** it does not create per-segment durable evidence rows

#### Scenario: Existing database contains retired evidence rows

- **WHEN** the canonical runtime opens a database that still contains the retired evidence table
- **THEN** source reconciliation and Entity projection use only current source/index and Entity tables
- **AND** the retired rows remain untouched and cannot produce a successful fallback result

#### Scenario: Fresh database initializes Search metadata

- **WHEN** Search initializes its Local Metadata tables in a fresh database
- **THEN** no semantic evidence table is created
- **AND** semantic source records can round-trip without segment evidence
