# Evaluation Plan

## Evaluation Scope

- Change/feature: introduce a minimal shared Domain Job lifecycle kernel, concrete Generation/Export
  coordinators and Host-owned Domain Activity projection.
- Decision and owning suite: `update` `agent-runtime.workflow-controller`; Extension Development Host
  functional coverage is additionally required for Webview Activity.
- Why real Evaluation is required: the change affects Tool routing, asynchronous execution, cancellation,
  retry/recovery, artifact delivery and TUI/Agent runtime evidence.
- Canonical Agent path: canonical TUI input -> Pi Agent Run -> new Tool Call -> exact domain Job Tool
  adapter -> owning coordinator -> versioned domain store -> progress/terminal observation -> Tool result.
- Forbidden fallback: generic TaskManager, TaskRef, task continuation, direct JobStore mutation,
  direct GenerationExecutionPort/provider invocation from a caller, mock/direct turn acceptance, Webview-owned lifecycle,
  latest active Job routing or unsupported provider no-op.

## Cases

### Updated workflow-controller coverage

- Canonical positive: Agent explicitly creates a recoverable GenerationJob, receives a stable
  `generation` JobRef, observes monotonic revisions and receives terminal stable `ResourceRef`.
- Boundary: cancelling an observer Tool Call does not revive that Tool Call; a new Tool Call can reattach
  to the same detached Job.
- Failure: stale revision, wrong job kind/id and unsupported provider cancellation fail visibly and do
  not mutate the snapshot.
- Retry: retry creates a different jobId with `retryOf`; the failed or outcome-unknown original Job is
  unchanged.
- Regression: a normal linked media Tool submits exactly one GenerationJob, waits for its terminal
  ResourceRef and emits no generic Task fact or direct-execution fact.

### Deterministic coverage

- Shared transition, revision/CAS, terminal immutability and observer ordering.
- Generation/Cut exact coordinator and adapter path.
- Snapshot-first reconnect and revision-gap replacement.
- Activity summary excludes provider credentials, external handles and Host-private paths.
- Source absence for generic manager/payload/result and retired Task fallback.

### Extension Development Host coverage

- Linked media progress updates one Tool Timeline item.
- Detached Generation/Export Job appears once in Domain Activity with concrete kind and identity.
- Hiding/reopening Webview installs a fresh Activity snapshot and resumes ordered patches.
- Exact cancel/retry command reaches the owning domain port.
- Stale command fails visibly; no latest/active Job is selected.

## Evidence and Observability

Required neutral runtime facts:

- Agent runtime, conversation/turn/run/toolCall identities;
- Tool name and exact domain port operation;
- job kind/id, owner mode, revision sequence and terminal phase;
- provider/engine adapter identity and capability used;
- reconciliation attempt/outcome and outcome-unknown state;
- stable result artifact/resource identity and owning validator;
- retryOf relationship for retry;
- no generic Task/TaskRef/continuation/manager or direct provider execution participation.

Webview evidence must come from an isolated synthetic workspace through Extension Development Host.
Reports must not include credentials, raw prompts, provider configuration, absolute user paths or
unrelated workspace content.

## Verification Status

### Phase 1 shared kernel

- `@neko/shared` full Vitest suite: passed, 171 files and 1,458 tests.
- Focused strict TypeScript check for the new public entry and implementation: passed with the repository
  root `skipLibCheck` policy; the initial direct command without that policy exposed only existing
  Three/Bun external declaration conflicts.
- `pnpm check:openspec`: passed, 41/41 strict items.
- `git diff --check` for the change and shared package: passed.
- `pnpm build`: passed, 10/10 Turborepo build tasks.

Real Agent and Webview evaluation is intentionally not run for Phase 1 because the shared kernel has no
production consumer yet and cannot change Agent behavior. Generation/Cut wiring remains unaccepted.
Key-free dry-runs, mocks or a final Agent answer will not be reported as real Job acceptance.

