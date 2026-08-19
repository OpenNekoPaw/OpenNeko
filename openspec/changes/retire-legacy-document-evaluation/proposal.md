## Why

The active Agent Evaluation catalog still contains scenarios that assert the retired Pi
`ReadDocument`/`ReadImage` runtime contract. They cannot execute against the canonical DSH
profile and rewriting them as a second compatibility protocol would reintroduce the deleted
runtime boundary.

## What Changes

- Remove document/image scenarios whose evidence contract is explicitly Pi-owned from active
  Agent Evaluation suite indexes.
- Keep the synthetic document-image fixture and generator available for a future real DSH
  provider/UI evaluation slice; retiring an evaluation case does not delete user-facing
  document capability or its deterministic package tests.
- Add a regression scan that rejects retired document tool names in active Agent Evaluation
  scenario files and suite indexes.

## Capabilities

### Modified Capabilities

- `agent-evaluation-catalog`: active cases must describe the current DSH contract; historical
  migration cases are not selectable by the suite index.

## Impact

- `scripts/agent-eval/suites/agent-runtime`: remove stale Pi document/image cases and their
  suite entries.
- `scripts/agent-eval`: add a deterministic catalog guard.
- `packages/content` and DSH runtime behavior are unchanged.
