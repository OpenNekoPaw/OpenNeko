## ADDED Requirements

### Requirement: Configuration ablation changes only product-owned settings

Configuration variants MUST select declared, product-owned Agent settings with explicit type, range, owner, scope,
default/source semantics and restart behavior. Evaluation-only business flags, hidden fallback branches and arbitrary
environment overrides MUST NOT create successful configuration variants.

#### Scenario: Runtime setting variant executes

- **WHEN** an ablation changes a supported execution mode, temperature, max token, thinking budget, output format or
  model/purpose binding
- **THEN** Desktop freezes the requested and effective configuration for the exact session/turn and reports its
  profile identity, values, sources and digest
- **AND** all undeclared configuration, fixture, model and execution policies remain comparable

#### Scenario: Unsupported Agent switch is requested

- **WHEN** a plan attempts to toggle a Skill, Tool, permission, Prompt or runtime behavior that is not a declared
  product setting
- **THEN** configuration validation fails before Desktop execution
- **AND** the experiment must use an isolated implementation target or first establish the setting through its
  owning product contract

### Requirement: Effective configuration evidence is mandatory

Every configuration sample MUST prove that requested profile/model identities match the actual provider, model,
parameters, Prompt fragments, Skill/Tool catalogs and stable effective digest used by the turn. Missing, unchanged or
drifted effective evidence MUST prevent comparison.

#### Scenario: Variant configuration does not take effect

- **WHEN** a declared variant resolves to the baseline digest, falls back to defaults or reports mismatched values
- **THEN** the variant is configuration-invalid or non-comparable with an exact diagnostic
- **AND** output differences, latency or Judge score cannot be attributed to the declared switch

### Requirement: Implementation ablation uses isolated immutable Desktop targets

Prompt content, Skill content, routing implementation and runtime-hook variants that are not product settings MUST
use isolated revision/patch/build targets with verified source, recipe and executable fingerprints. Every target MUST
run through the same Desktop complete-session driver.

#### Scenario: Skill candidate is compared

- **WHEN** an approved Skill baseline and candidate are evaluated
- **THEN** the platform prepares distinct immutable Desktop targets, preserves the full Host Skill identity and
  package fingerprints, and runs matching fixtures/config/model/budget policies
- **AND** the candidate is not injected through an Evaluation-only runtime path

#### Scenario: Two implementation targets resolve to the same executable

- **WHEN** baseline and candidate fingerprints or executable content are identical, or unrelated build inputs drift
- **THEN** the comparison is non-comparable before an improvement decision
- **AND** cached build reuse cannot hide target identity

### Requirement: Scenario contracts own path and fallback evidence

The selected Scenario MUST be the sole owner of canonical path, required facts, hard assertions and forbidden
fallbacks. Ablation plans MUST reference that contract and declare only allowed variant differences plus narrowly
scoped additional no-fallback evidence.

#### Scenario: Ablation plan repeats a stale Host path

- **WHEN** a plan contains TUI, legacy `AgentSession`, direct runtime or free-form path text inconsistent with the
  selected Desktop Scenario
- **THEN** strict validation rejects the plan before execution
- **AND** mechanical string replacement cannot satisfy Desktop canonical-path evidence

### Requirement: Ablation comparability is explicit and correctness-dominated

Before execution, the platform MUST freeze a comparability contract covering Scenario, fixture, model/provider,
runtime policy, Prompt/Skill/Tool identities, permission, validator, Judge, budget, sampling and target identity.
Only declared dimensions MAY differ between baseline and variant.

#### Scenario: Undeclared policy drift occurs

- **WHEN** a variant changes an undeclared model, Prompt, Skill, Tool catalog, fixture, permission, Judge or budget
- **THEN** the comparison is non-comparable and lists every observed drift
- **AND** metric improvements are not reported as attributable to the selected dimension

#### Scenario: Protected correctness gate fails

- **WHEN** a variant improves average quality, latency, token use or cost but fails canonical path, no-fallback,
  holdout, artifact or protected regression gates
- **THEN** the candidate is rejected or remains failed
- **AND** aggregate efficiency or Judge scores cannot override the protected failure

### Requirement: Repeated comparison controls model variance and bias

Quality or stability claims MUST retain repeated independent samples, randomize baseline/candidate execution order
where applicable, blind comparative Judges to target identity and report uncertainty. Single samples or Judge scores
MUST NOT establish improvement.

#### Scenario: Quality comparison runs

- **WHEN** a Scenario owns a rubric and all deterministic gates pass
- **THEN** the platform evaluates retained real outputs with the matching allowlisted Judge, randomized/blinded order
  and declared repetitions
- **AND** reports separate content quality from correctness, latency, tokens and cost

### Requirement: Historical TUI evidence cannot become a Desktop baseline

Historical TUI reports, baselines and executable identities MUST retain their retired Host attribution and MUST be
non-comparable with Desktop results. Only host-neutral scenario intent, fixtures, validators, rubrics and assertions
that are re-authored for Desktop MAY be reused.

#### Scenario: TUI baseline is selected for a Desktop variant

- **WHEN** a plan or comparison references a TUI Host report as the baseline for a Desktop sample
- **THEN** validation rejects it as non-comparable and requires a new Desktop baseline
- **AND** TUI latency, output quality or pass rate is not presented as a Desktop delta

#### Scenario: TUI-specific behavior has product value

- **WHEN** a retired terminal resize, Ink Markdown or TUI presentation case represents behavior still required by
  Desktop users
- **THEN** the owner creates a new Desktop renderer/visible Scenario with Desktop facts and acceptance evidence
- **AND** the retired TUI path and score remain historical only

### Requirement: Ablation plans remain declarative and local-only

An ablation experiment MUST be authored as a strict plan that references an indexed Scenario, declared variants and
existing comparison policy. Creating a new experiment MUST NOT generate a per-plan executable script, modify the
Scenario runner or move experiment execution into a Skill. Plan validation, dry-run, real provider samples and
comparison MUST remain explicit local developer operations outside generic CI.

#### Scenario: A new supported ablation is added

- **WHEN** the experiment changes a declared product configuration or an isolated implementation target
- **THEN** the author adds a plan that reuses the same Scenario resolver, Desktop driver, hard gates and validators
- **AND** the common ablation runner expands the plan without a plan-specific executable branch

#### Scenario: CI references an ablation plan or dry-run

- **WHEN** generic gate composition or a GitHub Actions workflow is audited
- **THEN** configuration, implementation and dry-run ablation entrypoints are unreachable
- **AND** no experiment result or report is produced as CI evidence
