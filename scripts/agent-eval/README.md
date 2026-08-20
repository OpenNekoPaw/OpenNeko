# Agent Evaluation Developer Platform

This directory owns development-time evaluation contracts for Neko Agent behavior. It is external
test infrastructure, not an Agent product capability or a second `AgentSession` assembly.

In repository acceptance language, Agent Evaluation means behavior executed through a configured
real provider API. `pnpm test:agent:eval` is only the key-free harness self-test; it validates
Evaluation infrastructure but is not itself AI behavior Evaluation.

## Current Runtime Status

The Desktop application is the only product host. The previous TUI debug-automation and Pi-era
Desktop drivers have been removed. Desktop Evaluation now uses the public DSH Session, Permission,
Runtime and Shell bridges inside the complete application owner. The focused runner has no case-id
whitelist: it resolves an indexed Scenario into an immutable execution case and interprets canonical
submit, idle-only model configuration, typed Command/Skill invocation, approval, cancellation,
resume/restart, feedback, lifecycle and idle steps through one driver. Retired queue/send-now paths
cannot execute. Pi-era Draft binding replacement, pre-Session Draft input and their synthetic
rejection facts are no longer part of the Scenario contract; ordinary first submit stays on the
visible Composer path.

Therefore:

- `pnpm test:agent:eval` validates the key-free harness, schemas, suite discovery, hard gates,
  reports, comparisons and dry-run contracts.
- A supported focused case launches the real Desktop composition, uses the public Agent input path,
  verifies assertion-referenced terminal evidence and closes the application.
- Indexed cases requiring an unsupported operation or evidence adapter fail before Desktop launch;
  adding a per-case script is not an allowed workaround.
- Key-free harness success is not real Agent behavior acceptance.
- The runner must not import `AgentSession` directly or substitute a mock provider, final-answer
  text or default success for missing runtime evidence.

## Real-Provider Acceptance Lanes

Agent development uses two complementary local lanes:

- Feature acceptance drives a visible Electron window through actual user controls and a real
  provider API. It must prove the submitted UI action, exact conversation/Scene identity, rendered
  response, terminal controls, navigation state and visible diagnostics. Fixture automation may
  observe or select controls, but it must not create the conversation through a bridge or seed the
  success state.
- Batch behavior evaluation runs without a visible UI while retaining the complete Desktop app and
  session owner, public Agent input path, production provider/model resolution and real API. It is
  not permission to call a turn runner directly, replace the Desktop assembly or use a mock.

The foundational regression matrix covers basic and multi-turn conversation, context compaction
with continuation, transcript restoration after a real owner/application reopen, generation
Tool/Job/artifact record restoration, switching between multiple conversations, and isolation of
transcripts, configuration, context, artifacts and asynchronous state. DSH active-session inbox is
excluded until the public Desktop product operation and release-preservation semantics are
qualified. A focused change may run only the affected cells, but its report must record the
disposition of every cell. Session, persistence, projection and release acceptance require the full
applicable matrix.

## Ownership Boundary

- `apps/neko-desktop` owns application/session lifecycle, runtime configuration, input dispatch,
  Tool execution and user-visible event projection.
- `scripts/agent-eval` owns authoring decisions, suites, fixtures, hard assertions, artifact checks,
  Judges, comparisons, reports and exit codes.
- The Evaluation Skill assists authoring and interpretation; it does not own step protocols,
  handler registration, pass/fail, credentials, process lifecycle or execution policy.
- The runner resolves strict declarative artifacts and enters the same Desktop Agent composition
  used by the product. Desktop exposes only fixed product-equivalent operations and bounded
  evaluation-neutral facts.
- Runtime facts may expose identities, hashes, states, diagnostics, usage and dropped counts. They
  must not expose suite, case, score, baseline, optimizer or pass/fail concepts.

## Extension Model

Ordinary coverage additions create or update indexed suite, Scenario, fixture, assertion and
ablation-plan artifacts. They do not generate executable JavaScript, add a case-id whitelist or
create one Desktop adapter per case. Unsupported operations, missing assertion evaluators and
missing evidence fail before Desktop launch with an owning diagnostic.

There is no standalone compiler service or workspace. Existing strict validation owns schema,
references, supported kinds and workflow state. A thin, pure runner step resolves a validated
selection into an internal immutable case and passes it to the common workflow interpreter,
Desktop driver and existing hard-gate/artifact/Judge/report stages. The internal resolved case is
not persisted or independently versioned. Extraction requires demonstrated cross-process plan
transport, multiple real backends or immutable plan caching.

Repeated case execution assigns one stable run identity per repetition and launches one isolated
Desktop lifecycle for each sample. Every sample keeps its standard report set; the case-level
`aggregate.json` retains effective configuration, assertion and artifact-validator results,
artifact refs, usage/cost availability, optional Judge/baseline evidence and residual risk. A
behavior failure remains a retained sample result and is never retried into success.

