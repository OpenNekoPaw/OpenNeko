## 1. Classification Contract And Gates

- [x] 1.1 Extend `@neko/local-metadata` storage classifications with authority kind, user-management,
      portability, SQLite role, sensitivity, deletion, retention, backup, and migration semantics.
- [x] 1.2 Add classification fixtures for application settings, raw logs, project facts, user content,
      secrets, Agent data, workspace state, rebuildable indexes, retained artifacts, and scratch data.
- [x] 1.3 Add a repository gate that rejects unclassified durable stores, non-canonical SQLite paths,
      raw-log tables, secret fields in ordinary stores, and user-content SQLite authorities.
- [x] 1.4 Update storage architecture/docs with the admission sequence and the distinction between
      portable data migration and SQLite schema migration.

## 2. Agent Configuration Authorities

- [ ] 2.1 Define separate Agent-owned repository contracts for UI-managed Agent runtime settings,
      portable Agent definitions, owning project capability configuration, and credential
      presence/provenance; consume Desktop shell/application settings from the dedicated migration
      change instead of reimplementing them here.
- [ ] 2.2 Add canonical SQLite state repositories only for machine-local Agent runtime settings and keep
      portable definitions behind their export/import codec; retire generic workspace
      config/preferences paths without creating a second Desktop settings repository.
- [ ] 2.3 Implement a preflighted legacy global-config import that routes settings, portable definitions,
      and credentials to their distinct authorities without retaining mixed fallback or dual writes.
- [ ] 2.4 Add producer, consumer, import/export, corrupt-input, secret-redaction, and poisoned legacy-config
      tests; verify Desktop settings UI and explicit portable config editing use the correct authority.

## 3. Conversation And Memory Authorities

- [ ] 3.1 Define a versioned portable conversation manifest for title, branch topology, export identity,
      and Pi Session references without copying transcript messages.
- [x] 3.2 Move conversation leases, writer epochs, checkpoints, and task recovery to Agent-owned
      repositories on `~/.neko/neko.db`; keep listing/search data rebuildable.
- [x] 3.3 Implement transactional migration from Agent `metadata.sqlite`, verify rows through production
      codecs, archive the source, and poison all normal opens of the retired database.
- [ ] 3.4 Implement database-free conversation export/import and catalog rebuild from manifest plus Pi
      Session files while keeping in-flight operational state fail-visible.
- [ ] 3.5 Audit explicit memory, preferences, semantic indexes, and scratch snapshots; retain accepted
      memory files, keep only explicit shared memory at optional `neko/memory.md`, and move only
      rebuildable indexes/recovery checkpoints to their eligible namespaces.
- [ ] 3.6 Add producer/consumer, branch/restart/export/import, cache-loss, migration interruption,
      old-database poison, explicit-memory, and no-log-replay tests.

## 4. Workspace And Log Enforcement

- [ ] 4.1 Audit every legacy `.neko/` entry and Local Metadata repository against project fact, state,
      cache, log, retained artifact, scratch, or unknown valuable data; block cleanup on unknown input.
- [ ] 4.2 Define and implement the versioned `neko/project.json` identity codec, migrate validated
      `.neko/workspace.json`, and poison the legacy identity reader after commit.
- [ ] 4.3 Move machine-local workspace overrides and recovery state to `neko.db#state`, rebuildable
      indexes to `neko.db#cache`, and large derived bytes to user-level workspace cache partitions.
- [ ] 4.4 Move Desktop/workspace/Agent logs to owner-partitioned user-level roots and enforce rotation,
      retention, redaction, and explicit deletion without importing raw events into SQLite.
- [ ] 4.5 Retire `.neko/config.toml`, `.neko/settings.local.json`, `.neko/preferences.md`, workspace
      `.neko/logs`, and workspace `.neko/.cache` only after owner-specific preservation/migration.
- [ ] 4.6 Add workspace copy/move, duplicate identity, unknown-file preservation, database/cache loss,
      project-fact poison, log deletion, and retained artifact safety tests proving no fallback or data
      loss.

## 5. Verification And Release Evidence

- [ ] 5.1 Run focused Local Metadata, Host, Agent runtime, Desktop producer/consumer tests and typechecks,
      then `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`.
- [ ] 5.2 Run isolated real Electron cold start, restart, config import/export, conversation migration,
      conversation export/import, database backup/restore, interruption, secret failure, and cleanup
      scenarios with canonical-path assertions.
- [ ] 5.3 Record the actual commands/results, migrated/retained data inventory, rollback/export procedures,
      unavailable cross-platform checks, and residual user-data/security risks.
