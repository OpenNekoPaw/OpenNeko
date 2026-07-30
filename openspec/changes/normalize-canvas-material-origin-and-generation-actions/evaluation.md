# Evaluation Plan

## Scope and decision

- Change: normalize Canvas material origin, Generation Job/result projection and
  retry/regenerate semantics.
- Owning suite: update `agent-runtime.workflow-controller`.
- Case: `generation-regenerate-result-projection`.
- Runtime acceptance host: Desktop remains Phase 1 acceptance authority; this Agent case
  verifies the shared Generation capability and Job path rather than Desktop layout.

## Canonical path

1. TUI input enters `PiConversationRuntime`.
2. `SubmitGenerationJob` reaches the configured Generation capability and
   `GenerationJobCoordinator`.
3. The exact Job identity is observed through `ObserveGenerationJob`.
4. The terminal result exposes a validated `generated-output` ContentLocator.
5. Edit-and-generate submits a second Job; it does not call `RetryGenerationJob`, reuse the
   prior Job identity or overwrite the first result.

The forbidden paths are summary-to-recipe reconstruction, active/latest Job fallback,
generic Task routing, AssetLibrary import and in-place result mutation.

## Key-free evidence

- `node scripts/agent-eval/all-suite-dry-run.mjs`
  - passed
  - 24 suites / 54 cases
  - `agent-runtime.workflow-controller` contains 8 cases, including the new regression case

This validates scenario schema, discovery and deterministic evidence contracts. It is not a
provider-backed Agent behavior acceptance result.

## Provider-backed blocker

No real provider call was made. Execution requires an explicit provider/model selection,
credential-use approval and cost authorization. Provider authentication, billed request
behavior, model-specific translation, returned codecs and creator-facing output quality
remain unverified until those approvals are available.
