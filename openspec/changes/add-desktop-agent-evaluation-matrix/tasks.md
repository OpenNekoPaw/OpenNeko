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

- [x] 3.1 Define a fixed typed fixture-only Desktop automation control/facts contract and prove arbitrary IPC, arbitrary command, filesystem, shell, credential and owner-selection paths are unavailable.
- [x] 3.2 Extend Desktop functional launch to support hidden and visible modes with unique fixture home, Electron `userData`, Workspace and dynamic control/CDP port while preserving ordinary startup when the fixture flag is absent.
- [x] 3.3 Implement the Desktop driver adapter that submits, queues, cancels, confirms, resumes and reads projections through the renderer/preload public Agent bridge instead of importing Main or Pi turn APIs.
- [x] 3.4 Implement terminal-idle, reload/reconnect, conversation restore, application restart and disposal controls with exact identity, checkpoint, lease and cleanup evidence.
- [x] 3.5 Add concurrent two-process isolation tests covering single-instance locking, settings, credentials, SQLite/Pi Session, ports, reports and teardown.
- [x] 3.6 Add protected visible Electron cases for Tool approval, Timeline projection, renderer reload/focus and graceful window/application close using the same driver and facts as hidden mode.

## 4. Complete-session Evaluation runner

- [x] 4.1 Replace the `runV2Case()` infrastructure-blocked stub with one isolated Desktop sample execution path, retaining the exact blocker when the driver, configuration, credential, provider or required facts are unavailable.
- [x] 4.2 Add a thin pure `resolveExecutionCase` step inside the existing runner by reusing strict schema, reference, supported-kind and workflow-state validation; keep the resolved case internal without a compiler service/package, persisted plan, dynamic plugin system or universal UI/Agent DSL.
- [x] 4.3 Replace the exact single-submit/idle adapter and concrete `scenario.id` whitelist with a common exhaustive workflow interpreter for supported submit/queue/confirm/cancel/resume/feedback/idle operations, preserving exact public-projection identities and fail-visible unsupported steps.
- [x] 4.4 Replace case-id assertion/media branches with Scenario assertion/evidence references and package-owned validators; ordinary new cases must require only indexed declarative artifacts when existing operations and evidence suffice.
- [x] 4.5 Restore deterministic hard-gate, artifact-check, owning-validator, Judge, baseline and report stages around Desktop facts without copying Evaluation outcome logic into Desktop.
- [x] 4.6 Restore repeated samples and aggregate reports while retaining every attempt, effective identity, assertion result, artifact, usage/cost availability and residual risk.
- [x] 4.7 Implement failure attribution and exit-code handling that keeps configuration-invalid, case-fail, infrastructure-blocked/fail and non-comparable distinct and never retries behavior failure into success.
- [x] 4.8 Add canonical positive, unavailable/denied, Tool approval, cancellation and persistence/recovery runner tests with retired-host/direct-runtime fallbacks absent, plus authoring tests proving Skill-generated drafts cannot register code or bypass unsupported operations.

## 5. Batch matrix scheduling

- [x] 5.1 Define strict matrix and stable sample/shard identity contracts for suite, case, configuration, model, build, repetition and evidence level, rejecting unknown or unsupported combinations before launch.
- [x] 5.2 Implement deterministic focused/matrix expansion and sharding with duplicate, missing and policy-drift detection.
- [x] 5.3 Implement a bounded Worker Pool with separate ordinary text, external Tool, media/GPU/FFmpeg and visible UI resource limits and measured configurable defaults.
- [x] 5.4 Prefer one fingerprinted prebuilt Desktop executable per target, keep Vite development launch focused-only and cache immutable implementation builds by verified recipe/executable fingerprint.
- [x] 5.5 Implement timeout, repetition, token, cost and provider quota budgets with admission stop, explicit skipped coverage and pre-turn-only infrastructure retry accounting.
- [x] 5.6 Aggregate completed shards only after validating immutable inputs, full sample retention and report redaction; make missing/duplicate/drifted shard evidence non-comparable.

## 6. Configuration and implementation ablation

- [x] 6.1 Update configuration ablation to apply only declared product settings and verify requested/effective profiles, per-dimension sources and changed digests from Desktop facts.
- [x] 6.2 Reject unsupported Skill/Tool/permission/Prompt switches as configuration variants and route them to owning product-setting work or implementation ablation.
- [x] 6.3 Update implementation ablation to prepare isolated Desktop revision/patch/build targets, verify source/recipe/executable fingerprints and execute every target through the same Desktop driver.
- [x] 6.4 Freeze and validate comparability contracts across scenario, fixture, provider/model, runtime policy, Prompt/Skill/Tool identity, permission, validators, Judge, budget, sampling and target differences.
- [x] 6.5 Randomize comparable baseline/candidate order, blind Judges and holdouts to target identity, retain uncertainty and make protected correctness failures dominate efficiency/quality deltas.
- [ ] 6.6 Establish new Desktop baselines for migrated pilot plans and prove historical TUI baseline selection is rejected as non-comparable.
  - Historical TUI baseline selection is covered by the migration ledger and rejection tests. A focused real-provider sample is now available, but no comparable repeated configuration/implementation sample set has been approved; key-free and single-sample evidence remain ineligible as a baseline.

