## Verification Evidence

Date: 2026-08-06

### Deterministic gates

- `pnpm build` passed for all build-owning workspaces and Electron Forge packaging on
  `darwin-arm64`.
- `pnpm test` passed, including Local Metadata 84 tests, Assets Node 65 tests, Agent Runtime 1056
  tests and Desktop 392 tests.
- `pnpm check` passed: unused analysis completed and dependency-cruiser reported no violations
  across 1417 modules and 4806 dependencies.
- `pnpm check:no-internal-versioning` passed with 0 baseline internal occurrences and 0 new
  internal occurrences. The gate now rejects versioned table files/names, table-generation
  identifiers, `PRAGMA user_version` and version-suffixed DDL.
- `pnpm check:legacy-debt` passed with 0 blocking production occurrences.
- `openspec validate govern-local-storage-authorities --strict --no-interactive` passed.
- `git diff --check` passed.

Focused table and local-failure evidence:

- `node --test scripts/check-no-internal-versioning.test.mjs` passed 11 tests.
- `pnpm --filter @neko/agent-runtime exec vitest run src/pi/__tests__/node-conversation-authority.test.ts`
  passed 10 tests. Unknown columns remain readable; a missing required column fails explicitly.
- Focused Local Metadata, Assets Node and Desktop discovery tests passed after deleting
  `asset_library_inventory_state` and `initializeExistingInventory`.

### Real Electron

- `pnpm test:local:ui --scenario asset-library-record-removal` passed:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T12-32-19.897Z-asset-library-record-removal-development/report.json`.
  It proved an unavailable membership remains visible with `sourceRelativePath`, a valid sibling
  remains usable, identity-scoped removal preserves source bytes and the removal persists after
  restart.
- `pnpm test:local:ui --scenario no-active-project-catalogs` passed:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T12-51-02.714Z-no-active-project-catalogs-development/report.json`.
  With no active Project, it proved historical Conversations, retained Workspace rows and retained
  Asset memberships remain visible. Diagnostics exposed `workspaceId`, `currentLocator`,
  `orphanedAt` and `sourceRelativePath`; both management catalogs opened in list mode.

Both scenarios used an isolated temporary home. The real `~/.neko/neko.db` was not opened,
rewritten or migrated.

### Evaluation disposition

Agent Evaluation is excluded. These changes affect deterministic local repository discovery,
catalog enumeration and presentation projection; they do not change prompts, Skills, tool routing,
provider/model selection, AgentSession execution, queues or model behavior.

### Remaining risk

- Task 5.2 remains open: isolated config export/import, conversation export/import, database
  backup/restore and secret-failure scenarios have not yet run.
- The change remains local-only. Cloud synchronization is intentionally absent.
- Existing unreachable internal inventory-state bytes, if present in a user's database, are left
  untouched. Product code no longer reads, writes, repairs or deletes them.
