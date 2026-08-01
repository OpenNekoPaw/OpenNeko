## 1. Define pnpm orchestration contracts

- [x] 1.1 Add failing tests for root pnpm scripts and retired Turbo configuration.
- [x] 1.2 Add failing tests for CI cache and local act cache-mount removal.

## 2. Migrate task execution

- [x] 2.1 Replace root Turbo build, typecheck, test, coverage, UI build, and clean scripts with pnpm commands.
- [x] 2.2 Preserve test concurrency, coverage no-bail behavior, package filters, and Desktop package ordering.
- [x] 2.3 Align Cut and Tools Webview TypeScript library surfaces exposed by the real pnpm build.

## 3. Remove retired infrastructure

- [x] 3.1 Remove Turbo dependency, lockfile packages, `turbo.json`, telemetry, CI cache, and act cache mount.
- [x] 3.2 Remove repository ignore/scanner exceptions and update current documentation.
- [x] 3.3 Move all repository `.turbo` generated caches to the system Trash and confirm none are recreated.

## 4. Verify canonical paths

- [x] 4.1 Run focused orchestration tests, typecheck, UI build, full build, and dependency checks.
- [x] 4.2 Run formatting, lint, full tests, unused/debt checks, and local CI; record unrelated worktree blockers.
- [x] 4.3 Run native Desktop packaging and perform a risk-based quality review of the final diff.
