## Context

OpenNeko is a local-first Electron product, not a cloud multi-tenant backend. Durable data spans local
machine state, user-managed project facts, Agent sessions, logs, caches, retained artifacts and secrets.
Authority must be selected by semantics and lifecycle, not file extension or current location.

The earlier design coupled this policy to versioned schemas and owner-scoped product migrations. The
cross-cutting `remove-internal-versioning-and-product-migrations` change supersedes that mechanism.
Portability/device transfer remains a user workflow; it does not imply schema versions or startup
migration.

## Goals / Non-Goals

**Goals:**

- Establish one machine-readable admission policy for every durable data class.
- Keep machine-local structured state/cache in the shared user-level SQLite store through stable,
  package-owned repositories.
- Keep portable and user-managed facts in owning domain files/bundles.
- Keep secrets and raw logs out of ordinary SQLite.
- Preserve existing unknown/retired bytes without automatic import, repair or cleanup.
- Contain invalid data to the exact row, record, component, session or workspace owner.

**Non-Goals:**

- Cloud synchronization or a remote storage authority.
- A generic repository facade, schema registry, migrator, compatibility framework or data DSL.
- Moving every classified source in one change.
- Importing retired config/databases/workspace files into new authorities.

## Decisions

### 1. Admission uses semantic classification

Each durable datum declares:

- owner and scope;
- user-management and portability;
- sensitivity and trust boundary;
- durability and rebuildability;
- authority kind and SQLite role;
- backup, deletion and retention;
- local failure boundary and offline repair disposition.

Unknown classification fails the repository gate. A `.json`, `.toml`, Markdown or SQLite extension
does not select authority.

### 2. Authority admission order

1. credential/secret -> SecretStorage, keychain or encrypted credential authority;
2. raw log/audit -> owner-partitioned rotated file;
3. user-visible/editable/portable fact -> owning domain file or export bundle;
4. large media/artifact bytes -> owning file/artifact store;
5. scratch -> instance memory or bounded temporary storage;
6. rebuildable structured projection -> `neko.db#cache`;
7. remaining non-secret machine-local structured state -> `neko.db#state`.

Only Character, Asset, Extension/package, generated-output or another explicitly user-managed object may
carry its domain version identity. That identity never selects a file schema, component shape, parser or
migration path.

### 3. SQLite uses stable package-owned repositories

All eligible production SQLite repositories share `~/.neko/neko.db`, but ownership stays with the
domain repository contract. Desktop Main owns the connection/path adapter, not business policy.

Tables have stable names and canonical columns. Initialization creates only missing tables. Existing
authority rows update only canonical owned columns and preserve unknown columns. New optional columns
must have one permanent absence meaning. A non-additive change stops until an explicit user-data and
offline repair decision is approved.

An owner MUST NOT create version-suffixed, pre/post-release, shadow or replacement tables for the same
facts. Catalog reads enumerate the one stable authority without a release/table-generation selector.
`PRAGMA user_version`, table-generation discriminator columns/rows and versioned sentinel keys are
equally forbidden; hiding a table generation inside a singleton record is still table versioning.
Active Scene, current Project, open Workspace and selected component are presentation state and never
filter durable records out of existence.

### 4. Portable facts are not schema-migration authorities

Portable data survives workspace copy, device transfer or explicit export independently of SQLite.
Owning domain codecs validate one canonical shape. User-managed business versions may be included when
the workflow actually publishes/selects/pins them. Otherwise internal `version`, `revision`, `epoch` or
generation fields are forbidden.

### 5. Agent authorities remain separated

| Agent data                       | Canonical authority                           |
| -------------------------------- | --------------------------------------------- |
| UI-managed runtime settings      | Agent-owned stable `neko.db#state` repository |
| User-editable provider/model/MCP | Product config owner / explicit local export  |
| Credentials                      | SecretStorage/keychain                        |
| Pi transcript and branch facts   | Pi Session files                              |
| Conversation catalog/projection  | Agent-owned stable state/cache repositories   |
| Execution lease/checkpoint       | Exact session/request-owned operational state |
| Accepted project memory          | Owning project/Chara file                     |
| Search/semantic acceleration     | Rebuildable cache projection                  |

No writer epoch, schema version or product migration is required. Concurrent mutable state belongs to
one session owner and uses exact request identity plus owner serialization.

### 6. Retired data is untouched and product-unreachable

Retired `.neko/` files, old package databases and mixed config sources are not normal product input.
Startup, public entries, build and ordinary tests do not inspect, classify, import, archive, delete or
repair them. Unknown data remains untouched.

If repair is necessary, a separately authorized offline tool must target an exact file/record, require
confirmation, create an immutable backup, write atomically and validate the result. It stays outside the
product dependency graph and CI.

### 7. Failures are local and visible

Batch readers validate entries independently when identity is available. Invalid rows/files return exact
diagnostics beside valid siblings; they do not return fabricated empty success or disable a workspace.
Authority roots preserve unknown top-level metadata as opaque values but never interpret it as a schema
generation.

Catalog projections retain an unavailable entry when its stable identity can be read. The entry reports
the exact invalid or unavailable fields and only offers actions that target that identity, such as
relinking a Workspace locator or removing an unavailable membership after confirmation. It is not copied
to a quarantine/legacy table and no alternate reader participates.

## Risks / Trade-offs

- [Retired data may be valuable] -> Preserve all bytes and require explicit offline handling.
- [Stable tables constrain destructive changes] -> Prefer additive optional columns; stop and request a
  user-data decision when semantics cannot remain additive.
- [Shared database increases coordination] -> Keep narrow package repositories and one Main connection
  owner; do not create a database-wide business facade.
- [Cache loss affects UX] -> Recompute from authoritative facts through ordinary projection work and
  expose progress/diagnostics; never treat cache as authority.

## Replacement Plan

1. Maintain the machine-readable authority registry and quality gate.
2. Establish stable Local Metadata repositories for eligible owners.
3. Delete product migration, compatibility, automatic-repair and retired-source paths.
4. Switch each in-scope producer/consumer atomically to its canonical owner.
5. Add record-local failure, authority-isolation and retired-path reachability tests.
6. Validate focused packages, full repository gates and real Electron lifecycle scenarios.

Rollback is source-level only and must not restore product migration or rewrite user data.
