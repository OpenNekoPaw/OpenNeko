## Why

Desktop shell state and application settings are durable machine-local structured state, but they
currently use separate whole-file JSON repositories under Electron `userData/state`. OpenNeko
already has one user-level SQLite authority for structured local metadata, transactions, migrations,
backup, and integrity checks. Keeping these two stores outside that authority duplicates durability
and recovery behavior.

This migration is intentionally separate from Media Library sync recovery. Shell state and
application preferences have different owners, startup impact, rollback needs, and user-data risk;
combining them with link recovery would blur responsibilities and create an unsafe release boundary.

## What Changes

- Add state-owned SQLite repositories for Desktop shell state and Desktop application settings in the
  existing user-level `neko.db`.
- Migrate each validated legacy JSON document through a versioned, transactional, restart-safe import
  before switching its repository to SQLite.
- Keep the original JSON recoverable until the committed SQLite state has been read back and
  validated, then archive it as migration evidence that normal runtime never reads.
- Define explicit rollback/export ownership for restoring a compatible legacy JSON document when a
  release rollback requires it.
- Remove normal dual-read and dual-write behavior after migration; an unknown schema, conflict, or
  failed transaction remains visible and leaves the legacy source untouched.
- Keep workspace identity, project facts, journals/logs, media/artifact bytes, and credentials with
  their current owners.

## Capabilities

### New Capabilities

- `desktop-local-state-sqlite-migration`: Transactional migration and rollback of Desktop shell state
  and application preferences into the existing user-level local metadata store.

## Impact

- Desktop Main shell-state and application-settings repository composition.
- User-level local metadata schema, migration ledger, backup, and integrity checks.
- Desktop startup/restart behavior and release rollback tooling.
- Focused migration, crash-recovery, downgrade-export, and real Electron startup validation.
