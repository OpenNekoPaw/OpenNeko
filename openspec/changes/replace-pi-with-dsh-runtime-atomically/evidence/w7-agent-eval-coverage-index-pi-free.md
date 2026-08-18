# W7 Agent Evaluation Coverage Index Pi-Free Narrow Fix

## Scope

`scripts/agent-eval/suites/coverage-index.test.mjs` previously imported deleted Pi runtime paths:

- `@earendil-works/pi-agent-core/node`
- `packages/agent/runtime/src/pi/skill-host.ts`

Those imports have been removed. The coverage-index test now derives current builtin Skill targets from the canonical portable suite discovery contract (`discoverSuites()`), using each `suite.target.identity` for exact `name`, `source`, `provenance`, `rootId`, `relativePath`, and `fingerprint`.

The test still asserts the original intended semantics that remain valid:

- every current builtin Skill appears in `EXPECTED_BUILTIN_SKILLS`;
- each builtin Skill has a `builtin-skill` coverage target with `disposition: suite`;
- the coverage target references the exact Skill suite;
- each portable Skill target carries exact Host identity fields and a `sha256:` fingerprint;
- no builtin Skill is excluded from suite coverage.

No Pi implementation, Skill Host, `NodeExecutionEnv`, compatibility fixture, direct runtime runner, mock behavior acceptance, or DSH embedded runtime was restored.

## Verification

```bash
pnpm exec vitest run scripts/agent-eval/suites/coverage-index.test.mjs
pnpm test:agent:eval
grep -R "from '@earendil-works/pi-agent-core/node'\|from '../../../packages/agent/runtime/src/pi\|import.*src/pi/skill-host" -n scripts/agent-eval --include='*.mjs' --include='*.js' || echo NO_PI_IMPORTS
```

All passed. This evidence supports the narrow 10.1/10.3 progress note; the tasks remain open because the full `scripts/agent-eval` canonical facts/assertions/reports migration is not yet complete.
