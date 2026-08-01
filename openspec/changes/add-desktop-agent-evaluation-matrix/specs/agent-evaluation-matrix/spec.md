## ADDED Requirements

### Requirement: Matrix selection and expansion are strict and reproducible

The Evaluation platform MUST expand indexed suite/case/config/model/build/repetition selections into stable sample
identities before starting Desktop. Unknown suites, cases, dimensions, profiles, revisions, fields or unsupported
combinations MUST fail before execution.

#### Scenario: A focused change selection runs

- **WHEN** changed Prompt, Skill, Tool, model, workflow or Desktop Agent paths map to owning suites
- **THEN** the matrix contains exactly the indexed public/protected cases and declared repetitions required by the
  authoring decision
- **AND** unmapped behavior or missing suites fail selection instead of choosing a convenient default

#### Scenario: A matrix is replayed

- **WHEN** the same revision, suite indexes, profiles, build targets, fixtures, budgets and shard definition are used
- **THEN** the platform derives the same ordered sample identities and immutable execution inputs
- **AND** existing report identities are not silently overwritten

### Requirement: Batch execution uses bounded resource-aware workers

The matrix MUST use a bounded Worker Pool with independent concurrency controls for ordinary text, external Tool,
media/FFmpeg/GPU and visible UI samples. Concurrency MUST be configurable from measured host/provider capacity and
MUST NOT default to unbounded process or API fan-out.

#### Scenario: Large text matrix executes

- **WHEN** many non-visual Desktop samples are ready
- **THEN** the scheduler runs no more than the configured Desktop and provider limits, queues the remainder and
  records scheduling/usage evidence
- **AND** each admitted worker receives an isolated Desktop lifecycle

#### Scenario: Visible or media-heavy cases are selected

- **WHEN** a sample requires visible UI, focus, media generation, FFmpeg or scarce GPU/provider capacity
- **THEN** the scheduler applies its stricter resource class limit independently of ordinary text workers
- **AND** resource exhaustion is classified as infrastructure failure rather than target behavior failure

### Requirement: Matrix execution supports stable sharding

The platform MUST support deterministic sharding across local or trusted machines without sharing mutable fixture,
credential, report or baseline state. A shard MUST carry enough immutable identity to prove its samples belong to
the same matrix definition.

#### Scenario: Matrix is split across workers

- **WHEN** a run is divided into multiple shards
- **THEN** every selected sample belongs to exactly one shard and aggregate input records the matrix/shard identity
- **AND** missing, duplicate or policy-drifted shard output makes aggregation non-comparable

### Requirement: Budgets and retry policy fail visibly

Every matrix MUST declare time, repetition and applicable token/cost limits. The scheduler MUST stop admitting new
work when a hard budget is exhausted and MUST retain already-started sample outcomes. Behavior failures MUST NOT be
retried into success.

#### Scenario: Provider budget is exhausted

- **WHEN** cumulative token, cost, time or provider quota reaches its declared hard limit
- **THEN** pending samples are recorded as budget-blocked/skipped with explicit residual coverage
- **AND** completed failures remain failures and are not discarded to improve the aggregate

#### Scenario: Infrastructure fails before a turn starts

- **WHEN** Desktop launch, network preflight or provider availability fails before an execution identity is created
- **THEN** the scheduler may retry the identical input only within the declared infrastructure retry budget
- **AND** every attempt is retained and any post-start failure is not retried as a replacement sample

### Requirement: Every sample and aggregate remains auditable

The platform MUST retain assertion-level results, redacted facts, effective identities, artifacts, usage, diagnostics,
attempts and report locations for every repetition before computing aggregate metrics. Aggregate correctness MUST be
dominated by configuration, infrastructure, hard-gate and protected-case failures.

#### Scenario: Repeated matrix completes

- **WHEN** all admitted samples reach terminal outcomes
- **THEN** the aggregate reports pass rate, gate totals, latency distribution, token/cost availability, iterations,
  Tool outcomes, retries and applicable quality distribution from the retained sample set
- **AND** averages or Judge scores cannot override a failed canonical-path, configuration or artifact gate

#### Scenario: Required sample evidence is redacted or unavailable

- **WHEN** redaction removes a required identity/fact or a report cannot prove its sample input
- **THEN** the affected sample and aggregate become blocked or non-comparable
- **AND** the report never substitutes unredacted secrets, absolute user paths or raw private logs

### Requirement: Key-free, hidden Desktop and visible Desktop evidence stay distinct

The platform MUST label key-free validation, hidden Desktop behavior runs and visible Electron acceptance as distinct
evidence levels. Generic CI MUST NOT claim provider-backed behavior or graphical acceptance from key-free results.

#### Scenario: Key-free matrix validation passes

- **WHEN** schemas, discovery, dry-run, runner semantics and reports validate without a provider-backed Desktop run
- **THEN** the result is recorded as Evaluation infrastructure readiness only
- **AND** no Agent behavior case, model quality or Desktop lifecycle is marked accepted

#### Scenario: Release qualification is summarized

- **WHEN** release evidence includes hidden Desktop matrix and visible protected cases
- **THEN** the summary lists each executed evidence level, blocked cases, provider/model identity and residual risk
- **AND** missing visible or real-provider evidence remains explicit rather than inferred from another level
