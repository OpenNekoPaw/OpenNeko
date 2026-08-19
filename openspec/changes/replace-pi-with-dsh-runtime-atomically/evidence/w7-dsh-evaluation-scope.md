# W7 DSH Evaluation Scope

## Decision

Pi-era tests and DSH tests are not an atomic one-for-one migration. DSH is the
authority for generic Agent behavior, so OpenNeko does not duplicate tests for
the standard Agent loop, session/history implementation, Skill runtime, Tool
scheduling, or permission preset semantics.

Active Evaluation scenarios now omit the retired `pi-runtime` assertion. The
coverage index records the five DSH-owned capabilities as `excluded` with a
deterministic bridge/contract check. This keeps the distinction visible and
prevents a Pi assertion from silently becoming a DSH product requirement.

OpenNeko-owned coverage remains required for:

- ACP/DSH transport, Session binding, lifecycle, cancellation and fail-local diagnostics;
- model/configuration projection and permission selection at the sender-bound boundary;
- Skill/MCP provenance projection and command/mention input paths;
- Generation, Canvas, Cut, Character, Assets and World domain Tool delegation;
- attachment/multimodal/perception routing and evidence;
- durable Job/artifact facts, recovery and Conversation isolation;
- poison checks proving Pi, direct runtime, fallback provider and stale projection paths are unreachable.

Historical Pi evaluator helpers remain in the migration worktree only until the
canonical DSH Desktop driver can provide the real user path. They are not
indexed active coverage and cannot produce production Evaluation success.

## Verification

```bash
pnpm exec vitest run scripts/agent-eval/suites/coverage-index.test.mjs
node scripts/agent-eval/all-suite-dry-run.mjs
```
