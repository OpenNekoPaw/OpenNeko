## Context

`@neko/generation` owns request/result, provider capability, execution port and the complete
GenerationJob lifecycle. The remaining composition is split: `CanvasGenerationNodeRuntime` creates its
own coordinator and `ConfigManager`, `registerMediaAgentTools` has no production registration, and the
Agent composer direct-media mode still uses the Conversation message route. These are three entry paths
without one authoritative Workspace Job owner.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Generation owns Workspace-qualified Job lifecycle; Agent owns Tool scheduling; Canvas owns its projection; Desktop owns trust/config/IO composition.    |
| Dependency     | Consumers depend on `@neko/generation` ports; Generation receives Host ports and never imports Agent, Canvas, Electron or config IO.                    |
| Interface      | One exact Workspace identity resolves one `GenerationJobPort`; direct operation and Agent Tool submit through that same port.                           |
| Extension      | New direct surfaces or Tools attach to the existing Workspace runtime and cannot register another coordinator or default provider.                      |
| Test           | Path tests assert shared owner identity, exact model binding, no Conversation for direct operation, no entry fallback and fail-local sibling isolation. |

## Decisions

### One application runtime owns Workspace Generation owners

`@neko/generation/job` exposes a host-neutral Workspace application runtime. Desktop constructs one
instance for the application and injects a factory that creates an owner from an exact immutable
Workspace binding. Concurrent requests for the same Workspace share one pending or ready owner;
Workspace identity/root mismatch fails. Failed creation is removed locally so another Workspace remains
usable. The runtime releases every materialized owner only during its own application lifecycle disposal;
UI unmount and Agent/Canvas navigation never own Job cancellation.

The runtime is not a global singleton, cache, registry with fallback, or second Host. Its map is the
authoritative application ownership table for only the Workspace Generation runtimes actually used in
this Desktop process.

### Desktop injects one configuration authority

Desktop owns one Workspace `ConfigManager` per exact Workspace and shares its immutable effective
projection with Agent model policy and Generation execution construction. Generation receives only a
`GenerationExecutionPort`, Job store and result committer. Canvas and Agent must not instantiate or read
another config authority.

### Canvas and Agent consume the same port

Canvas obtains the exact Workspace `GenerationJobPort` from the shared runtime for describe, observe and
regenerate. Agent AppHost obtains that same port while attaching the same Workspace and registers the
existing media Tool adapters once in its Workspace Tool registry. Neither consumer reads the Job store or
owns coordinator disposal.

### Direct operation is not an Agent Turn

The Agent composer can host explicit image/video/audio controls, but their submit is a typed direct
Generation operation bound by Desktop to the exact Draft or Session Workspace authority. It creates a
detached GenerationJob directly and returns the Job projection. It does not create an empty Conversation,
user transcript message, Agent Turn, Pi Session or Tool Call. Natural-language generation remains an
Agent Turn whose approved Tool calls the same Workspace port.

Model/provider identity is exact and purpose-qualified at both boundaries. A stale or unavailable direct
binding rejects that operation; an Agent Tool failure remains a Tool failure. Neither path retries through
the other or selects another provider/model.

## Ownership

Configuration, credentials, workspace authorization and Electron transport remain Host-owned. The
domain receives immutable resolved facts and never imports Agent, Platform, Electron, React or config IO.
Missing binding, provider mismatch, stale job identity and recovery uncertainty fail visibly and locally.

## Verification

Deterministic tests must first prove shared Workspace owner identity, single owner creation under
concurrency, Canvas/Agent delegation, direct-operation no-Conversation semantics, exact purpose/model
validation and poisoned old paths. Reuse and update `agent-runtime.workflow-controller` GenerationJob
cases for the Agent Tool path; key-free validation proves only harness readiness. With explicit user cost
authorization, run one normal Electron Desktop provider case and record effective model, Job, artifact,
canonical owner and no-fallback evidence.