### Phase 2 provider capability split

- Focused media adapter and linked execution tests: passed, 2 files and 25 tests.
- Provider capability audit: image/video/audio submit, describe and cancel are explicit structural
  capabilities. DashScope, MiniMax and Suno no longer expose cancellation; Midjourney and Vidu no longer
  expose unsupported modality methods.
- Supported cancellation now uses throwing HTTP requests, so provider rejection cannot return local
  success.
- Platform full `tsc --noEmit`: remains blocked by five existing config-test fixture errors involving
  `modelGroups`, `displayName` and Node 24 `fetch.preconnect`; no changed media file appears in the error
  set.
- No provider currently implements SSE/WS Job observation, so an empty subscriber capability was excluded.

### Phase 2 Generation Job vertical slice

- Added concrete `GenerationJobSnapshot`, domain-private store type and
  `GenerationJobCoordinator`; ownership is migrating from `@neko/platform` to the first-level
  `@neko/generation` package under `extract-generation-domain-package`. The shared kernel still has no
  submit, provider, payload, result or
  cross-domain dispatch authority.
- Exact `generation + jobId + expectedRevision` is required for cancel, retry and reconciliation.
  Provider task identity is committed before linked provider polling; unsupported cancellation leaves the
  Job running instead of reporting local success.
- Provider completion is materialized through the Generation-owned result committer. The Job reaches
  `succeeded` only after valid durable `ResourceRef` values are committed; result-commit failure is
  `failed`, not provider `outcome-unknown`.
- TUI direct image/video/audio commands are the first production consumer. They submit a Generation Job,
  consume versioned observation and read terminal result refs. Agent media Tools remain linked terminal
  calls, with source poison rejecting implicit Job construction.
- Focused Platform Generation/linked tests: passed, 2 files and 9 tests.
- Platform full media/config suite: passed, 42 files and 316 tests.
- Focused TUI direct/delivery tests: passed, 3 files and 15 tests.
- TUI full suite: passed, 84 files and 508 tests.
- Repository `pnpm test` before this vertical slice passed all 27 Turborepo tasks in 3m37.938s. A fresh
  post-slice full run is required before final acceptance.
- `pnpm check:unused` remains a repository baseline failure with 62 unused files, two unused dependencies,
  one unused dev dependency and existing unused exports. No new Generation Job source file was listed as
  unused.
- `pnpm check:legacy-debt` remains a repository baseline failure with four non-Agent blocking occurrences
  in three `packages/neko-quality` files. The new Generation Job files were not blocking findings.

### Phase 2 Generation persistence and restart recovery

- LocalMetadata now exposes only a transaction-scoped SQL statement executor. Generation owns its
  `generation-jobs` migration namespace, strict version-1 snapshot codec, workspace partition, CAS
  statements, recoverable scan and secret-bearing request rejection.
- TUI direct media production composition uses the persistent Generation store, runs the domain migration
  and installs recoverable Jobs before exposing the runtime. Initialization failure disposes every
  resource already acquired instead of leaking the metadata store, Platform or delivery host.
- Persisted `pending` Jobs resume the frozen request once. `running` and `outcome-unknown` Jobs with an
  exact provider task identity resume reconciliation through that provider. A `running` Job without
  provider identity becomes `outcome-unknown` and is never automatically resubmitted.
- Coordinator recovery is idempotent within one Host instance. Disposal stops polling without rewriting
  detached snapshots as cancelled, so a later Host can recover from the persisted authority.
- Persistent store and recovery focused tests: passed, 2 files and 12 tests.
- Post-cleanup focused shared lifecycle/secret, Generation persistence/recovery and TUI
  runtime/delivery tests: passed, 8 files and 38 tests.
