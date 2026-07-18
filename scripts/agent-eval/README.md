# Agent Evaluation Developer Platform

This directory owns development-time evaluation for real Neko Agent behavior. It
drives the canonical TUI runtime through debug automation; it is not an Agent
product capability, a runtime Skill, or a second `AgentSession` assembly.

## Ownership Boundary

- `apps/neko-tui` owns the TUI App/session lifecycle, input queue, runtime
  configuration, Skill lifecycle, Tool/task execution, artifact projection, and
  evaluation-neutral debug facts.
- `scripts/agent-eval` owns authoring decisions, suites, fixtures, controllers,
  hard assertions, artifact checks, Judges, comparisons, reports, and exit codes.
- Every real controller message enters the TUI input queue. Direct Agent turn
  imports, mock providers, and evaluation-only business tools are not acceptance
  evidence.
- Debug facts may expose bounded runtime identities, hashes, states, diagnostics,
  usage, and dropped counts. They must not expose suite, case, score, baseline,
  optimizer, or pass/fail concepts.
- Skill suites bind the portable Skill name to the Host-owned source,
  provenance, root, relative location, and package fingerprint. Market package
  versions, publication state, and install history are outside this platform.

## Directory Layout

```text
scripts/agent-eval/
  authoring/            change-to-suite selection
  ablation/             focused config and isolated implementation matrices
  comparison/           baseline and randomized comparison
  fixtures/             isolated workspace preparation
  judge/                allowlisted external Judge adapters
  reports/              redaction, attribution, and report writers
  runner/               TUI controller, hard gates, artifact checks
  schemas/              strict v2 contracts and retention policy
  shared-fixtures/      committed synthetic workspaces
  suites/
    skills/             Skill-owned suites and index
    agent-runtime/      Prompt/runtime/workflow suites and index
    coverage-index.json coverage and v1 migration ledger
```

Suite discovery is index-backed and strict. Unknown versions, fields, case
kinds, assertion evaluators, setup operations, paths, or references fail before
the TUI is spawned. Flat v1 manifests and `--manifest` execution are removed.

## Authoring Workflow

Before writing prompts, record one decision for each changed Agent behavior:
`reuse`, `update`, `create`, or `excluded`. Use
`authoring/change-selector.mjs` to map changed Prompt, Skill, Tool, model,
session, task/recovery, TUI fact, and evaluation-platform paths to the owning
suite. Unmapped behavior is a coverage error, not a reason to choose a default
suite.

Every decision and scenario starts with an evidence contract:

1. user-visible behavior;
2. canonical runtime path;
3. forbidden fallback;
4. observable runtime or artifact evidence;
5. expected result;
6. expected fail-visible behavior.

Then classify the coverage delta across `canonical`, `paraphrase`, `boundary`,
`failure`, `workflow`, `artifact`, `quality`, `regression`, and `holdout`.
Mark every omitted group not applicable with a reason. Use
[`test-cases.md`](./test-cases.md) for the authoring checklist and supported v2
catalog. The executable schema in [`schemas/contracts.mjs`](./schemas/contracts.mjs)
remains authoritative.

Prefer the smallest evidence set that proves both the result and the path:

- deterministic hard gates for activation/injection, model/config identity,
  Tool/task/process state, structured output, artifacts, permissions, and
  no-fallback;
- owning-domain validators for durable files and media quality;
- an external Judge only for subjective quality after hard gates pass.

Keep three result planes separate:

- **correctness**: deterministic path, configuration, activation, permission,
  format/schema, artifact, and no-fallback hard gates;
- **execution efficiency**: latency, token, cost, iteration, Tool, retry, and
  task metrics;
- **output content quality**: relevance, semantic completeness, constraint
  satisfaction, reasoning, specificity, consistency, and applicable creative
  or aesthetic quality scored from real model output by a suite-owned rubric,
  owning validator, or blind Judge.

Passing hard gates does not make content quality available. `hard-gates-only`
means content quality was not evaluated. An ablation `scenario-rubric` must
exactly match the selected scenario rubric; only retained Judge samples may
produce `qualityMean`. Never map field matches, pass rate, latency, tokens, or
cost into a content-quality score or a model-quality improvement claim.

