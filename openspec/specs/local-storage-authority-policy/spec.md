# local-storage-authority-policy Specification

## Purpose
TBD - created by archiving change govern-local-storage-authorities. Update Purpose after archive.
## Requirements
### Requirement: Durable data declares one authority

Every durable datum SHALL declare owner, scope, user-management class, portability, sensitivity,
durability, rebuildability, authority kind, SQLite role, backup, deletion, retention, local failure
boundary and offline repair disposition before a production repository is introduced. File extension
and current location MUST NOT select authority.

#### Scenario: Unknown storage classification is proposed

- **WHEN** a repository cannot identify the datum's owner or authority class
- **THEN** the storage admission gate rejects it
- **AND** Desktop does not place it in a generic state/config table

### Requirement: SQLite authority is shared but package-owned

Eligible machine-local structured state and cache SHALL use `~/.neko/neko.db` through Local Metadata
and narrow owning-package repositories. Product packages MUST NOT create workspace-local,
package-local, Agent-specific or Electron-userData databases.

#### Scenario: A package needs machine-local structured state

- **WHEN** the datum passes state/cache admission
- **THEN** its owning package defines a narrow repository over the shared store
- **AND** Desktop Main only wires the concrete connection/path adapter

### Requirement: Stable tables evolve additively

SQLite repositories SHALL use stable tables without schema versions or migration registries.
Initialization MAY create a missing table. Existing rows SHALL update only canonical owned columns and
preserve unknown columns. Optional fields MAY be added only with one permanent absence meaning.
The same authority MUST NOT be split into version-suffixed, pre-release, post-release, shadow or
replacement tables, and readers MUST NOT dispatch by table generation. Repositories MUST NOT use
`PRAGMA user_version`, table-generation discriminator fields/rows or versioned sentinel keys.

#### Scenario: Existing authority row has an unknown column

- **WHEN** a repository commits a canonical update
- **THEN** the unknown column remains untouched
- **AND** it does not select a parser, compatibility path, default or repair action

#### Scenario: A component or release changes

- **WHEN** an owning package changes code while existing authority rows remain on disk
- **THEN** the package continues to read the same stable table and validates rows independently
- **AND** it does not create or select a release-specific table

#### Scenario: A repository needs repeatable discovery state

- **WHEN** an owning package discovers current records more than once
- **THEN** it uses stable record identity and idempotent current-table writes
- **AND** it does not persist a versioned inventory sentinel or table-generation key

### Requirement: Portable data remains with the owning domain

User-visible, editable or portable project/configuration facts SHALL use an owning domain file or
explicit export bundle outside SQLite. A domain version MAY exist only when users explicitly publish,
select, pin, compare or restore versions of that object. Internal shape/schema versions are forbidden.

#### Scenario: Project capability configuration is portable

- **WHEN** a capability has a qualified project owner and must travel with the project
- **THEN** the owning domain stores one canonical project shape
- **AND** absence of an optional field has a permanent meaning without migration dispatch

### Requirement: Secrets and raw logs use dedicated authorities

Credentials, provider tokens, mount secrets and encryption material MUST use a dedicated sensitive
authority. A user-authored provider `api_key` MAY use the product-owned local configuration document
as its explicit authority only when the config owner keeps the secret outside ordinary DTOs and
projects it through a Host-only credential port. Credentials entered through protected product UI
MUST use SecretStorage/keychain. Raw logs/audit data MUST use owner-partitioned managed files with
retention/redaction and MUST NOT be stored as ordinary SQLite rows or replayed as business facts.

#### Scenario: Provider credential is configured in the user document

- **WHEN** a provider explicitly declares a valid `api_key` in canonical user TOML
- **THEN** the product config owner parses the secret under that provider identity
- **AND** secret bytes never enter SQLite, ordinary config facts, logs, Renderer projection or export
- **AND** no automatic migration or second persisted credential copy is created

#### Scenario: Provider credential is entered through protected UI

