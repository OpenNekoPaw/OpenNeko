## 1. Contracts And Schema

- [ ] 1.1 Define state-owned shell-state, application-settings, and migration-marker repository
      contracts without renderer fields, workspace fallback, secrets, or physical paths.
- [ ] 1.2 Add versioned SQLite migrations in the existing user-level database namespace and verify
      upgrade, integrity, backup, and unsupported-schema failure.
- [ ] 1.3 Add producer/consumer tests for both repository contracts and state/cache transaction
      ownership.

## 2. Transactional Legacy Migration

- [ ] 2.1 Implement preflight reads that validate both legacy JSON documents before database mutation.
- [ ] 2.2 Import both states and their source digests in one transaction with an idempotent committed
      migration marker.
- [ ] 2.3 Verify committed rows through production codecs before atomically archiving matching legacy
      files; reject changed or unknown sources.
- [ ] 2.4 Add interruption, partial-input, corrupt-input, repeated-startup, and archive-failure tests
      proving no partial authority switch or JSON fallback.

## 3. Desktop Composition And Canonical Path

- [ ] 3.1 Inject the new repositories into existing shell-state and application-settings services.
- [ ] 3.2 Remove or poison normal JSON reads, writes, dual-write branches, and active-workspace
      fallback after the migration marker commits.
- [ ] 3.3 Keep preload and renderer contracts unchanged and add AppHost restart tests for restored
      state and preferences.

## 4. Rollback And Verification

- [ ] 4.1 Implement an explicit migration-owned downgrade export with codec validation, sibling
      staging, and atomic publication of both legacy documents.
- [ ] 4.2 Verify failed downgrade export changes neither SQLite nor existing legacy destinations.
- [ ] 4.3 Run affected local-metadata/Desktop tests and typechecks, repository quality gates, and
      isolated real Electron cold-start/restart/migration scenarios.
- [ ] 4.4 Document migration timing, recovery diagnostics, archive retention, downgrade procedure,
      and the excluded data ownership boundaries.