Missing observability blocks the case. Do not replace it with final-answer text,
metadata, a mock, or an assumption.

## Commands

Run the key-free harness, schema, protocol, report, and all-suite validation:

```bash
pnpm test:agent:eval
```

The all-suite dry-run can also be invoked directly:

```bash
node scripts/agent-eval/all-suite-dry-run.mjs
```

Validate one indexed v2 case without starting provider-backed behavior:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --suite skill.storyboard \
  --case canonical-two-shot-storyboard \
  --dry-run
```

Run the same real case through the canonical TUI by removing `--dry-run`:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --suite skill.storyboard \
  --case canonical-two-shot-storyboard
```

Use `--report-root <relative-or-absolute-directory>` only when the default
gitignored `reports/agent-eval/` root is unsuitable. `--run-id` is available for
stable local correlation. A direct `--cwd` plus `--prompt` protocol smoke is a
diagnostic surface; it does not provide suite-level acceptance evidence.

Run a local focused selection by suite or changed revision range:

```bash
node scripts/agent-eval/local-run.mjs --mode focused --suite skill.storyboard
node scripts/agent-eval/local-run.mjs \
  --mode focused \
  --base-sha <base-sha> \
  --head-sha <head-sha>
```

Run the configured repeated local matrix:

```bash
node scripts/agent-eval/local-run.mjs --mode matrix --repetitions 3
```

Validate a focused ablation plan without starting the TUI or creating a
worktree:

```bash
node scripts/agent-eval/ablation/run.mjs --plan thinking-budget --dry-run
node scripts/agent-eval/ablation/run.mjs --plan media-production-guidance --dry-run
```

Run the same plans against real targets by removing `--dry-run`. Configuration
variants select only declared suite runtime/model profiles. Implementation
variants create detached Git worktrees, verify source/patch/build-recipe
fingerprints, build separate TUI executables, run the same indexed case, and
clean every worktree on success, failure, or timeout. This external command is
the ablation entrypoint; do not add an Agent Skill, product `neko experiment`
alias, direct `AgentSession` runner, or Evaluation-only runtime flag.

The former product `neko experiment` command and Agent experiment exports were
removed. Existing developer scripts must migrate to `ablation/run.mjs`; there is
no compatibility alias. Old `.neko/experiments` output is rebuildable local
developer data and is not imported as an acceptance baseline.

Local real runs require an available provider credential environment variable,
network/model access, and `~/.neko/config.toml`. Missing credentials or config
produce `infrastructure-blocked` with exit code 2; the runner does not substitute
a mock or default success. Cases with a content rubric also require
`NEKO_AGENT_EVAL_JUDGE_ENDPOINT` and `NEKO_AGENT_EVAL_JUDGE_API_KEY`; the Judge
identity and sampling policy are declared by the owning suite.

## Outcomes and Reports

Process exit codes are:

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | all executed hard gates and enabled quality stages passed          |
| `1`  | target behavior failed, regressed, or was non-comparable           |
| `2`  | evaluation infrastructure failed or was blocked                    |
| `3`  | suite, scenario, selection, or effective configuration was invalid |

Each sample writes under
`reports/agent-eval/<suite-id>/<case-id>/<run-id>/`:

- `result.json`: outcome, identities, effective configuration, hard-gate
  results, usage, report locations, skipped stages, and residual risk;
- `evidence.json`: redacted runtime facts and evidence-linked gate results;
- `artifact-manifest.json`: stable artifacts and validator evidence;
- `quality-report.md`: human-readable interpretation;
- `summary.json`: shareable allowlisted summary;
- `judge.json` and `baseline-diff.json` only when those stages execute;
- `aggregate.json` for repeated samples.
- `ablation/<plan-id>/<run-id>/variant-delta.json` for a focused matrix; it
  references standard sample reports and adds external config/build identity
  plus variant deltas rather than defining a second sample result schema.

Repeated aggregates include every sample, hard-gate totals, token/cost
availability, mean/p50/p95 latency, iterations, Tool success/failure, retries,
task terminal counts, and applicable real-output content-quality distribution.
The ablation delta records content quality as `not-evaluated`, `unavailable`, or
`available` with its rubric reference. Correctness and infrastructure outcomes
dominate efficiency and quality deltas. Missing effective config,
identical implementation executables, or policy drift is not comparable.

