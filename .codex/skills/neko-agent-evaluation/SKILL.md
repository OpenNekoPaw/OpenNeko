---
name: neko-agent-evaluation
description: Plan, create, validate, run, and analyze script-driven evaluations and evidence-based Skill/Prompt optimization for Neko Agent behavior changes. Use when work affects prompts, Skills, capability or tool routing, provider/model selection, AgentSession workflows, asynchronous tasks, validation/recovery, or TUI Agent event projection; also use when asked to add an Agent evaluation, verify a real Agent path, analyze a Skill/Prompt quality defect, or provide Agent evaluation evidence for OpenSpec, review, or release readiness.
---

# Neko Agent Evaluation

Produce path-level evidence for real Neko Agent behavior through the repository's
external Evaluation platform.

## Preserve Ownership

Treat Neko Agent as the system under test:

- Keep authoring decisions, suites, fixtures, orchestration, assertions, Judges,
  comparisons, and reports in the repository Evaluation platform.
- Drive the complete TUI session owner and input path. Do not import a turn runner,
  create another session assembly, or count mock behavior as acceptance.
- Keep runtime observability neutral. Add a generally useful runtime fact or
  control only when the owning contract lacks evidence required beyond
  Evaluation.
- Do not register Evaluation authoring or execution as an Agent Skill, product
  capability, or alternate CLI workflow.
- Keep Market identity, versioning, publication, installation, and distribution
  outside Evaluation. Skill targets use portable identity plus the Host-owned
  source/location projection and content fingerprint.

Before acting, read the relevant OpenSpec artifacts, Agent architecture, current
Evaluation developer documentation, changed runtime code, existing indexed
suites, and executable runner tests. Current code and strict suite discovery are
authoritative when historical reports disagree.

## Decide Whether Evaluation Is Required

Require focused real behavior evidence when a change can affect:

- Prompt composition or Skill selection, injection, method, or output;
- capability/Tool registration, routing, validation, result handling, or
  permissions;
- provider, model, profile, or effective runtime configuration;
- multi-turn sessions, queues, continuation, asynchronous tasks, cancellation,
  resume, recovery, or artifact delivery;
- runtime evidence projected to TUI or another Agent host.

Use deterministic tests instead when a change is limited to pure parsing,
strict schema validation, or unrelated non-Agent logic. An exclusion must name
the deterministic validation and explain why real Agent behavior cannot change.

## Authoring Decision

For every affected behavior, choose exactly one disposition:

- `reuse`: an existing suite already proves the changed contract;
- `update`: the owner remains correct but cases, evidence, fixtures, or profiles
  must change;
- `create`: no suite owns the behavior and a new target-scoped suite is needed;
- `excluded`: deterministic non-Agent validation is sufficient.

Use the repository change-to-suite mapping before choosing. Do not assign an
unmapped path to a convenient default suite. Record the user-visible behavior,
target owner, selected suite, coverage delta, and rationale in the active
change or its Evaluation evidence.

For a Skill target, distinguish same-named project, personal, builtin, plugin,
and Marketplace sources through the full Host identity. Bind the case to the
Host-computed package fingerprint for the tested development snapshot. Do not
invent Skill semver or derive identity from an active selection.

## Define Evidence Before Prompts

For each case, state:

1. user behavior;
2. canonical runtime path;
3. observable runtime or artifact evidence;
4. forbidden fallback;
5. expected result;
6. expected fail-visible behavior.

Evidence should prove activation/injection, effective model/configuration,
Tool/task/process state, durable artifact identity, diagnostics, and source
provenance as applicable. A final answer is evidence of output, not proof of the
path that produced it.

Audit current runtime facts and public validators before accepting the case. If
required evidence is unavailable, identify the minimal neutral observability
gap and report the case blocked. Do not substitute metadata, weak text matching,
manual assumptions, or silent fallback.

## Select Focused Coverage

Start with the smallest set that can reject an incorrect implementation:

- one canonical positive case proving the new path;
- one boundary or failure case proving unavailable, invalid, denied, disabled,
  or wrong-target states cannot return success;
- artifact, workflow, quality, regression, paraphrase, or holdout cases only
  where the behavior requires them.

Artifact-producing changes need durable identity and owning-validator evidence.
Prompt and Skill changes should cover trigger paraphrases and adjacent negative
requests. Workflow changes should prove ordering and terminal state. Prelaunch
replacements should poison or explicitly reject the old path.

