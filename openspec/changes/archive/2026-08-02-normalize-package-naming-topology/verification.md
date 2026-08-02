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

## Documentation and ignore-rule follow-up

- Root README and contributing guides now document the canonical `packages/<name>` and
  `packages/<family>/<role>` layouts, the single `@neko/*` scope, and public-export-only imports.
- Architecture navigation, package taxonomy/boundaries, and the `@neko/shared`, `@neko/ui`, and
  `@neko/assets-domain` package READMEs now match current package roots and manifest exports.
- `.gitignore` no longer ignores every `test/` or `tests/` directory. Generated coverage,
  Playwright, local fixture, report, and build outputs remain ignored by explicit rules.
- Removing the broad test-directory rule exposed
  `packages/canvas/webview/src/test/setupCanvasStoreScope.ts`, a Vitest setup source referenced by
  the package configuration; it is now included as source instead of remaining silently untracked.
- A root-script audit confirmed that every `pnpm` command shown in the root README and contributing
  guides resolves to an existing root script.
- `git check-ignore` proved that a representative source `test/` path is visible while `dist/`,
  `coverage/`, `.test-workspaces/`, and root `reports/` remain ignored.
- `pnpm check:test-orchestration`, `pnpm check:package-boundaries`, `pnpm check:package-roles`,
  `pnpm check:product-brand`, `pnpm --filter @neko/canvas-webview test`, targeted Prettier checks,
  `pnpm check:openspec`, strict change validation, and `git diff --check` passed.
- A post-documentation `pnpm ci:local` rerun passed the complete build, 4,799 workspace tests,
  repository-quality checks, and native macOS arm64 Desktop packaging.

## Residual risk

- ESLint reports 206 pre-existing warnings and zero errors; the migration introduced no lint error.
- Knip reports 71 configuration hints and no unused-file or unused-export failure.
- Provider-backed Agent behavior evaluation was not run because this package-topology migration does not change prompts, Skills, capability routing, provider/model selection, or AgentSession behavior, and no external credential/cost authorization was provided. The key-free Agent evaluation harness and real Desktop consumer composition were run instead.
- This is a pre-release package identity and physical-root break. There is no user-data format change or migration. Consumers must use the new canonical identities; no alias package or compatibility export is retained.
