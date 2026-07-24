# Evaluation Plan

## Evaluation Scope

- Change/feature: extract Generation contracts and recoverable Job ownership from Agent Platform into a
  first-level domain package.
- Decision and owning suite: `update` `agent-runtime.workflow-controller`.
- Why real Evaluation is required: package relocation changes Tool/direct routing, provider/model
  execution injection, persistent Job recovery and artifact delivery paths.
- Canonical path: canonical TUI input -> Pi Tool Call or direct command -> `@neko/generation` public
  port/coordinator -> versioned domain store -> terminal ResourceRef.
- Forbidden fallback: Platform Job export/local coordinator, TaskManager/TaskRef, generic Job manager,
  direct store mutation, domain-local config reader or mock/direct turn acceptance.

## Cases

- Positive: explicit Generation Job uses the new package identity, monotonic revisions and terminal stable
  ResourceRef.
- Boundary: stale identity/revision and unsupported cancel fail visibly without mutation.
- Recovery: persisted provider identity resumes through the injected execution port; ambiguous running
  requests become outcome-unknown without resubmission.
- Regression: linked media Tool remains a terminal ToolCallExecution that observes one GenerationJob and
  does not invoke GenerationExecutionPort directly.
- Architecture: Generation has no Agent/Platform/VS Code/React/config-file dependency, and Platform has no
  Job re-export.

## Evidence

- Exact package/module and execution port facts.
- Requested/effective provider and model identity.
- Job kind/id/revision/phase and recovery outcome.
- Stable result ResourceRef and generated-output validation.
- Absence of Platform Job, Task/TaskRef and config-reader participation.

## Verification Status

### Authoring decision

- `update`: `agent-runtime.workflow-controller/media-tool-terminal-result` remains the linked Tool owner,
  but must prove ordinary media Tool execution reaches a terminal Tool result through one GenerationJob
  without creating a generic Task or invoking provider execution directly.
- `excluded`: direct TUI recoverable Job package relocation is a non-Agent composition change. Exact
  `@neko/generation` imports, execution-port injection, provider/model binding, revisions, recovery and
  Platform no-export are covered by deterministic source/path and domain tests.
- A provider-backed direct Job case remains unexecuted. The current external workflow controller has no
  direct-media command operation and exposes no GenerationJob package/revision runtime facts. Adding
  `@neko/generation` text to a no-fallback list would not prove the path, so no weak suite assertion was
  added.

### Deterministic verification

- `pnpm --filter @neko/generation typecheck`: passed.
- `pnpm --filter @neko/generation test:run`: passed, 3 files / 17 tests.
- Focused Platform media, TUI direct runtime/delivery and Extension delivery tests: passed, 25 files /
  164 tests.
- `pnpm build`: passed, 10/10 Turbo build tasks; TUI bundle resolved `@neko/generation`.
- `pnpm check:deps`: passed, 1,529 modules / 5,334 dependencies; Generation is included in the scan.
- `pnpm check:agent-boundaries`: passed, 1,186 files; Generation is included as a host-agnostic scope.
- OpenSpec strict validation: passed before implementation and will be rerun after evidence updates.

### Key-free Evaluation

- `pnpm test:agent:eval`: passed, 39 files / 277 tests and 23 suites / 48 dry-run cases.
- This validates schemas, runner semantics, suite discovery and deterministic assertions only. It is not
  configured-provider or real Agent behavior acceptance for a recoverable GenerationJob.

### Baselines and residual risk

- `pnpm check:legacy-debt`: blocked by the existing `packages/neko-quality` baseline, 3 files / 4
  `rejectLegacyMediaPathRequest` occurrences. `@neko/generation` is not a blocking finding.
- `pnpm check:unused`: existing repository baseline remains 62 unused files, 2 dependencies, 1
  devDependency and 570 exports. A focused `@neko/generation` Knip scan reports no issues.
- Full Platform/TUI typecheck remains blocked by existing configuration fixtures, Agent input narrowing,
  AI SDK Blob typing and other unrelated errors; Generation typecheck and the changed production bundle
  pass.
- No VS Code Webview behavior changed, so no Extension Development Host visual run was applicable.
- No real provider call was made because cost authorization was not provided. Requested/effective
  provider/model identity, billed request behavior and terminal artifact quality remain unverified.
- Provider adapters, routing, execution and output finalization still live in Platform behind
  `GenerationExecutionPort`; their row-by-row target ownership is recorded in `design.md`.
