## Why

An attached structured document is bound to a Conversation-scoped `input_ref`, but the current provider-facing `ReadDocument` schema does not require that reference. A provider can therefore emit an empty call that reaches runtime validation. Pi then automatically asks the provider again after every Tool error, so an unchanged invalid call can repeat indefinitely and flood the transcript instead of failing visibly.

## What Changes

- Make `input_ref` required on every provider-facing `ReadDocument` call, including continuation calls; `cursor_ref` remains additional continuation state rather than a replacement source identity.
- Preserve provider-compatible flat top-level Tool schemas and exact runtime validation; do not restore rejected top-level schema combinators.
- Stop the current Agent turn after the same single failed Tool call is repeated consecutively with unchanged arguments and error, while allowing one correction attempt.
- Project the convergence stop as an explicit failed turn and keep sibling Tools, Conversations and Workspaces usable.
- Patch the currently pinned Pi `Agent` wrapper to expose its existing low-level `shouldStopAfterTurn` hook; remove the patch when upgrading to an upstream version that includes the same API.

## Capabilities

### New Capabilities

- `agent-tool-failure-convergence`: Exact short-reference requirements and bounded repeated-failure termination for Agent Tool turns.

### Modified Capabilities

<!-- None. -->

## Impact

- `@neko/agent-runtime` owns the provider-facing content Tool projection, Conversation turn convergence and fail-visible terminal diagnostic.
- `@earendil-works/pi-agent-core@0.80.7` receives a narrow dependency patch that exposes an already implemented low-level loop hook through its `Agent` wrapper.
- `scripts/agent-eval` reuses the existing ReadDocument stream-delivery case; no Evaluation behavior enters product runtime.
- No UI, Desktop IPC, content locator, persisted user-data or absolute-path contract changes.
