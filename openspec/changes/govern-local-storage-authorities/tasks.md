## 1. Storage Classification And Admission

- [x] 1.1 Extend `@neko/local-metadata` storage classifications with authority kind, user-management,
      portability, SQLite role, sensitivity, deletion, retention, backup, local failure and offline
      repair semantics.
- [x] 1.2 Add classification fixtures for application settings, raw logs, project facts, user content,
      secrets, Agent data, workspace state, rebuildable indexes, retained artifacts and scratch data.
- [x] 1.3 Reject unknown classification, workspace/package databases, raw-log tables, ordinary-store
      secrets and user-content SQLite authorities.
- [x] 1.4 Update storage architecture/docs with the admission sequence and the distinction between
      portability/device transfer and internal schema migration, which is forbidden.

## 2. Agent Configuration Authorities

- [ ] 2.1 Define separate Agent-owned repositories for runtime settings, portable definitions,
      project capability configuration and credential presence/provenance.
- [ ] 2.2 Add stable SQLite state repositories only for eligible machine-local runtime settings; keep
      portable definitions and credentials in their owning authorities.
- [ ] 2.3 Remove product reachability to mixed/retired configuration sources without importing or
      rewriting their bytes.
- [ ] 2.4 Add producer/consumer, config export, corrupt-input, secret-redaction and retired-path absence
      tests.

## 3. Agent Conversation And Memory Authorities

- [ ] 3.1 Define one canonical portable conversation manifest only where user-visible export requires
      it; do not add an internal version discriminator.
- [x] 3.2 Keep conversation leases, checkpoints and task state in Agent-owned stable repositories using
      exact session/request identity instead of writer epochs.
- [x] 3.3 Delete product reachability to retired Agent metadata databases; preserve their bytes.
- [ ] 3.4 Implement database-free conversation export/import from canonical Pi Session facts while
      keeping in-flight operational state fail-visible.
- [ ] 3.5 Keep accepted memory with owning Chara/project files and only rebuildable indexes in cache.
- [ ] 3.6 Add producer/consumer, branch/restart/export/import, cache-loss, retired-database absence,
      explicit-memory and no-log-replay tests.

## 4. Workspace And Log Enforcement

- [ ] 4.1 Audit every retired `.neko/` entry by authority class without reading it in normal product flow.
- [ ] 4.2 Define the canonical `neko/project.json` identity codec without a schema version; keep retired
      `.neko/workspace.json` untouched and product-unreachable.
- [ ] 4.3 Keep machine-local workspace state in `neko.db#state`, rebuildable indexes in
      `neko.db#cache`, and large derived bytes in user-level workspace cache partitions.
- [ ] 4.4 Keep Desktop/Workspace/Agent logs in owner-partitioned files with rotation, retention,
      redaction and explicit deletion.
- [ ] 4.5 Prove retired config/preferences/log/cache paths remain untouched and outside product cleanup.
- [ ] 4.6 Add workspace copy/move, duplicate identity, unknown-file preservation, database/cache loss,
      project-fact rejection, log deletion and retained artifact safety tests.

## 5. Verification

- [ ] 5.1 Run focused Local Metadata, Host, Agent runtime and Desktop tests/typechecks, then full build,
      test, check, legacy-debt and unused gates.
- [ ] 5.2 Run isolated real Electron cold start, restart, config export/import, conversation export/import,
      database backup/restore, secret failure and record-local rejection scenarios.
- [ ] 5.3 Record actual commands/results, canonical/retired path evidence and remaining user-data/security risks.
