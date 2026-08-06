## Verification Evidence

Date: 2026-08-06

### Deterministic gates

- `pnpm build` passed for all build-owning workspaces and Electron Forge packaging on
  `darwin-arm64`.
- `pnpm test` passed, including Local Metadata 84 tests, Assets Node 65 tests, Agent Runtime 1055
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

Agent configuration authority evidence:

- `pnpm test` passed after the Agent authority changes, including Host 295 tests, Agent Contracts
  261 tests, Agent Webview 690 tests, Agent Runtime 1055 tests and Desktop 392 tests.
- Runtime settings use the stable `agent_runtime_settings` table in the shared user-level
  `neko.db`. Focused repository tests proved database reopen retention, exact `scope_id` isolation,
  corrupt-row diagnostics, blocked implicit replacement and explicit reset.
- Config export/import tests proved strict provider/model definition decoding and secret redaction.
  Product TOML parsing rejects credential fields; Agent credential status/provenance is read only
  through the CredentialStore/SecretStorage owner.
- Producer/consumer tests proved Host diagnostics and the Agent wire contract share
  `missingProviderEndpoint`. Desktop secret-safe projection now reconstructs every renderer field
  from a whitelist, so structurally injected `apiKey` data cannot cross the boundary.
- Static reachability scans found no remaining settings hook loader, UI metadata registry,
  config credential importer/resolver, provider credential mutation runtime, secret-bearing export
  option or old diagnostic code under Agent, Host or Desktop production entries.
- Existing retired config bytes were not read, imported, rewritten or deleted.

### Agent Evaluation

- Authoring decision: `reuse` the indexed `agent-runtime.model-binding` suite and its
  `explicit-chat-model` case for provider/model routing. Corrupt-row isolation and secret ownership
  remain deterministic repository/security assertions.
- `pnpm test:agent:eval` passed 44 files and 283 key-free harness tests; all 22 indexed suites and
  52 cases passed dry-run validation. This is infrastructure evidence, not Agent behavior evidence.
- The focused real case returned `infrastructure-blocked` before Desktop/API startup because
  explicit provider, model and cost authorization were not present. No real Agent behavior pass is
  claimed.

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
- `pnpm test:local:ui --scenario desktop-agent-diagnostic-portal` passed:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T14-09-17.722Z-desktop-agent-diagnostic-portal-development/report.json`.
  The isolated real Electron runtime showed the Agent diagnostic in a readable 360px fixed portal,
  retained the adjacent Resource dock and reported no console error, warning or exception. The
  screenshot was inspected for clipping, overlap, text fit and layering.

Both scenarios used an isolated temporary home. The real `~/.neko/neko.db` was not opened,
rewritten or migrated.

### Evaluation disposition

Agent Evaluation is excluded. These changes affect deterministic local repository discovery,
catalog enumeration and presentation projection; they do not change prompts, Skills, tool routing,
provider/model selection, AgentSession execution, queues or model behavior.

### Remaining risk

- Task 5.2 remains open: isolated config export/import, conversation export/import, database
  backup/restore and secret-failure scenarios have not yet run.
- Real provider/model UI behavior remains blocked by missing explicit provider/model/cost
  authorization; deterministic model-binding and secret-boundary tests passed.
- The change remains local-only. Cloud synchronization is intentionally absent.
- Existing unreachable internal inventory-state bytes, if present in a user's database, are left
  untouched. Product code no longer reads, writes, repairs or deletes them.
