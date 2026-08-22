# Design: Agent Generation Job Canvas projection

## Five-layer analysis

- **Responsibility:** Generation owns Job publication and snapshots; Agent owns Tool execution and
  exact Session/Turn/ToolCall context; Canvas owns graph projection and `.nkc`; Desktop owns Workspace
  authorization and exact target wiring.
- **Dependency:** Agent exposes a narrow Host-neutral snapshot projection port and never imports
  Canvas. Canvas consumes immutable Generation facts and ContentLocators without calling the provider.
- **Interface:** every projection carries exact JobRef, DSH Session/Turn/ToolCall identity, admitted
  Canvas target, bounded creator-facing summary, authoritative phase and optional committed results.
- **Extension:** additional Generation media kinds extend the Generation request-to-summary projector
  and Canvas artifact renderer without adding a second Job owner or Tool-specific Board writer.
- **Testing:** deterministic tests prove lifecycle ordering, target fencing, replay/deduplication and
  failure isolation; Agent Evaluation proves the real Tool -> Job -> selected Canvas path.

## Canonical path

```text
DSH openneko.generation submit
  -> Generation durable Job publication
  -> Agent Host-neutral lifecycle projection port
  -> exact admitted Session/Turn Canvas target
  -> Canvas Workspace delivery coordinator
  -> deterministic Canvas Generation node upsert
  -> Generation snapshot observation
  -> same Generation node runtime-state update
  -> succeeded result ContentLocators -> Generation output bindings
```

The initial projection happens only after `submitGeneration` returns the authoritative JobRef. It
contains the canonical Canvas Generation Recipe, exact run binding and current phase. Subsequent
snapshots reuse the same JobRef. Once a JobRef exists, its `jobId` is the authoritative run identity.
`submissionId` remains optional submission-time idempotency evidence and is compared only when the
originating owner actually supplied it; Canvas never fabricates one from `jobId`. A succeeded snapshot
must contain at least one whole-Workspace result locator; failed, cancelled and outcome-unknown
snapshots retain the Generation node and diagnostic without outputs.

## Projection identity and durability

The Generation node identity is derived only from `{ kind: "generation", jobId }`. Output binding
identity is derived from canonical ContentLocator. A delivery event has its own deterministic identity
derived from the exact ToolCall, JobRef and authoritative snapshot facts so replay is a no-op while a
later snapshot can update the existing node. `sourceFingerprint` and provider state are
freshness/evidence only and never become node identity.

Canvas-originated submission state may use `submissionId` before the Generation owner publishes a
JobRef. After binding, resume, observation, recovery and result application use the exact JobRef. An
Agent-created Job that has no `submissionId` is therefore still fully resumable from `jobId`; missing
optional idempotency evidence must not be rewritten into an `outcome-unknown` lifecycle state.

The Canvas Workspace delivery ledger remains the only delivery-state store. Each accepted snapshot is
queued before `.nkc` mutation. The coordinator uses the exact open Workspace Board session as the
authoritative mutation base when present, applies the Canvas-owned projection, atomically persists the
combined document, and refreshes every exact sibling view. Divergent dirty views fail visibly instead
of choosing one. An unavailable Canvas blocks only this projection and does not cancel the durable
Generation Job.

## Failure and lifecycle semantics

- Missing admitted Canvas target rejects the projection with a visible Host diagnostic; there is no
  active/recent/default Canvas fallback.
- Projection failure does not rewrite a successful Generation Job as failed and does not change the
  Tool's Generation settlement facts.
- Tool cancellation releases only the Agent observer. The last accepted Job projection remains; the
  durable Job continues under Generation ownership and can be reconciled by the same canonical owner.
- A terminal failure or cancellation updates the Job node and preserves earlier user layout.
- Repeated snapshots never create duplicate Generation nodes or output bindings.

## Prompt and result presentation facts

Canvas stores only bounded creator-facing Generation summary: prompt, exact model identity when
available, media kind and safe parameters already present in the canonical Generation request. It does
not store credentials, raw provider requests, runtime handles, temporary URLs or binary payloads.
Successful outputs remain stable ContentLocator-backed bindings rendered by the Generation node. The
Generation node remains the process/provenance owner and is not replaced by a generic media reference.

## Package ownership

| Owner                 | Canonical entry                                   | Producer -> consumer                        | Replaced path                                            |
| --------------------- | ------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `@neko/generation`    | Job request/snapshot contracts                    | provider/committer -> Agent/Canvas          | none; remains Job authority                              |
| `@neko/agent-runtime` | Generation Tool lifecycle projection port         | DSH Host adapter -> Host composition        | terminal-only Tool result with no progressive projection |
| `@neko/canvas-domain` | Workspace Generation projection request/projector | Host delivery -> `.nkc` mutation plan       | uncalled standalone Job projector                        |
| `@neko/canvas-node`   | Workspace Board mutation/coordinator              | Canvas domain plan -> authorized file save  | no alternate writer                                      |
| Desktop Main          | package port wiring                               | exact Session/Turn target -> Canvas service | no business projection logic retained in app root        |

## Agent Evaluation

Disposition: **update** `agent-runtime.workflow-controller` because this changes asynchronous Tool and
artifact projection behavior. The positive case must prove one natural-language media request uses the
canonical Generation Tool, publishes one exact Job, projects a running Job node to the selected Canvas,
then updates it with committed result locators. The boundary case must prove a missing or wrong Turn
target produces a visible projection diagnostic without selecting another Canvas or cancelling the Job.
Deterministic package tests remain required but do not replace the visible real Desktop/provider case.