Interpret the assertion rows before the overall exit code. A correct-looking
answer still fails when canonical-path evidence is absent, a forbidden fallback
participated, facts were truncated, the effective model/config differs, or a
durable artifact cannot be validated. Judge scores are supplemental and cannot
override a failed hard gate. `non-comparable` is not an improvement or a pass.

## Skill and Prompt Optimization Debug Functional

Optimization is an evidence consumer layered on the Evaluation platform. It is
not a second runner, product capability, Agent Skill, core product action, or
automatic repository mutation path. The canonical implementation is under
`scripts/agent-eval/optimization/` and reuses v2 reports, suite discovery,
implementation ablation targets, the TUI runner, Judge adapters, and randomized
comparison.

The lifecycle is:

```text
reported -> proposed -> approved/rejected
approved -> OpenSpec application -> evaluated
evaluated -> accepted/rejected
```

`schemas/optimization-contracts.mjs` defines strict plan, candidate, handoff,
approval, decision, holdout-selection and development-history contracts. Plans
retain report ids, sanitized evidence refs, observed failure, suspected owner,
confidence, missing evidence, expected content improvement, risks, bounded
budgets and the required matrix. Tool/Capability, runtime/session, provider,
artifact and Evaluation infrastructure ownership returns a handoff or blocker
rather than a Prompt patch.

Candidate artifacts are written outside canonical Skill/Prompt paths. The patch
is restricted to the approved target and fingerprinted independently as an
artifact; base and candidate Skill snapshot identities remain the Host-computed
package fingerprints. Approval binds target identity, both Skill fingerprints,
file/section scope, budget and matrix. Any change invalidates approval.
Application produces an `openspec-apply-required` handoff and never edits or
commits canonical content itself.

Development history is sanitized repository metadata under
`quality/skill-development-history/`, not portable package content. It appends
immutable baseline, candidate, evaluated, accepted, rejected and superseded
checkpoints only for explicit development/Evaluation events. Same-name sources
remain distinct, and rename/move continuity requires an explicit lineage
record. Market owns package id, semver, publication, installation and
distribution; optimization history must not create or update them.

The approved matrix resolves optimizer-visible development cases, a protected
regression set, and a content-addressed holdout policy. Holdout case ids and
inputs are loaded only after the candidate and approval are frozen. This policy
is an overfitting control, not a security boundary. Baseline and candidate run
as isolated implementation targets with identical fixture, runtime/model,
sampling, budget, validator and Judge policies. Comparative Judge evidence is
randomized and excludes checkpoint labels, report/revision/build identities,
fingerprints and repository diffs.

Acceptance reads real output-content Judge distributions separately from hard
gates and efficiency metrics. Hard-gate, holdout or protected-regression
failure rejects the candidate regardless of average score. Missing Judge
samples or policy drift is non-comparable. Infrastructure recovery may retry an
unchanged candidate within budget; behavior failures are retained and cannot be
rerun into success. Every final decision records blind order references,
holdout/regression reports, approver, usage/cost availability and residual
bias/overfitting risk.

## Local Execution and Retention

Agent Evaluation is local-only. GitHub Actions and generic CI commands do not run
`pnpm test:agent:eval`, focused cases, repeated matrices, provider-backed behavior,
or report uploads. Developers explicitly invoke the key-free harness or real
runner when an Agent behavior change, review, or release requires that evidence.

Raw reports are gitignored. The local retention policy is 14 days and requires
developer cleanup. Before a summary or approved baseline is committed or shared, remove
credentials, hidden prompt bodies, raw provider configuration, unauthorized
content, machine-specific absolute user paths, cache/runtime handles, and raw
logs. Preserve stable suite/case/run ids, target identity/fingerprint, model and
configuration identity, fixture digest, assertion evidence refs, artifact refs,
usage/cost availability, blocked stages, and residual risk.

Key-free tests and dry-runs prove the harness and committed suite contracts only.
They must never be reported as real provider/model Agent behavior acceptance.
