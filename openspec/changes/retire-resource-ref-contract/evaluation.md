# Agent Evaluation Decision

## Evaluation Scope

- Change/feature: retire public and durable `ResourceRef` contracts in Agent Tool, attachment,
  perception, processor, Timeline, artifact, and Desktop projection paths.
- Decision and owning suite: update `agent-runtime.stream-delivery/document-image-native-delivery`
  with explicit retired-field no-fallback evidence; reuse
  `agent-runtime.workflow-controller/media-tool-terminal-result` for generated-output locator
  handoff. Pure legacy payload rejection remains covered by deterministic Tool/codec tests.
- Why real Evaluation is required: public Tool schema, prompt guidance, perception payloads, and
  Desktop Agent projections change, so deterministic type/codec tests alone cannot prove the
  complete Agent session retains the locator-backed path.
- Canonical path: validated `ContentLocator` enters through the public Agent input/Tool path,
  remains attached to runtime facts and creator-visible output, and is materialized only by an
  injected Host content-access capability.
- Forbidden fallback: `ResourceRef`, `DocumentArchiveResourceRef`, `resourceRef`,
  `documentResourceRef`, persisted system/cache paths, Webview/data/blob URLs, path inference, or
  active-workspace/selection fallback.

## Cases

- Updated positive case: read or perceive locator-backed workspace content and deliver a
  locator-backed Tool result/artifact; assert the same locator identity at the input, Tool result,
  runtime fact, and final Desktop projection boundaries.
- Excluded deterministic failure path: legacy resource-reference-shaped Tool/attachment payloads
  are rejected before content loading; focused Tool/codec tests assert failure and zero
  materialization calls. The real document case additionally forbids every retired field/adapter
  reference in runtime facts.
- Evidence: public input identity, Tool validation outcome, content-access invocation,
  Timeline/artifact identity, terminal status, and forbidden-field/path absence.
- Missing observability: if the current runtime facts do not expose bounded locator identity at one
  of these boundaries, add the smallest neutral fact in that owning runtime contract rather than
  Evaluation-only metadata.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 35 files / 234 tests and validated all 22
  indexed suites / 50 cases. A separate `node scripts/agent-eval/all-suite-dry-run.mjs` also
  returned `ok: true`.
- Real case attempt: `node scripts/agent-eval/local-run.mjs --mode focused --suite
  agent-runtime.stream-delivery` returned exit code 2 and `infrastructure-blocked`.
- Exact blocker: no local Agent provider credential environment variable is available. The
  platform also documents that Desktop currently has no complete-session evaluation driver.
  No direct turn runner, mock provider, or final-text substitute was used.

## Interpretation

- Pass requires all canonical path assertions and forbidden fallback assertions to pass.
- A correct final answer or rendered artifact without path evidence is insufficient.
- Provider/output quality is not being compared; any Judge stage is out of scope.

## Residual Risk

- Deterministic tests can prove schema rejection and projection behavior but cannot prove real model
  Tool selection or complete Desktop session delivery.
- Real acceptance remains blocked until credentials are available and the selected case completes
  through a Desktop-owned complete-session driver.

## Repository Verification

- `pnpm build`: passed, including the packaged macOS arm64 Electron application.
- `pnpm test`: passed all 28 workspace test tasks.
- `pnpm typecheck`: passed all 15 workspace typecheck tasks.
- `pnpm check`: passed unused-code and dependency-boundary checks.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- `pnpm check:quality`: passed all architecture, Shared export, Webview, local-metadata,
  orchestration, and strict OpenSpec gates.
- `git diff --check`: passed.
- Production residue search found no retired type, constructor, helper, or export. Remaining retired
  field spellings are limited to explicit rejection, prelaunch invalidation diagnostics, and
  negative tests.
