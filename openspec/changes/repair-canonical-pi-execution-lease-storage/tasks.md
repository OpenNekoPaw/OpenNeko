## 1. Canonical storage contract

- [x] 1.1 Add an isolated SQLite regression test proving the established lease/checkpoint fields support
  exact lease acquisition and checkpoint writes while sibling conversation data remains unchanged.
- [x] 1.2 Restore `@neko/agent-runtime` lease and checkpoint SQL to the single stable physical fields,
  expose equality-only opaque lease identities, and delete the renamed-field path without schema
  dispatch, migration, repair, fallback, or table replacement.
- [x] 1.3 Prove stale-lease rejection, renewal/release, takeover, checkpoint replay, and catalog reads remain
  isolated by exact conversation identity.

## 2. Producer and consumer verification

- [x] 2.1 Run the focused Pi authority/runtime/catalog tests and the affected Agent runtime typecheck/build.
- [x] 2.2 Run the Desktop Agent launch/application consumer tests and verify no test opens or writes the
  user database.
- [x] 2.3 Run `pnpm check:no-internal-versioning`, `pnpm check:storage-authorities`,
  `pnpm check:legacy-debt`, `pnpm check:agent-boundaries`, `pnpm check:openspec`, and
  `git diff --check`; record any unrelated baseline failure and residual risk.

## 3. Runtime acceptance

- [x] 3.1 Launch the authoritative visible Electron application with native `~/.neko/config.toml`, submit
  a basic real Agent conversation through the composer, and confirm terminal convergence without the
  SQLite column error.
- [x] 3.2 Reuse the applicable real-provider Agent runtime evaluation case for basic conversation and
  record provider/model, terminal state, conversation identity, and any blocked evidence without using
  mocks, direct runtime execution, or another configuration source.
