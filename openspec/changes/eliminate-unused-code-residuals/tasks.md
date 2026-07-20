## 1. Audit

- [x] 1.1 Record all production and test unused-symbol findings by ownership and intent
- [x] 1.2 Confirm file-level exports and dependencies remain owned by knip rather than local lint cleanup

## 2. Production Cleanup

- [x] 2.1 Remove unused production imports, types, constants, and local helpers
- [x] 2.2 Remove unused production state and assignments with no canonical side effect
- [x] 2.3 Preserve required signatures, catch behavior, iteration, and field omission explicitly

## 3. Test Cleanup

- [x] 3.1 Remove obsolete test imports, helpers, and unused fixture results
- [x] 3.2 Preserve mock and interface signatures with explicit underscore parameters

## 4. Gate And Validation

- [x] 4.1 Confirm zero unused-symbol findings and promote the rule to error
- [x] 4.2 Run focused package tests, local CI, legacy-debt, unused-code, OpenSpec, formatting, and diff checks
- [x] 4.3 Complete Neko quality review and record remaining warning batches

## Verification

- Repository ESLint reports 438 warnings, 0 errors, and 0 `no-unused-vars` findings; the unused-symbol rule is now CI-blocking.
- `pnpm build`, `pnpm test`, `pnpm check:repository-quality`, `pnpm test:local:vscode`, `pnpm check:legacy-debt`, strict OpenSpec validation, targeted Prettier, and diff hygiene checks passed.
- `CI=1 pnpm ci:local` is externally blocked only by formatting in the concurrent `move-agent-logs-outside-workspace` change's `neko-paths.test.ts`; all remaining equivalent gate stages were executed separately and passed.
- L2 Neko quality review found no blocking architecture, contract, safety, or test issues. Remaining warning batches are non-null assertions, exhaustive Hook dependencies, and unsafe regular expressions.
