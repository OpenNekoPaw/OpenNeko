# Evaluation Plan

## Evaluation Scope

- Change/feature: introduce a minimal shared Domain Job lifecycle kernel, concrete Generation/Export
  coordinators and caller-owned Agent/Canvas/Cut projections.
- Decision and owning suite: `update` `agent-runtime.workflow-controller`; Extension Development Host
  functional coverage is additionally required for Agent Tool Timeline.
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
- Snapshot-first reconnect and revision-gap replacement at each concrete caller.
- Caller projections exclude provider credentials, external handles and Host-private paths.
- Source absence for generic manager/payload/result and retired Task fallback.
- Source absence for cross-domain Activity contracts, projectors, Host command routing and Webview pages.

### Extension Development Host coverage

- Linked media progress and terminal phase update one Tool Timeline item.
- A detached Generation Job is queried through a new exact Tool Call without a workspace-wide Webview subscription.
- Cut ExportJob remains visible through its editor/status-bar projection.
- The Agent header has no global Activity entry and the Webview protocol has no Activity attachment or generic domain command route.
- Exact caller commands reach the owning domain port; stale commands fail visibly with no latest/active Job selection.

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
- The original Extension Development Host attempt loaded a separate checkout and was not comparable
  evidence. A generated product-composition staging root now loads the changed build in an isolated
  synthetic workspace. Final acceptance must prove Tool Timeline result/terminal phase and the absence
  of the superseded Activity page/protocol; ordinary browser or synthetic Webview evidence is invalid.

### Phase 5 product-composed direct image and Webview terminal acceptance

- The canonical `Debug Dev (All)` composition now builds and stages one generated development extension
  root from `apps/neko-vscode` plus the seven current feature payloads. The staging manifest reuses the
  product composition contract and contains no second handwritten contribution catalog.
- Selecting image mode originally sent Agent-only `chatModel` and `purposeModels` fields in a direct media
  `sendMessage`, which the strict Webview protocol correctly rejected. The Webview now installs the
  selected session mode before replaying a pending send and emits only the direct media model field
  accepted by that route. The complete payload passes the production parser.
- A second defect left direct media turns in `agentPhase: thinking` after the Generation Job completed.
  The runtime now publishes terminal `agentPhase: idle` from a `finally` boundary, preserving provider
  failures. The Webview consumes that Host terminal state through its canonical conversation render
  mutation port, clearing the optimistic run state while preserving an authoritative pending queue.
- A product-composed Extension Development Host run in the isolated synthetic workspace submitted one
  configured direct image Generation Job through `nekoapi-media/gpt-image-2`. Job
  `e6ce140a-1692-41c4-845b-17fcfd60589f` reached `succeeded`, revision 5, stage `completed`, 100 percent,
  with one stable generated ResourceRef using a `generated-asset` locator. No retry or fallback occurred.
- The Webview first displayed one `Generated image 0%` Timeline item with the Tab and run status active.
  At terminal revision it displayed the generated image link, changed the Tab to completed, removed the
  run status and Stop control, restored an editable empty composer, and retained a live projection
  attachment at sequence/version 5.
- CDP console evidence contained only VS Code's known `local-network-access` container warning. No
  `invalid-webview-message`, Neko CSP/resource diagnostic or projection protocol failure appeared.
- Focused red/green verification passed: direct-media runtime success/failure terminal phase tests,
  Controller-level optimistic-running-to-idle Tab regression, strict full `sendMessage` parser coverage,
  Generation caller/source-absence architecture checks, `pnpm build:vscode:dev`, and
  `pnpm smoke:webview:targets`.
- A later product-composed direct image sample submitted Job
  `ffbd8174-d826-4181-9c8e-998e7b2cfbd5` to `nekoapi-media/gpt-image-2`. The caller-owned card advanced
  from revision 2 at 0 percent to revision 5 `succeeded`, rendered the committed blue-cup image, and
  reported the exact successful Board outcome. The Workspace Board advanced from eight to nine nodes and
  rendered the same committed asset.
- Host reload followed by normal history reopen rebuilt the same card from the Pi Session transcript:
  the user message, Job id, revision, binding, prompt, Board state and generated image preview all
  remained visible. The history catalog reported two durable messages and the Board remained at nine
  nodes. A regression test now drives Pi transcript projection through `ConversationBridge` and proves
  that a stored generated-output `ContentLocator` is resolved and converted to a Webview URI only at the
  send boundary without mutating the Pi-derived message.
- The current VS Code process did not expose a CDP endpoint on port 9222. The post-fix reload/reopen check
  is therefore Host UI black-box evidence; the focused projection test supplies path-level URI evidence,
  but a fresh post-fix CDP DOM/console run remains unavailable.

### Phase 6 independent configured-provider Agent evidence

- One new independent `agent-runtime.workflow-controller/media-tool-terminal-result` sample,
  `run-ms11ksk5`, passed without retries. This is not a retry of the retained failing detached sample.
