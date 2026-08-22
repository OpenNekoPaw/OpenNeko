## Verification

- `pnpm test` in `apps/neko-desktop`: passed, 102 files / 616 tests.
- `pnpm typecheck` in `apps/neko-desktop`: passed.
- `pnpm check:openspec`: passed, 136 items.
- `rg` for the deleted policy path and symbols: no matches.
- `pnpm check:unused`: executed and failed on existing repository-wide findings (7 unused files,
  2 unused dependencies, 1 unused devDependency, 2 unlisted dependencies, and 162 unused exports).
  Neither the removed extension policy nor any new symbol from this change appeared in the report.

Residual risk: the repository-wide unused-code baseline remains red outside this change. The removed
policy had no production consumer and no persisted user data, so deletion requires no migration.
