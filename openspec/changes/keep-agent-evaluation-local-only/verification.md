## Evaluation Scope

- Change: make Agent Evaluation local-only and prevent GitHub Actions or generic CI scripts from triggering it.
- Decision: `excluded` from real provider-backed Agent behavior Evaluation because the change only alters external Evaluation infrastructure ownership and cannot change target Agent behavior.
- Deterministic evidence: static workflow/script reachability guard, local runner unit tests, key-free harness validation, and strict OpenSpec validation.
- Forbidden fallback: no disabled workflow, manual dispatch, schedule, generic CI indirection, compatibility runner alias, mock lane, or GitHub report upload remains.

## Verification

- `node --test scripts/test-orchestration/agent-evaluation-local-only.test.mjs` — passed 2/2. All GitHub workflows are free of Evaluation references; generic CI script closure excludes Evaluation; explicit local commands remain.
- `pnpm exec vitest --config vitest.agent-eval.config.mts --run scripts/agent-eval/local-run.test.mjs` — passed 5/5.
- `pnpm test:agent:eval` — passed 39 files / 277 tests and key-free dry-ran 23 suites / 45 cases. This is local harness evidence only, not real Agent behavior acceptance.
- `openspec validate keep-agent-evaluation-local-only --strict` — passed.
- Targeted `pnpm exec prettier --check ...` — passed.
- Targeted `git diff --check -- ...` — passed.
- Independent `.github/workflows` scan for Evaluation commands, paths, credentials, reports, and runner references — passed with no matches.

## Repository Baseline Outside This Change

`pnpm check:test-orchestration` ran 79 tests: 72 passed and 7 failed outside this change. The new local-only boundary suite passed 2/2. Existing failures reference removed or unowned workspace inventory and functional scenarios for `apps/neko-home`, `packages/neko-story`, `packages/neko-audio`, `packages/neko-market`, and other absent products, plus the new unowned `packages/neko-canvas/packages/domain` workspace. None of those ownership, coverage, or scenario files are changed by this OpenSpec.

`pnpm check:legacy-debt` failed on the existing baseline with 202 blocking occurrences (194 `migrate-now`, 8 `needs-review`). This change does not add the affected production code paths.

`pnpm check:unused` failed on the existing baseline with 72 unused exports and 12 configuration hints. The new `local-run.mjs` entry is registered in Knip and was not reported as unused.

## Residual Risk

- Provider-backed regressions no longer run automatically on push or schedule. Agent behavior changes and release readiness must explicitly invoke and record the appropriate local Evaluation.
- The repository-wide test-orchestration, legacy-debt, and unused-code baselines remain red until their separate cleanup work is completed.