- **WHEN** the user enters a credential through the product credential interaction
- **THEN** SecretStorage/keychain is its sole persisted authority
- **AND** the product does not write the secret into user TOML

### Requirement: Retired data is outside product runtime

Product startup, public entries, build output and ordinary tests MUST NOT inspect, import, classify,
archive, delete, repair or rewrite retired databases, mixed config sources or workspace `.neko/` data.
Existing bytes MUST remain untouched.

#### Scenario: Unknown retired workspace file exists

- **WHEN** a retired `.neko/` path contains an unknown file
- **THEN** normal product runtime ignores the retired path and leaves the file unchanged
- **AND** no cleanup or migration is marked successful

### Requirement: Invalid data fails locally

Batch readers, catalogs and projections SHALL validate entries independently when identity is
available. An invalid entry MUST return an exact diagnostic beside valid siblings and MUST NOT create
an empty successful result or disable unrelated workspaces.
Catalog enumeration MUST be independent from the active Scene, current Project, open Workspace or
selected component. When stable identity is readable, an unavailable entry SHALL remain visible with
the exact invalid fields and explicit identity-scoped manual actions.

#### Scenario: One cache projection row is invalid

- **WHEN** valid rows exist beside one malformed row
- **THEN** only the malformed row is rejected
- **AND** valid rows and their workspace remain available

#### Scenario: No Project is currently open

- **WHEN** conversation, Workspace and media membership authority rows exist while Shell has no active Project
- **THEN** their owning catalogs still list every identifiable record
- **AND** unavailable records show their invalid fields instead of being omitted or reported as an empty catalog

### Requirement: Offline repair is explicit and product-unreachable

Any repair utility SHALL require an exact target and confirmation, create an immutable backup, write
atomically, validate the bounded result and remain unreachable from product imports, build, startup,
ordinary tests and CI.

#### Scenario: User authorizes one repair

- **WHEN** the user explicitly runs an offline repair for one identified record
- **THEN** only that record may change after backup and validation
- **AND** no reusable product compatibility path is registered

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

### Requirement: Desktop tests use isolated storage authority

Every canonical Desktop functional or Agent Evaluation run SHALL bind its runtime HOME, Local Metadata
SQLite database, Electron `userData`, and prepared Workspace to one explicit temporary fixture root
before application storage opens. A functional launch with a missing, relative, unsafe, or escaping
storage path MUST fail visibly and MUST NOT fall back to the system HOME or `~/.neko/neko.db`.

#### Scenario: Canonical functional run starts

- **WHEN** the shared Desktop functional runner prepares a UI or Agent Evaluation scenario
- **THEN** it launches Desktop with an explicit fixture argument and absolute contained HOME, userData,
  and Workspace paths
- **AND** Desktop opens `${FIXTURE_HOME}/.neko/neko.db` rather than the user database

#### Scenario: Functional userData escapes the fixture root

- **WHEN** a functional launch supplies Electron `userData` outside its fixture HOME
- **THEN** Desktop rejects startup before Local Metadata opens
- **AND** no fallback database is selected

#### Scenario: Ordinary product startup begins

- **WHEN** Desktop starts without the explicit functional fixture argument or fixture environment
- **THEN** it uses the system HOME and canonical user database
- **AND** it does not inspect or import discarded functional fixture databases

### Requirement: Historical fixture records are not inferred or rewritten

Product runtime and test orchestration MUST NOT classify, hide, migrate, rewrite, or delete existing
user catalog rows by matching path names associated with tests, reports, or temporary directories.
Identifiable unavailable rows SHALL remain visible for explicit identity-scoped user handling.

#### Scenario: User database contains an old fixture-looking Workspace

- **WHEN** a retained Workspace locator includes a temporary, report, or Agent Evaluation path
- **THEN** the project catalog displays the record and its local diagnostic according to normal catalog
  rules
- **AND** only an explicit user removal for that exact identity may delete the catalog record
