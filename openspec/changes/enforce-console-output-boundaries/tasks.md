## 1. Boundary Audit

- [x] 1.1 Record the current `no-console` warning count and confirm every occurrence belongs to an intentional output boundary
- [x] 1.2 Confirm the shared logger contract and local manual export scenario do not require runtime code changes

## 2. Quality Gate Implementation

- [x] 2.1 Extend ESLint orchestration regression tests for the production error severity and exact exception paths
- [x] 2.2 Promote `no-console` to error and add only the console transport and manual export executable overrides

## 3. Validation

- [x] 3.1 Run the focused orchestration test and verify zero repository `no-console` warnings
- [x] 3.2 Run repository lint, local CI, legacy-debt, unused-code, OpenSpec, and diff hygiene checks
- [x] 3.3 Complete Neko quality review and document remaining warning batches

## Verification

- Focused orchestration regression passed and repository ESLint reported 584 warnings, 0 errors, and 0 `no-console` findings.
- `CI=1 pnpm ci:local`, `pnpm check:legacy-debt`, strict OpenSpec validation, targeted Prettier, and diff hygiene checks passed.
- L2 Neko quality review found no blocking architecture, contract, safety, or test issues. Remaining warning batches are non-null assertions, unused variables, exhaustive Hook dependencies, unsafe regular expressions, and possible timing attacks.
