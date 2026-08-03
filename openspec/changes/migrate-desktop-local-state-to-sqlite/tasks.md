## 1. Contracts And Schema

- [x] 1.0 Define package ownership: `@neko/host` owns shell/settings contracts and services;
      `@neko/local-metadata` owns SQLite repositories and migration/export workflow; Desktop owns only
      Electron paths, authorized legacy-file adapters, startup wiring and diagnostic projection.
- [x] 1.1 Define package-owned shell-state, application-settings, and migration-marker repository
      contracts without renderer fields, workspace fallback, secrets, or physical paths.
- [x] 1.2 Classify every legacy field under `local-storage-authority-policy` and reject any field that
      is portable, user-managed content, secret, log/journal, Agent-owned, workspace-owned, or
      rebuildable cache rather than application state.
- [x] 1.3 Add versioned SQLite migrations in the existing user-level database namespace and verify
      upgrade, integrity, backup, and unsupported-schema failure.
- [x] 1.4 Add producer/consumer tests for both repository contracts and state/cache transaction
      ownership.

## 2. Transactional Legacy Migration

- [x] 2.1 Implement preflight reads that validate both legacy JSON documents before database mutation.
- [x] 2.2 Import both states and their source digests in one transaction with an idempotent committed
      migration marker.
- [x] 2.3 Verify committed rows through production codecs before atomically archiving matching legacy
      files; reject changed or unknown sources.
- [x] 2.4 Add interruption, partial-input, corrupt-input, repeated-startup, and archive-failure tests
      proving no partial authority switch or JSON fallback.

## 3. Desktop Composition And Canonical Path

- [x] 3.1 Inject package-owned repositories into Host shell-state and application-settings services,
      then reduce Desktop composition to concrete adapter construction and delegation.
- [x] 3.2 Remove or poison normal JSON reads, writes, dual-write branches, and active-workspace
      fallback after the migration marker commits.
- [x] 3.3 Keep preload and renderer contracts unchanged and add AppHost restart tests for restored
      state and preferences.
- [x] 3.4 Add delegation/poison tests proving no Desktop-local repository, migration workflow,
      dual-read or active-workspace fallback can return success.

## 4. Rollback And Verification

- [x] 4.1 Implement an explicit migration-owned downgrade export with codec validation, sibling
      staging, and atomic publication of both legacy documents.
- [x] 4.2 Verify failed downgrade export changes neither SQLite nor existing legacy destinations.
- [x] 4.3 Run affected local-metadata/Desktop tests and typechecks, repository quality gates, and
      isolated real Electron cold-start/restart/migration scenarios.
- [x] 4.4 Document migration timing, recovery diagnostics, archive retention, downgrade procedure,
      and the excluded data ownership boundaries.
- [x] 4.5 Add negative fixtures containing adjacent Agent config, transcript, memory, log, and workspace
      data, including legacy `.neko/workspace.json` and target `neko/project.json`, and prove the
      migration neither reads nor mutates those owners.
