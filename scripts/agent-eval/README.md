# Agent Evaluation Developer Platform

This directory owns development-time evaluation contracts for Neko Agent behavior. It is external
test infrastructure, not an Agent product capability or a second `AgentSession` assembly.

## Current Runtime Status

The Desktop application is the only product host. The previous TUI debug-automation driver has been
removed, and Desktop does not yet expose an equivalent complete-session evaluation driver.

Therefore:

- `pnpm test:agent:eval` validates the key-free harness, schemas, suite discovery, hard gates,
  reports, comparisons and dry-run contracts.
- A real provider-backed case is `infrastructure-blocked` until Desktop owns a complete-session
  driver.
- Key-free harness success is not real Agent behavior acceptance.
- The runner must not import `AgentSession` directly or substitute a mock provider, final-answer
  text or default success for missing runtime evidence.

## Ownership Boundary

- `apps/neko-desktop` owns application/session lifecycle, runtime configuration, input dispatch,
  Tool execution and user-visible event projection.
- `scripts/agent-eval` owns authoring decisions, suites, fixtures, hard assertions, artifact checks,
  Judges, comparisons, reports and exit codes.
- A future Desktop driver must enter the same Desktop Agent composition used by the product and
  expose bounded evaluation-neutral facts.
- Runtime facts may expose identities, hashes, states, diagnostics, usage and dropped counts. They
  must not expose suite, case, score, baseline, optimizer or pass/fail concepts.

## Directory Layout

```text
scripts/agent-eval/
  authoring/            change-to-suite selection
  ablation/             focused configuration and implementation matrices
  comparison/           baseline and randomized comparison
  fixtures/             isolated workspace preparation
  judge/                allowlisted external Judge adapters
  optimization/         candidate evaluation state and decisions
  reports/              redaction, attribution, and report writers
  runner/               dry-run boundary, hard gates, artifact checks
  schemas/              strict contracts and retention policy
  shared-fixtures/      committed synthetic workspaces
  suites/               indexed Skill and Agent runtime suites
```

Suite discovery is index-backed and strict. Unknown versions, fields, case kinds, assertion
evaluators, setup operations, paths or references fail before execution.

## Authoring

Record one decision for every changed Agent behavior: `reuse`, `update`, `create` or `excluded`.
`authoring/change-selector.mjs` maps Prompt, Skill, Tool, model, session, Desktop event projection
and evaluation-platform paths to the owning suite.

Every decision and scenario must define:

1. user-visible behavior;
2. canonical Desktop/runtime path;
3. forbidden fallback;
4. observable runtime or artifact evidence;
5. expected result;
6. expected fail-visible behavior.

Use deterministic hard gates for configuration identity, Skill receipt, Tool/process state,
structured output, artifacts, permissions and no-fallback. Use an external Judge only for
subjective quality after hard gates pass.

## Commands

Run the key-free harness and all-suite dry-run:

```bash
pnpm test:agent:eval
```

Validate all indexed cases without starting provider-backed behavior:

```bash
node scripts/agent-eval/all-suite-dry-run.mjs
```

Select a focused real run:

```bash
node scripts/agent-eval/local-run.mjs --mode focused --suite skill.storyboard
```

Until a Desktop complete-session driver exists, real runs return `infrastructure-blocked` with exit
code 2. Missing credentials, provider access or Judge configuration remain independent
infrastructure blockers and never trigger mock or fallback execution.

Validate an ablation plan without starting runtime behavior:

```bash
node scripts/agent-eval/ablation/run.mjs --plan thinking-budget --dry-run
```

Raw reports belong under gitignored `reports/agent-eval/`. Committed summaries must contain only
redacted evidence locations, outcomes, blocking conditions and residual risk.