- Platform full suite: passed, 43 files and 323 tests.
- TUI full suite: passed, 88 files and 515 tests.
- Bun SQLite LocalMetadata adapter contract: passed, 6 tests.
- `@neko/shared` full suite: passed, 171 files and 1,458 tests.
- Repository `pnpm build`: passed, 10/10 tasks.
- Repository `pnpm test`: passed, 27/27 tasks in 2m26.25s.
- `pnpm test:agent:eval`: passed, 39 files and 277 tests; 23 suites and 48 dry-runs. This is key-free
  harness evidence only, not real provider-backed Agent acceptance.
- `pnpm check:openspec`: passed, 41/41; `pnpm check:deps` and
  `pnpm check:agent-boundaries`: passed with zero findings; `git diff --check`: passed.
- `pnpm check:legacy-debt` remains a repository baseline failure with four non-Agent occurrences in three
  `packages/neko-quality` files.
- `pnpm check:unused` remains a repository baseline failure with 62 unused files, two unused
  dependencies, one unused dev dependency and 576 existing unused exports. The codec predicate was made
  module-private, and a fresh gate run confirmed that this change adds no unused export.

### Phase 3 Agent/direct convergence and configured-provider evidence

- Agent image/video/audio Tools now submit exactly one GenerationJob, consume
  `observeGeneration(ref, afterRevision)`, project progress through the active Tool Call, propagate linked
  cancellation to the exact Job revision and return only after a terminal stable `ResourceRef`.
- The Agent Tool registry additionally exposes `DescribeGenerationJob`, `ObserveGenerationJob`,
  `CancelGenerationJob`, `RetryGenerationJob` and `ReconcileGenerationJob`. Mutation Tools require
  `jobId + expectedRevision`; observation requires `jobId + afterRevision`. Finish/fail transitions remain
  coordinator-owned and are not Tools.
- VS Code application composition owns one Platform and one persistent Generation coordinator per
  workspace, injects the same services identity into embedded domains and resolves purpose-bound
  provider/model bindings without Canvas-owned model configuration mutation.
- TUI, Agent Extension direct media, Canvas and Cut generation entry points submit through the public
  Generation Job port. The retired direct media dispatcher and Agent-injected media forwarding path are
  source-poisoned.
- A packaged TUI direct-image attempt first exposed that `@neko/generation` was externalized from the
  executable and failed before startup. The TUI build now bundles this first-level workspace package and
  a Node adapter boundary test prevents regression.
- After the packaging fix, one configured direct-image request reached
  `nekoapi-media/gpt-image-2` through a persistent GenerationJob. The provider returned a non-retryable
  HTTP 400 `unknown_model`; the Job was persisted as `failed` at revision 3 with
  `generation-execution-failed`, no `ResourceRef`, no automatic retry and no fallback. Job id:
  `b2b3fb25-84cf-4237-aa50-c983455e5edd`.
- Focused verification passed: Generation 4 files / 20 tests plus strict typecheck; Canvas 2 / 55;
  Platform media 4 / 65; Agent Extension 4 / 19; TUI direct/runtime 4 / 25; VS Code app 5 / 5; TUI
  packaging boundary 1 / 5.
- A fresh repository `pnpm test` passed all 28/28 Turborepo tasks in 6m40.462s after the
  Generation/direct-domain convergence changes.
- `pnpm test:agent:eval` passed again with 39 files / 277 tests and 23 suites / 48 dry-runs.
  `pnpm check:openspec` passed 42/42 and `git diff --check` passed.
- The two retained real Agent runs remain unchanged: the first exposed no media Tool in that session; the
  rebuilt/configured run reached a durable Pi turn but the main chat provider timed out before any Tool
  Call. Neither was retried into success.

### Phase 4 P1 lifecycle acceptance and multi-purpose Tool routing

- A real VS Code Extension Development Host submit exposed that `SubmitGenerationJob` received no
  immutable purpose binding even though the Webview sent configured image/video/audio model refs. The
  first violated contract was the Host filter: it modeled every Tool as one static purpose and removed
  all bindings for the call-time `kind` selected detached Job Tool.
