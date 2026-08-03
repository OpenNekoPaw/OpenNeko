## ADDED Requirements

### Requirement: Storage authority is selected from ownership and portability

Every durable datum SHALL declare owner, scope, user-management class, portability, sensitivity,
durability, rebuildability, authority kind, backup, deletion, retention, and migration policy before a
production repository is introduced. File extension and current location MUST NOT select authority.

#### Scenario: New structured datum is proposed

- **WHEN** a package proposes a repository for structured state
- **THEN** its declared classification deterministically selects a supported authority
- **AND** an incomplete or contradictory classification fails the repository quality gate

### Requirement: SQLite admission is limited to opaque local state and rebuildable metadata

The system SHALL use the canonical user-level SQLite database only for non-secret machine-local
application/operational state whose storage users do not directly manage, and for explicitly
rebuildable metadata. User-authored, user-managed, user-exportable, or workspace-portable content MUST
NOT use SQLite as its sole authority.

#### Scenario: Application theme is persisted

- **WHEN** the user changes a Desktop theme through product settings
- **THEN** the machine-local preference is persisted in the canonical SQLite state namespace

#### Scenario: Portable project fact is persisted

- **WHEN** a project fact must travel with a copied or exported workspace
- **THEN** the owning versioned project file remains authoritative
- **AND** SQLite contains at most an explicitly rebuildable projection

### Requirement: Production uses one canonical SQLite database

All normal production SQLite state and cache repositories SHALL use `~/.neko/neko.db` through the
Local Metadata store. Workspace-local, package-local, Agent-specific, and Electron-userData SQLite
authorities MUST be rejected unless they are read-only migration sources.

#### Scenario: Agent repository requests a database

- **WHEN** Agent operational metadata requires transactional persistence
- **THEN** an Agent-owned repository uses its namespace in the canonical Local Metadata database
- **AND** it does not create or open a second normal-runtime database

### Requirement: Raw logs and journals remain managed files

Raw logs, model-call traces, audit streams, diagnostic events, and append-only journals SHALL be
written to managed files with explicit rotation, retention, redaction, and deletion policies. They
MUST NOT be imported into SQLite as raw event rows or used as a hidden state authority.

#### Scenario: Runtime emits an audit event

- **WHEN** an Agent or Desktop runtime emits append-only diagnostic evidence
- **THEN** the log owner appends a redacted managed log record
- **AND** no SQLite transaction is required for the log write

### Requirement: Normal workspaces have one visible project-fact root

Normal production workspaces SHALL store portable project metadata and domain facts in versioned,
Git-trackable files under `neko/`. Stable workspace identity SHALL use `neko/project.json`. The system
MUST NOT use a workspace `.neko/` directory as a normal authority for identity, settings, memory,
logs, caches, locks, or runtime recovery.

#### Scenario: A new workspace is created

- **WHEN** Desktop initializes a workspace that requires stable identity
- **THEN** it atomically creates or validates `neko/project.json` through the owning codec
- **AND** it does not create `.neko/workspace.json` or another hidden workspace state root

#### Scenario: Project-scoped configuration is proposed

- **WHEN** a capability needs portable project configuration
- **THEN** its owning domain defines a versioned schema under `neko/`
- **AND** the system does not restore a generic `.neko/config.toml`, `.neko/settings.local.json`, or
  `.neko/preferences.md` authority

### Requirement: Workspace-local operational data uses user-level authorities

Machine-local workspace settings and recovery state SHALL use canonical user-level SQLite state keyed
by stable workspace identity. Rebuildable indexes SHALL use canonical SQLite cache, and large derived
bytes MAY use a user-level managed cache root. Desktop, workspace, and Agent logs SHALL use user-level
managed log roots. These data MUST NOT be written into the workspace.

#### Scenario: Workspace-scoped log is emitted

- **WHEN** a runtime emits a redacted diagnostic for a known workspace
- **THEN** the log owner writes beneath a user-level log partition keyed by workspace identity
- **AND** no `.neko/logs` directory is created in the workspace

#### Scenario: A large preview cache is rebuilt

- **WHEN** a workspace representation produces rebuildable derived bytes
- **THEN** the cache owner writes beneath a user-level workspace cache partition
- **AND** project files do not reference that physical cache path as durable identity

### Requirement: Explicit project memory is optional user-managed content

Durable project memory SHALL exist only as explicit user-approved, reviewable, editable, deletable,
and syncable content. When the product exposes this capability, its authority SHALL be the optional
tracked file `neko/memory.md`. Entity/domain facts, inferred memory, embeddings, and session scratch
MUST NOT be duplicated into that file.

#### Scenario: User accepts a project memory proposal

- **WHEN** a user confirms that a proposed fact should become shared project memory
- **THEN** the memory owner updates `neko/memory.md` through its validated authoring path
- **AND** inferred indexes remain rebuildable projections rather than parallel fact authorities

### Requirement: Retired workspace data is preserved before cleanup

Migration from a legacy workspace `.neko/` directory SHALL inventory and classify every entry before
mutation. Known valuable data SHALL be migrated or promoted through its owning codec, rebuildable data
MAY be removed only after source verification, and unknown data SHALL block cleanup with a safe
diagnostic. Broad recursive deletion MUST NOT be used as migration.

#### Scenario: Unknown legacy workspace file is found

- **WHEN** migration finds an unclassified file under `.neko/`
- **THEN** it preserves the file and reports its relative path and required user action
- **AND** it does not mark workspace cleanup complete

### Requirement: Secrets use a protected secret authority

Credentials, API keys, OAuth tokens, mount secrets, and encryption material SHALL use
SecretStorage/keychain or an equivalent OS-protected port. Plain configuration, ordinary SQLite,
project files, transcripts, caches, logs, and renderer projections MUST NOT contain secret values.

#### Scenario: Provider credential is imported

- **WHEN** a legacy configuration source contains a provider secret
- **THEN** the migration validates and writes it only through the protected secret port
- **AND** the non-secret configuration authority stores only credential presence/provenance metadata

### Requirement: Portable migration is distinct from schema migration

Portable data SHALL have a versioned file or bundle authority outside SQLite. Portable data includes
content that must survive independently across reinstall, device transfer, workspace copy, or explicit
export. Every SQLite namespace SHALL still implement versioned schema migration, backup, integrity
validation, and unsupported-version diagnostics.

#### Scenario: SQLite schema upgrades

- **WHEN** a new build opens a supported older `neko.db` schema
- **THEN** it applies the owning versioned database migration without changing the datum's portability
  classification

#### Scenario: User transfers portable content

- **WHEN** the user exports or copies content classified as portable
- **THEN** the versioned file or bundle contains all authoritative content needed by the target
- **AND** copying the SQLite database is not required

### Requirement: Authority migrations are atomic and remove fallback success

An authority migration SHALL validate all inputs before mutation, switch authority atomically or with a
restart-safe marker, verify through production codecs, preserve required recovery evidence, and then
remove, archive, or poison the replaced normal path. Unknown schema, conflict, or partial migration
MUST fail visibly.

#### Scenario: Legacy source is poisoned after migration

- **WHEN** a migration marker commits and the legacy reader is configured to throw
- **THEN** create, read, update, restart, backup, and delete operations succeed through the new
  canonical authority only