- The configured Agent used `nekoapi-chat/gpt-5.6-luna`, invoked `GenerateImage`, and routed Job
  `0d86218c-a322-4542-a513-614cdd6968ff` through
  `generation-job-coordinator` to `nekoapi-media/gpt-image-2`. The Job reached revision 5 and returned one
  stable generated-output locator.
- The Agent passed that exact locator unchanged to `ReadImage`. All runtime, Pi runtime, GenerateImage,
  locator handoff, order, terminal, no-generic-Task, no-Asset lookup and final-answer hard gates passed.
  The generated asset and image-analysis artifact validators both passed, runtime errors were empty, and
  the Workspace Board projection was `projected`.
- Report: `reports/agent-eval/agent-runtime.workflow-controller/media-tool-terminal-result/run-ms11ksk5/`.
  Latency was 97,698 ms, retries were zero, and output-content judging was not configured; the report is
  path and artifact evidence rather than a subjective image-quality claim.

### Phase 7 product-composed Agent Tool Timeline acceptance

- The isolated product-composed Extension Development Host loaded `neko.neko-suite` from the generated
  `apps/neko-vscode` development staging root and used the synthetic workspace. No `.vscode` setting or
  launch file was changed.
- In `ask` mode, one Agent request invoked `GenerateImage` through
  `nekoapi-chat/gpt-5.6-luna`. One approval changed the same Tool Timeline item from waiting for
  confirmation to Generation Job `ed795d0d-a2ee-4e4c-b36f-ada6b6b5d3a6` at revision 2 and zero
  percent. No second approval appeared.
- That Job reached revision 5 and `succeeded`; the same Tool item rendered a generated green-bottle image
  with real pixels before the Agent emitted its short terminal response. The Tab changed to completed,
  the Stop control disappeared and the composer accepted and cleared a new draft.
- This run exposed a caller-delivery defect after Generation had already committed the local image:
  `GenerateImage` returned a canonical locator-only Tool attachment, but the Pi Timeline attachment guard
  still required a legacy `path` string and silently removed it. The terminal artifact collector therefore
  had no generated output to send to the Workspace Board.
- The guard now accepts a valid attachment or asset-ref `ContentLocator`. Focused Timeline and Agent turn
  tests prove that the locator survives projection and enters the single terminal Board batch; no
  Generation- or Canvas-local delivery path was added.
- After rebuilding and reloading the same product composition, a second independent Agent request created
  Job `b80e8fcc-deb7-49d3-9d4e-050db4cbc29f`. One approval advanced the same item from revision 2 to
  revision 5 `succeeded`, rendered the red-bottle output, completed the Agent turn and restored the
  composer. The open Workspace Board advanced from nine to ten nodes and rendered the same durable
  generated-output locator; its project file revision changed at the terminal turn timestamp.
- The Agent header contained new conversation, role session, history and model controls only. No global
  Activity entry appeared. Deterministic source-absence checks remain the protocol-level evidence because
  Host UI inspection cannot prove Webview message schema absence.
- Focused verification passed: Pi Timeline 1 file / 3 tests, Agent turn bridge 1 / 10, and
  `pnpm build:vscode:dev` with all seven feature payloads plus Sharp runtime staging.
- The running VS Code process still did not expose CDP on port 9222. This phase is product Host UI
  black-box evidence; post-fix Webview DOM, console and CSP inspection remains unavailable.

## Residual Risk

- The configured direct image path now proves submit, progress, terminal artifact validation, durable
  Generation Job state and Webview terminal recovery. An independent configured Agent case now also
  proves linked GenerateImage terminal execution and generated-output locator handoff in the TUI owner;
  the product-composed Host now additionally proves approval, Timeline terminal media, composer recovery
  and Workspace Board delivery.
- Direct TUI progress and restart state are represented by persistent versioned snapshots, but the
  one-shot CLI currently prints only its terminal result and exposes no cancel/retry command.
- Agent Job management Tools are implemented and deterministically covered. A real detached
  submit/observe/cancel/retry Agent case remains unaccepted, so this slice does not claim that runtime
  surface.
- The retained real detached sample predates the TUI category-default projection fix and failed before a
  Generation Job was submitted. Per Evaluation policy it was not rerun into success. The new independent
  linked case proves terminal Generation execution, but detached submit/describe/observe/cancel/retry
  still needs its own independent sample.
- Product-composed direct media and Agent-linked Tool Timeline terminal behavior are accepted. Detached
  observe/cancel/retry and stale-revision runtime commands remain unaccepted in the product-composed
  Extension Development Host.
- Post-fix Host UI evidence proves that the restored image has rendered pixels. CDP was unavailable on
  port 9222, so post-fix Webview DOM, console and CSP inspection remains unaccepted.
- Cut restart reconciliation requires an Engine-backed fixture and cannot be inferred from in-memory tests.
- Shared extraction is invalid if only one production coordinator consumes it after migration; in that case
  implementation must remain domain-local and this change must be revised rather than preserving an empty
  framework.
