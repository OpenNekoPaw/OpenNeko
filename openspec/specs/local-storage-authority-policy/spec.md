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

Credentials, provider tokens, mount secrets and encryption material MUST use a protected credential
authority. Raw logs/audit data MUST use owner-partitioned managed files with retention/redaction and
MUST NOT be stored as ordinary SQLite rows or replayed as business facts.

#### Scenario: Provider credential is configured

- **WHEN** a provider needs a secret
- **THEN** configuration stores only non-secret identity/presence metadata
- **AND** secret bytes remain inside SecretStorage/keychain

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
