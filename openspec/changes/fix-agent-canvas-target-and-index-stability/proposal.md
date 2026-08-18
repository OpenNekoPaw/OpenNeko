## Why

The Workspace Board is the canonical default Canvas context, but the renderer currently projects it as `undefined`, so the controller does not resolve or inject Board context into each Turn. Draft selection and the per-conversation Tab render state are separate, while Canvas catalog loading and ordering are unstable across ordinary streaming renders.

## What Changes

- Make the logical Workspace Board an explicit canonical Canvas turn target throughout producer, request, queue, controller, prompt and capability composition. The Board is never represented as "no target" and never falls back to active/current/recent state.
- Hand the exact Draft-time Canvas selection to the newly created Conversation Tab render state, and keep per-Tab selection in the Tab-owned render store.
- Stabilize Canvas catalog loading by keying effects on the stable Workspace identity and by not clearing/reloading the catalog during ordinary conversation re-renders.
- Deterministically sort exact Canvas catalog entries before building the index so recursive catalog results are stable.
- Add path-level tests for Board target propagation, exact target handoff, stable catalog reloads, deterministic ordering and protected `.nkc` handling.

## Capabilities

### New Capabilities

- `agent-canvas-turn-target`: Explicit canonical Workspace Board and exact Canvas target propagation from Draft through Turn/queue/controller/prompt/capability, plus exact Draft-to-Tab selection handoff.

### Modified Capabilities

- `canvas-workspace-context`: Exact Canvas catalog options are deterministically ordered.

## Impact

- `@neko/agent-webview` owns renderer selection, Draft-to-Tab handoff and catalog-loading stability.
- `@neko/canvas-domain` owns deterministic Canvas index ordering and exact Board/Canvas turn context.
- `@neko/agent-runtime` owns exact Turn-bound Canvas capability projection.
- `apps/neko-desktop` remains the thin Host composition root; no production logic is added there.
- No UI appearance, entry, or interaction design changes are made.