## 7. Documentation and qualification

- [x] 7.1 Update `AGENTS.md`, the Chinese/English contribution guides, `scripts/agent-eval/README.md`, test-case authoring guidance, Desktop functional documentation and quality-gate policy with evidence levels, declarative Skill-assisted authoring, thin runner resolution, driver ownership, matrix/shard/budget usage, configuration versus implementation ablation, TUI migration rules, the canonical `~/.neko/config.toml` source and local-only execution boundaries.
- [x] 7.2 Run `pnpm test:agent:eval`, all-suite dry-run and focused ablation dry-runs; record suite/case counts and key-free scope without claiming real Agent behavior acceptance.
  - 2026-08-03 key-free evidence: 45 Agent Evaluation test files / 284 tests passed; all-suite dry-run validated 22 suites / 53 cases; thinking-budget and media-production ablation plans completed dry-run only. No provider request, Electron launch or real ablation sample was executed.
- [x] 7.3 Run focused real Desktop cases for canonical turn, Tool/Skill permission, cancellation and persistence/recovery with configured provider evidence, or record the exact infrastructure blocker.
  - 2026-08-05 evidence: `agent-runtime.workflow-controller/conversation-persistence-resume` completed two real-provider turns through the complete Desktop session using `nekoapi-chat / gpt-5.6-luna`; the same conversation restored four ordered transcript messages with zero runtime/fallback errors. This does not claim full application restart or the complete foundational matrix.
- [ ] 7.4 Run a repeated hidden Desktop matrix with at least two isolated workers and verify sample/shard aggregation, budgets, no cross-sample state and complete cleanup.
  - 2026-08-05 status: provider/model/cost authorization is available and focused real execution passes, but the repeated two-worker hidden matrix has not been rerun; process/storage isolation and cleanup remain unqualified by real API samples.
- [ ] 7.5 Run one configuration and one isolated implementation ablation with new Desktop baselines, matching policies, repeated samples and assertion-level delta evidence.
  - 2026-08-05 status: authorization is available, but no repeated comparable configuration/implementation variants or approved Desktop baseline have been executed. Historical TUI evidence remains rejected and no synthetic baseline was created.
- [x] 7.6 Run protected visible Electron acceptance, `pnpm check:legacy-debt`, `pnpm check:unused`, affected builds/tests and applicable `pnpm ci:local` gates; document unexecuted provider/platform cases and residual risk.
  - `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm test:agent:eval`, both ablation dry-runs, focused orchestration tests and `pnpm ci:local` passed. `pnpm ci:local` covered format, lint, strict typecheck, production build/package, all workspace tests, architecture/storage/orchestration/OpenSpec gates and proved local Evaluation/UI/API/ablation entrypoints remain CI-unreachable.
  - 2026-08-05 visible evidence: `desktop-agent-provider-ui` drove the actual Entry composer and send control with `nekoapi-chat / gpt-5.6-luna`, rendered the real response, activated the Assistant conversation in PrimarySidebar and reached UI plus persisted lifecycle terminal without console/renderer errors. macOS arm64 package validation passed; no other platform claims are made.
- [x] 7.7 Add orchestration regression coverage proving Agent Evaluation, real API, graphical Desktop and all ablation entrypoints remain unreachable from GitHub Actions and generic CI script composition.
- [x] 7.8 Update repository policy, Evaluation guidance and specs so visible feature acceptance requires actual UI + real API, hidden batch requires complete Desktop + real API, and neither lane substitutes direct runtime/mock execution.
- [ ] 7.9 Add and run the foundational real-provider matrix for basic/multi-turn conversation, context compaction, complete reopen transcript restoration, generation-record restoration, conversation switching and conversation isolation; record visible/hidden disposition and exact blockers per cell.
  - 2026-08-22 supplemental manual evidence: the user confirmed visible-product success for ordinary conversation, application-restart restoration, multi-Conversation switching/isolation, compaction continuation, background tasks, document/Canvas Tools and images. This reduces product-behavior uncertainty but does not complete the indexed hidden/visible real-provider matrix because exact provider/model/path receipts and machine-readable reports were not captured. See `../replace-pi-with-dsh-runtime-atomically/evidence/w7-manual-foundational-acceptance.md`.
- [ ] 7.10 Add indexed Launch Draft/binding coverage ownership and evidence contracts for exact Entry/Workspace/Character target, first-submit Scene handoff, typed Skill/command intent, same-Conversation model changes, compaction continuation and forbidden active-Project/raw-prompt fallback.
