## Why

`openneko.generation submit` creates a durable Generation Job and waits for its settlement, but the
Agent path does not project the published Job or its authoritative snapshots to the Canvas selected
for that Turn. The creator therefore sees neither an in-progress Generation node nor the committed
outputs on the Board. The existing Canvas Generation projection is deterministic and idempotent, but
has no production caller for Agent-created Jobs.

## What Changes

- Project an Agent-created Generation Job to the exact Canvas target admitted for the originating
  Turn immediately after the durable JobRef exists.
- Update the same Canvas Generation node from Generation-owned snapshots and, on success, bind the
  committed output references inside that node instead of creating generic Job or sibling media
  nodes.
- Keep Generation as Job authority, Canvas as durable projection authority, and Desktop Main as
  thin composition/trust boundary.
- Deduplicate Generation nodes by exact JobRef and output bindings by canonical ContentLocator.
- Merge delivery into the exact already-open Workspace Board document and persist the combined
  result so unsaved user-authored Canvas content is preserved rather than blocking projection.

### Non-goals

- Changing the Agent or Canvas Webview UI.
- Mirroring Canvas-originated Generation Node runs to the Workspace Board.
- Persisting provider payloads, temporary URLs, base64 data, hidden reasoning, or transient logs.
- Selecting an active, recent, or default Canvas when the originating Turn has no admitted target.

## Capabilities

### New Capabilities

- `agent-generation-canvas-projection`: Incremental projection of Agent-created Generation Jobs and
  committed results to the exact Canvas admitted for the originating Turn.

### Modified Capabilities

None.

## Impact

- `@neko/agent-runtime` owns the Generation Tool lifecycle notification port and invokes it from the
  canonical submit/observe path without importing Canvas.
- `@neko/canvas-domain` owns the strict Generation Job projection request, validation, deterministic
  Job/result node mutation and replay semantics.
- `@neko/canvas-node` continues to own durable `.nkc` mutation through the existing Workspace Board
  coordinator.
- `apps/neko-desktop` only wires the exact DSH Session/Turn Canvas admission, Workspace authority,
  Agent lifecycle port and Canvas delivery service.
- Existing Canvas documents and Generation Jobs require no migration. New projections add one
  ordinary durable Generation node only after an admitted Agent Generation submission.
