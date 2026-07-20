## 1. Security Finding Audit

- [x] 1.1 Confirm all current timing-attack findings compare public slash-command arguments rather than secrets
- [x] 1.2 Confirm existing parser contracts and focused test ownership

## 2. Regression And Implementation

- [x] 2.1 Expand parser and ESLint orchestration tests before changing implementation
- [x] 2.2 Rename the public argument variable without changing the parser contract
- [x] 2.3 Promote the timing-attack security rule to error after reaching zero findings

## 3. Validation

- [x] 3.1 Run focused parser and orchestration tests plus repository lint analysis
- [x] 3.2 Run local CI, legacy-debt, unused-code, OpenSpec, formatting, and diff checks
- [x] 3.3 Complete Neko quality review and record remaining warning batches

## Verification

- Focused Character Dialogue tests passed with 28 tests, orchestration tests passed with the timing-attack rule at error severity, and repository ESLint reported 578 warnings, 0 errors, and 0 timing-attack findings.
- `CI=1 pnpm ci:local`, `pnpm check:legacy-debt`, strict OpenSpec validation, targeted Prettier, and diff hygiene checks passed; `check:unused` retained one existing non-blocking knip configuration hint.
- L2 Neko quality review found no blocking architecture, security, contract, or test issues. Remaining warning batches are non-null assertions, unused variables, exhaustive Hook dependencies, and unsafe regular expressions.