- The Pi Capability bridge now distinguishes one static purpose from a bounded multi-purpose Tool.
  `SubmitGenerationJob` declares exactly image/video/audio generation candidates and resolves one purpose
  from validated call arguments. A missing selected binding fails before domain execution and never falls
  back to `agent.main`, model-authored ids or global mutable config. VS Code and TUI policy filtering both
  retain the declared candidate set.
- A single real `agent-runtime.workflow-controller/detached-generation-job-observation` sample
  (`p1-purpose-routing-20260724`) was retained as `case-fail` and was not retried. It used the configured
  `nekoapi-chat/gpt-5.6-luna`, completed without runtime errors or retries, and proved no generic Task
  path. The Agent reported the detached Tool unavailable and invoked only `read_skill`; submit,
  describe and observe gates therefore failed.
- That sample exposed a second configuration projection defect: the canonical TUI snapshot carried only
  explicit understanding purposes while valid `default_models.image/video/audio` category bindings were
  omitted. TUI now projects compatible category defaults to `image.generate`, `video.generate` and
  `audio.generate`, while explicit flat purpose bindings remain higher priority. An incompatible category
  default is omitted rather than having capabilities invented; an incompatible explicit purpose still
  fails visibly.
- A credential-free read of the actual user configuration after the fix reported the purpose names
  `image.generate`, `video.generate`, `image.understand`, `video.understand` and `audio.understand`.
  No credential or provider payload was logged. The configured audio model supports music rather than
  generic audio generation, so `audio.generate` is intentionally absent.
- Verification passed: Agent 94 files / 1,003 tests; Agent Extension 64 / 452; TUI 88 / 522; VS Code
  composition 5 / 5; `pnpm build` 10/10 tasks; `pnpm test:agent:eval` 39 files / 277 tests and 23 suites /
  49 dry-runs; `pnpm check:agent-boundaries`; `pnpm check:openspec`; focused dynamic-purpose and config
  projection tests; `pnpm check:deps`; `git diff --check`. A fresh repository `pnpm test` passed all
  28/28 Turborepo tasks in 5m8.075s.
- Extension Development Host re-acceptance remains blocked. Port 9222 now exposes a real workbench and
  Agent Webview in an isolated synthetic workspace, but Extension Host inspection proves that the active
  Neko extensions were loaded from a separate checkout rather than this change's worktree. That runtime
  is not comparable evidence for the changed build and was not reported as acceptance or replaced with a
  browser/synthetic Webview authority. Activity snapshot/patch/command runtime acceptance therefore
  remains open under task 7.4.

## Residual Risk

- The configured provider path now proves submit, versioned failure observation and durable Job state, but
  successful terminal artifact validation remains open because the configured image model is rejected by
  its endpoint as unknown. The separate Agent case remains blocked by the main chat timeout before Tool
  selection.
- Direct TUI progress and restart state are represented by persistent versioned snapshots, but the
  one-shot CLI currently prints only its terminal result and exposes no cancel/retry command.
- Agent Job management Tools are implemented and deterministically covered. A real detached
  submit/observe/cancel/retry Agent case and Webview Domain Activity progress/cancel/retry remain
  unaccepted, so this slice does not claim those runtime surfaces.
- The retained real detached sample predates the TUI category-default projection fix and failed before a
  Generation Job was submitted. Per Evaluation policy it was not rerun into success; a future independent
  sample must prove submit/describe/observe and terminal or recoverable provider behavior.
- The available Extension Development Host currently loads a different checkout. Tool Timeline and
  Domain Activity runtime behavior for this exact worktree remains unverified until the changed build is
  launched through the repository's Extension Development Host configuration.
- Cut restart reconciliation requires an Engine-backed fixture and cannot be inferred from in-memory tests.
- Shared extraction is invalid if only one production coordinator consumes it after migration; in that case
  implementation must remain domain-local and this change must be revised rather than preserving an empty
  framework.
