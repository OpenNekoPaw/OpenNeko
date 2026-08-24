# Change: Stabilize DSH Session model transitions

## Why

Applying the exact configured model rebuilds the DSH Agent under the same persisted Session identity. The bridge currently removes the Session from its active-owner map before the asynchronous rebuild completes. Concurrent composer reads can therefore observe a false `Unknown or inactive session` failure even though the same Session becomes usable milliseconds later and its turn completes normally.

## What Changes

- Keep one stable bridge-owned Session record visible for the full model-rebuild lifecycle.
- Make concurrent Session operations wait for the exact in-progress replacement instead of observing an absent owner.
- Preserve the existing fail-visible behavior when replacement itself fails; do not create or bind a substitute Session.
- Add deterministic bridge qualification for concurrent model application and permission/catalog reads.
- Reuse the existing `agent-runtime.workflow-controller` continuation and persistence scenarios for provider-backed behavior evidence.

## Impact

- Affected package: `@neko/dsh-bridge`.
- Affected development qualification: `scripts/dsh-q0`.
- No Renderer, preload, IPC, persistence, Skill, Tool, provider-selection or file-format contract changes.
- Existing Conversation and DSH Session identities remain authoritative.
