## Context

`desktop-shell-state.json` and `desktop-application-settings.v1.json` are machine-local, structured,
non-secret user state. They are currently written atomically as separate JSON files under Electron
`userData/state`. The existing user-level `neko.db` already owns structured local state and provides
versioned namespaces, transactions, backups, integrity checks, and fail-visible startup diagnostics.

The migration must protect user state across interruption and release rollback without creating a
permanent second authority. It must not absorb unrelated data merely because that data is JSON.

## Goals / Non-Goals

**Goals:**

- Make the existing user-level SQLite store the only normal runtime authority for Desktop shell
  state and application settings.
- Import valid legacy JSON atomically and idempotently.
- Preserve recoverability until committed rows have been read back and validated.
- Support an explicit downgrade export owned by the migration boundary.
- Keep current shell/settings service contracts stable where possible.

**Non-Goals:**

- Migrating `.neko/workspace.json`, project JSON/NKC/OTIO, JSONL journals/logs, media bytes, cache
  artifacts, plugin packages, or generated outputs.
- Storing credentials, provider tokens, mount secrets, or encryption material in ordinary SQLite.
- Creating another database under Electron `userData` or a workspace.
- Keeping permanent JSON fallback, dual-read, or dual-write paths.

## Decisions

### 1. Add state-owned tables to the existing user-level database

The local metadata owner adds dedicated shell-state and application-settings repositories under a
versioned Desktop namespace. Rows are global machine-local state and are not assigned to an active
workspace. Desktop Main receives these repositories through dependency injection; renderer and
preload contracts remain unchanged.

### 2. Use one transactional import and a committed migration marker

Startup performs a preflight that reads and validates both legacy documents without mutation. The
database transaction then imports the validated values and writes a migration marker carrying source
schema versions and content digests. If either document, transaction, or verification fails, no
authoritative rows or marker commit and both JSON files remain untouched.

After commit, startup reads the rows through the production repositories and validates their public
contracts. Only then may the migration owner atomically rename legacy files to a non-runtime archive.
Normal repositories never inspect that archive and never fall back to JSON.

An interrupted post-commit archive step is safe: the committed marker makes SQLite authoritative,
and the next startup finishes archival after verifying the same source digest. A conflicting changed
legacy file fails visibly and is not deleted or imported implicitly.

### 3. Keep rollback explicit and owner-scoped

Before a release downgrade, a migration-owned command exports current SQLite state through the
shell/settings codecs to temporary JSON files, reads them back, validates them, and atomically
publishes the legacy filenames. This export is not a normal startup fallback. Database backup and
restore stay owned by `LocalMetadataStore`; JSON downgrade export is owned by the Desktop migration
adapter.

### 4. Preserve existing data ownership

| Data                          | Owner after this change            | Reason                                                    |
| ----------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Desktop shell state           | User-level SQLite state repository | Durable structured machine-local state                    |
| Desktop application settings  | User-level SQLite state repository | Durable structured machine-local preferences              |
| `.neko/workspace.json`        | Workspace identity owner           | Portable checkout recovery descriptor, not app preference |
| Project JSON/NKC/OTIO         | Owning project codecs              | Reviewable project facts                                  |
| JSONL journals/logs           | Journal/logger owners              | Append-oriented evidence and operational history          |
| Media/artifact bytes          | File/artifact owners               | Large byte content is not relational metadata             |
| Credentials and mount secrets | SecretStorage/keychain             | Security and trust boundary                               |

## Failure And Recovery

- Invalid or unknown legacy schema: fail startup with a migration diagnostic; preserve source files.
- SQLite unavailable or incompatible: fail visibly; do not write a JSON fallback.
- Transaction interruption: rollback all imported state and marker changes.
- Commit succeeds but archive fails: SQLite remains authoritative; retry exact-digest archival.
- Legacy file changes after commit: report a conflict and require explicit recovery.
- Downgrade export fails validation: preserve SQLite and any existing legacy file; publish nothing.

## Migration Plan

1. Add contracts, repositories, schema migrations, and adapter tests.
2. Add a migration coordinator with validation, transaction, verification, and archival.
3. Inject SQLite repositories into the existing Desktop shell/settings services.
4. Poison JSON fallback and dual-write paths in normal startup.
5. Add explicit downgrade export and recovery diagnostics.
6. Validate cold start, restart, interruption, conflicting legacy input, and rollback in isolated
   Electron fixtures.

Rollback of the feature uses the explicit downgrade export before installing a build that expects
the legacy JSON files. It does not reinterpret archives or copy raw database rows.