Package-specific UI and artifact semantics remain with the owning package. Shared Desktop
functional infrastructure owns only Electron launch, fixture isolation, CDP interaction,
observation, screenshot/report handling and cleanup.

## Directory Layout

```text
scripts/agent-eval/
  authoring/            change-to-suite selection
  ablation/             focused configuration and implementation matrices
  comparison/           baseline and randomized comparison
  fixtures/             isolated workspace preparation
  judge/                allowlisted external Judge adapters
  matrix/               deterministic expansion, sharding, budgets, and worker limits
  optimization/         candidate evaluation state and decisions
  reports/              redaction, attribution, and report writers
  runner/               thin case resolution, workflow execution, hard gates, artifact checks
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
3. observable runtime or artifact evidence;
4. expected result;
5. expected fail-visible behavior.

Use deterministic hard gates for configuration identity, Skill receipt, Tool/process state,
structured output, artifacts and permissions. Use an external Judge only for
subjective quality after hard gates pass.

Skill-assisted authoring produces reviewable declarative drafts. The strict schema and runner are
the execution authority. A draft cannot register code, infer an unsupported operation or override
the repository execution lane. Only a genuinely new public operation or domain evidence boundary
justifies an owning contract/evaluator implementation; an unimplemented scaffold must fail visibly.

## Commands

All commands in this section are explicit local developer operations. GitHub Actions and generic CI
script composition must not invoke them or upload their reports.

Run the key-free harness and all-suite dry-run locally:

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

Real API entrypoints read their user-authorized source only from `~/.neko/config.toml`; CLI
environment cannot redirect this path. Provider/model identity and cost authorization remain
explicit. The Desktop Evaluation boundary validates the native non-secret TOML and copies it
unchanged into the isolated fixture home; it does not compile another format, merge
defaults, infer providers or write back to the user directory. Any readable source mode, including
`0644`, is accepted; Evaluation neither requires an exact POSIX mode nor changes the source file's
permissions. Missing authorization, an unavailable
source/provider, or a case requiring an unsupported operation/evidence contract returns
`infrastructure-blocked` with exit code 2 and never triggers JSON/YAML/mock fallback execution.

Provider-backed runs require the developer to provide explicit provider/model identity and cost
authorization for each invocation. The TOML contains only non-secret provider/model definitions;
the product resolves credentials through its SecretStorage owner. Evaluation never reads or copies
secret bytes. The runner reports the exact missing authorization before Desktop launch or API use;
configuration availability alone does not imply cost authorization.

Cases that intentionally switch models under one provider additionally require the comma-separated
`OPENNEKO_AGENT_EVAL_MODEL_IDS` allowlist. `OPENNEKO_AGENT_EVAL_MODEL_ID` remains the expected
terminal model identity and must also be present in that set. A profile outside the exact provider
and model allowlist is rejected before Desktop launch.

Run a hidden packaged matrix with stable build identity and two Desktop workers:

```bash
node scripts/agent-eval/local-run.mjs \
  --mode matrix \
  --desktop-executable /absolute/path/to/OpenNeko.app/Contents/MacOS/OpenNeko \
  --desktop-fingerprint sha256:<64-hex> \
  --repetitions 3 \
  --desktop-workers 2 \
  --provider-workers 2
```

Matrix mode rejects development/Vite targets. Expansion and hash sharding are deterministic;
resource semaphores separately limit text, external Tool, media and visible UI work. Time, token,
cost and provider quotas are checked at worker admission, and only pre-turn infrastructure failure
without an execution identity may consume a bounded retry. Protected visible cases require
`--evidence-level visible-desktop` and are never silently included in a hidden lane.

Validate an ablation plan without starting runtime behavior:

```bash
node scripts/agent-eval/ablation/run.mjs --plan thinking-budget --dry-run
```

Root local aliases are available for the two pilot plans and their dry-run. Dry-run validates only
authoring and selection; it remains local-only and is not behavior, UI, API or comparison evidence.

Configuration ablation may change only declared product runtime/model settings and must prove the
requested/effective digest plus every dimension source from Desktop facts. Skill, Tool, permission
and Prompt changes are rejected as configuration switches. Implementation ablation owns isolated
revision/patch/package builds, verifies source/recipe/executable fingerprints and passes the exact
packaged executable through the same Desktop driver. Variant order is randomized while report order
remains stable; hard-gate failure dominates efficiency and Judge deltas.

Raw reports belong under gitignored `reports/agent-eval/`. Committed summaries must contain only
redacted evidence locations, outcomes, blocking conditions and residual risk.
