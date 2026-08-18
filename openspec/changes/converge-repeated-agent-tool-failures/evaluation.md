# Agent Evaluation Disposition

## Evaluation Scope

- Change: provider-visible `ReadDocument` source-reference requirement and Agent turn convergence after an unchanged repeated Tool failure.
- Decision: `reuse` and update the evidence description of `agent-runtime.stream-delivery/read-document-tool-result`; deterministic Conversation runtime tests own forced identical-failure sequencing because a real-provider prompt cannot reliably require a provider to violate its Tool schema twice.
- Real Evaluation is required before release for the positive attached-document behavior because model Tool selection and provider schema handling change.
- Canonical path: visible attachment -> Host-issued Conversation `input_ref` -> provider `ReadDocument` call -> exact protocol binding -> content reader -> terminal response.
- Forbidden fallback: inferred attachment, raw locator/path, cursor-only source, another reader/provider, automatic argument insertion or unbounded retry.

## Cases

- Reused positive case: attached synthetic EPUB is read once using the exact message-issued `input_ref`; Tool success and final marker remain required.
- Deterministic negative cases: missing/empty source is rejected before content execution; cross-source cursor is rejected; two identical consecutive failures produce exactly two Tool results, no third provider request and a failed checkpoint; a corrected second call proceeds.
- Missing observability: none for deterministic convergence. Provider-backed stability and visible transcript behavior remain unavailable without explicit provider/model/cost authorization.

## Verification

- Focused Agent runtime validation passed: 3 files and 36 tests covering schema/protocol, continuation source consistency, repeated-failure convergence, failed checkpointing and subsequent turn usability.
- Full `@neko/agent-runtime` validation executed 1026 tests: 1024 passed; the only failures are two dirty-worktree Host controller tests that still expect 37 registered routes while the current shared route catalog contains 38. The failing files and route catalog are outside this change.
- `@neko/agent-runtime` typecheck, focused Prettier, `check:openspec` (116 items), `check:agent-boundaries` (473 files) and `check:legacy-debt` passed.
- `test:agent:eval` executed 311 tests: 310 passed; the only failure is the dirty-worktree all-suite test expecting 83 indexed cases while the current index contains 84. Direct all-suite dry-run passed all 27 suites and 84 cases, including the updated ReadDocument case.
- `check:unused` remains blocked by the pre-existing unused `pathCrossesSymlinkInsideRoots` export in `packages/agent/runtime/src/tools/core/path-access-core.ts`; this change does not touch that owner.
- Visible and hidden complete-Desktop real-provider cases are `infrastructure-blocked`: this task has no explicit provider, model and cost authorization. No provider request was attempted.
- A dry run, mock provider, final text or deterministic Conversation fixture does not count as real Agent behavior acceptance.

## Interpretation

- Schema success requires the submitted provider Tool definition to contain top-level `required: ["input_ref"]` without rejected top-level combinators.
- Convergence success requires path evidence for two errors, zero third provider call, explicit failed terminal state and subsequent runtime usability.
- Provider refusal, missing credentials and Evaluation driver failure remain infrastructure failures rather than behavior results.

## Residual Risk

- Provider-specific adherence to the required short reference and visible Desktop presentation remain unverified until an authorized real-provider run.
- The repository key-free aggregate test must align its pre-existing expected case count with the authoritative 84-case index before `test:agent:eval` can return a clean aggregate exit code.
- The pinned dependency patch must be removed when Pi is upgraded to a version that natively exposes `shouldStopAfterTurn`.
