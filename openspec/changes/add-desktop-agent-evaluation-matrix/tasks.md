## 1. Contract and migration alignment

- [x] 1.1 Audit the completed `integrate-desktop-agent-home` controller/session/permission/projection facts against the Desktop driver spec and record every owning contract gap without creating a parallel fact source.
- [x] 1.2 Replace free-form ablation `expectedPath` ownership with references to Scenario evidence/assertion contracts, add strict rejection for TUI/legacy `AgentSession`/direct-runtime path terms, and update schema tests.
- [x] 1.3 Add a TUI evidence migration ledger that preserves retired Host identity, rejects TUI reports as Desktop baselines and maps only reusable scenario intent, fixtures, validators and rubrics.
- [x] 1.4 Update existing thinking-budget, media-production and affected workflow scenarios to the real Desktop controller/Pi Session path and remove stale TUI/`AgentSession` semantics.

## 2. Desktop effective configuration and neutral facts

- [x] 2.1 Define the minimal product-owned effective Agent configuration contract with typed dimensions, owner/scope/source/restart semantics, stable identity and digest validation.
- [x] 2.2 Compose requested and effective model/runtime settings at the Desktop session/turn boundary, freeze the turn snapshot and test default, override, invalid and drifted configuration paths.
- [x] 2.3 Define versioned bounded Desktop Agent facts for application/window/view/workspace, conversation/Pi session/turn/run/Tool, Prompt/Skill/Tool receipts, permission, projection, persistence, usage, diagnostics and disposal.
- [x] 2.4 Project facts from the existing authoritative owners with bounded collection/dropped-count behavior and tests proving missing, stale, mismatched or truncated required facts fail visibly.
- [x] 2.5 Add redaction and security tests proving facts expose no secrets, absolute user paths, raw Host objects, arbitrary handles or Evaluation suite/variant/score concepts.

## 3. Isolated Desktop automation path

- [x] 3.1 Define a fixed typed fixture-only Desktop automation control/facts contract and poison arbitrary IPC, arbitrary command, filesystem, shell, credential and owner-selection paths.
- [x] 3.2 Extend Desktop functional launch to support hidden and visible modes with unique fixture home, Electron `userData`, Workspace and dynamic control/CDP port while preserving ordinary startup when the fixture flag is absent.
- [x] 3.3 Implement the Desktop driver adapter that submits, queues, cancels, confirms, resumes and reads projections through the renderer/preload public Agent bridge instead of importing Main or Pi turn APIs.
- [ ] 3.4 Implement terminal-idle, reload/reconnect, conversation restore, application restart and disposal controls with exact identity, checkpoint, lease and cleanup evidence.
- [ ] 3.5 Add concurrent two-process isolation tests covering single-instance locking, settings, credentials, SQLite/Pi Session, ports, reports and teardown.
- [ ] 3.6 Add protected visible Electron cases for Tool approval, Timeline projection, renderer reload/focus and graceful window/application close using the same driver and facts as hidden mode.

## 4. Complete-session Evaluation runner

- [x] 4.1 Replace the `runV2Case()` infrastructure-blocked stub with one isolated Desktop sample execution path, retaining the exact blocker when the driver, configuration, credential, provider or required facts are unavailable.
- [ ] 4.2 Restore deterministic hard-gate, artifact-check, owning-validator, Judge, baseline and report stages around Desktop facts without copying Evaluation outcome logic into Desktop.
- [ ] 4.3 Restore repeated samples and aggregate reports while retaining every attempt, effective identity, assertion result, artifact, usage/cost availability and residual risk.
- [ ] 4.4 Implement failure attribution and exit-code handling that keeps configuration-invalid, case-fail, infrastructure-blocked/fail and non-comparable distinct and never retries behavior failure into success.
- [ ] 4.5 Add canonical positive, unavailable/denied, Tool approval, cancellation and persistence/recovery runner tests with poisoned retired-host/direct-runtime fallbacks.

## 5. Batch matrix scheduling

- [ ] 5.1 Define strict matrix and stable sample/shard identity contracts for suite, case, configuration, model, build, repetition and evidence level, rejecting unknown or unsupported combinations before launch.
- [ ] 5.2 Implement deterministic focused/matrix expansion and sharding with duplicate, missing and policy-drift detection.
- [ ] 5.3 Implement a bounded Worker Pool with separate ordinary text, external Tool, media/GPU/FFmpeg and visible UI resource limits and measured configurable defaults.
- [ ] 5.4 Prefer one fingerprinted prebuilt Desktop executable per target, keep Vite development launch focused-only and cache immutable implementation builds by verified recipe/executable fingerprint.
- [ ] 5.5 Implement timeout, repetition, token, cost and provider quota budgets with admission stop, explicit skipped coverage and pre-turn-only infrastructure retry accounting.
- [ ] 5.6 Aggregate completed shards only after validating immutable inputs, full sample retention and report redaction; make missing/duplicate/drifted shard evidence non-comparable.

## 6. Configuration and implementation ablation

- [ ] 6.1 Update configuration ablation to apply only declared product settings and verify requested/effective profiles, per-dimension sources and changed digests from Desktop facts.
- [ ] 6.2 Reject unsupported Skill/Tool/permission/Prompt switches as configuration variants and route them to owning product-setting work or implementation ablation.
- [ ] 6.3 Update implementation ablation to prepare isolated Desktop revision/patch/build targets, verify source/recipe/executable fingerprints and execute every target through the same Desktop driver.
- [ ] 6.4 Freeze and validate comparability contracts across scenario, fixture, provider/model, runtime policy, Prompt/Skill/Tool identity, permission, validators, Judge, budget, sampling and target differences.
- [ ] 6.5 Randomize comparable baseline/candidate order, blind Judges and holdouts to target identity, retain uncertainty and make protected correctness failures dominate efficiency/quality deltas.
- [ ] 6.6 Establish new Desktop baselines for migrated pilot plans and prove historical TUI baseline selection is rejected as non-comparable.

## 7. Documentation and qualification

- [ ] 7.1 Update `scripts/agent-eval/README.md`, test-case authoring guidance and Desktop functional documentation with evidence levels, driver ownership, matrix/shard/budget usage, configuration versus implementation ablation and TUI migration rules.
- [ ] 7.2 Run `pnpm test:agent:eval`, all-suite dry-run and focused ablation dry-runs; record suite/case counts and key-free scope without claiming real Agent behavior acceptance.
- [ ] 7.3 Run focused real Desktop cases for canonical turn, Tool/Skill permission, cancellation and persistence/recovery with configured provider evidence, or record the exact infrastructure blocker.
- [ ] 7.4 Run a repeated hidden Desktop matrix with at least two isolated workers and verify sample/shard aggregation, budgets, no cross-sample state and complete cleanup.
- [ ] 7.5 Run one configuration and one isolated implementation ablation with new Desktop baselines, matching policies, repeated samples and assertion-level delta evidence.
- [ ] 7.6 Run protected visible Electron acceptance, `pnpm check:legacy-debt`, `pnpm check:unused`, affected builds/tests and applicable `pnpm ci:local` gates; document unexecuted provider/platform cases and residual risk.
