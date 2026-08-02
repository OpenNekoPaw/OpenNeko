# Verification

## Canonical topology evidence

- `pnpm check:package-roles` passed for 32 canonical package roots.
- `pnpm check:package-boundaries` passed and rejects legacy scopes, redundant `packages/neko-*` roots, and path/name drift.
- `find packages -maxdepth 1 -type d -name 'neko-*' -print` returned no package roots.
- Every source-bearing package manifest uses the single `@neko/*` scope.
- Executable imports, current configuration, and current manifests contain no old multi-scope package identity or obsolete physical package root. Historical OpenSpec records, cleanup ledgers, and negative rejection tests retain old strings only as historical or poison evidence.

## Commands executed

- `pnpm install --offline`
- `pnpm check:package-roles`
- `pnpm check:package-boundaries`
- `pnpm check:strict-tsconfig`
- `pnpm check:deps`
- `pnpm check:test-orchestration`
- `pnpm typecheck`
- `pnpm check:unused`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `pnpm test`
- `pnpm test:agent:eval`
- `pnpm test:functional:headless`
- `pnpm test:local:ui --scenario=all-openneko-consumers`
- `pnpm check:legacy-debt:ledger`
- `pnpm check:quality`
- `pnpm ci:local`
- `openspec validate normalize-package-naming-topology --strict`
- `git diff --check`

All commands passed after migration fixes. The real Electron command passed the isolated development Cut, Canvas, and Preview consumer scenarios. The Agent evaluation harness passed 245 tests and dry-ran 22 suites containing 51 cases. The headless Desktop functional command passed 104 tests.

## Residual risk

- ESLint reports 206 pre-existing warnings and zero errors; the migration introduced no lint error.
- Knip reports 71 configuration hints and no unused-file or unused-export failure.
- Provider-backed Agent behavior evaluation was not run because this package-topology migration does not change prompts, Skills, capability routing, provider/model selection, or AgentSession behavior, and no external credential/cost authorization was provided. The key-free Agent evaluation harness and real Desktop consumer composition were run instead.
- This is a pre-release package identity and physical-root break. There is no user-data format change or migration. Consumers must use the new canonical identities; no alias package or compatibility export is retained.