Use deterministic hard gates for path, configuration, process, format,
permission, artifact, and no-fallback behavior. Use an owning-domain validator
for real artifact quality. Use a Judge only for subjective quality after hard
gates pass; it cannot repair or override a deterministic failure.

Configuration variants must correspond to real session-scoped product settings
and be proven from effective runtime evidence. Do not add Evaluation-only flags.
When an ablation removes an implementation rather than changing a supported
setting, compare isolated revisions or builds through the external platform.

## Validate and Run

Follow the progressive validation and execution workflow documented by the
Evaluation platform:

1. validate key-free schemas, runner semantics, assertions, reports, and every
   indexed suite;
2. validate the selected case without provider-backed behavior;
3. run the same focused case through the real TUI when credentials, network,
   model access, configuration, and fixtures are available;
4. use repeated samples when making stability or quality claims.

Concrete commands, suite/scenario fields, controller operations, assertion
kinds, and report file layouts belong in the platform developer documentation,
not in this Skill.

## Interpret Evidence

Read assertion-level evidence before the overall outcome. Confirm:

- requested and effective target/model/configuration identities match;
- canonical-path evidence is complete and bounded fact collections did not drop
  required observations;
- forbidden Skills, Tools, models, adapters, legacy fields, and fallbacks did
  not participate;
- task/process state reached the expected terminal condition;
- durable artifacts exist under stable identities and passed owning validators;
- Judge input was allowlisted and its score remains supplemental;
- baseline inputs are comparable before describing improvement;
- every repetition is retained and cost availability is explicit.

Separate target behavior failure, Evaluation infrastructure failure,
configuration invalidity, and non-comparability. Failure attribution is a
hypothesis unless evidence proves the owning layer; record confidence and
missing evidence instead of presenting guesses as root cause.

## Optimize From Evidence

Optimize Prompt or Skill content only after Evaluation evidence identifies an
observed content-quality failure and supports its owner. Preserve the observed
failure, suspected owner, confidence, evidence references, and missing evidence
as separate facts. Route Capability or Tool, runtime or session, provider,
artifact, and Evaluation infrastructure defects to their canonical owners;
do not compensate for them with Prompt wording. Treat Prompt routing as
optimizable only when independent evidence confirms Prompt ownership.

For a Skill, bind every development state to its complete Host identity and
Host-computed package fingerprint. Keep same-named project, personal, builtin,
plugin, and Marketplace sources distinct. Record only explicit baseline,
candidate, evaluated, accepted, rejected, or superseded checkpoints; do not
turn ordinary file saves into versions. Carry continuity across a rename or
move only through explicit lineage. Keep this development history outside the
portable Skill package, and keep package versions, publication, installation,
and distribution in Market ownership.

Produce a reviewable plan and candidate artifact without changing canonical
content. Require explicit human approval bound to the identity, base and
candidate fingerprints, scope, budget, and protected Evaluation matrix. Apply
an approved candidate through the normal repository change workflow, then
compare isolated baseline and candidate targets with matching policies. Hide
candidate identity from comparative Judges and from optimizer-hidden holdouts.

Accept a candidate only when canonical path hard gates, holdout cases, protected
regressions, and real output-content quality evidence all pass. Formatting,
latency, token use, cost, or a favorable visible-case average cannot override a
protected failure. Stop at candidate, iteration, time, token, cost, or
no-improvement limits, and never retry a behavior failure into success. Record
accepted and rejected outcomes with their evidence and remaining bias or
overfitting risk; local acceptance is not Market publication.

## Record Residual Risk

Record the suite/case/run, real execution attempted, target and model identities,
path and no-fallback evidence, artifact evidence, quality stage, report location,
usage/cost availability, blocked or skipped cases, and remaining risk.

Key-free validation, dry-run selection, mock output, direct turn injection, a
good final answer, or a single Judge score are not real Agent behavior
acceptance. When infrastructure is unavailable, preserve the exact blocker and
the behavior still unverified.

## Output Format

```text
Evaluation Scope
- Change/feature:
- Decision and owning suite:
- Why real Evaluation is or is not required:
- Canonical path and forbidden fallback:

Cases
- Reused, updated, created, or excluded:
- Evidence and coverage:
- Missing observability:

Verification
- Key-free validation:
- Real cases and reports:
- Blocked or unexecuted cases:

Interpretation
- Result and quality comparison:
- Confirmed failures vs attribution hypotheses:

Residual Risk
- ...
```
