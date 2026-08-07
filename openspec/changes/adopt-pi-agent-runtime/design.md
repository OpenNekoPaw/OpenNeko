## Context

当前产品只有 Electron Desktop。Pi 已是 Agent 的 canonical runtime；剩余工作不是再次迁移
runtime，而是证明生产 Desktop 组合满足性能、许可、凭据和安全边界。

## Five-layer analysis

- **Responsibility:** Pi owns the generic Agent loop, Tool scheduling, provider protocol, Skill parsing,
  and transcript primitives. OpenNeko owns product identity, permission, durable domain Jobs, resources,
  configuration projection, credential persistence and Desktop presentation.
- **Dependency:** Electron Main composes the host-neutral Agent runtime. Preload exposes a fixed typed
  namespace. Renderer imports neither Pi, Node, Electron nor persistence implementations.
- **Interface:** one conversation-scoped runtime exposes execute, cancel, steer, follow-up, approval and
  event subscription with explicit conversation/branch/turn/run/Tool identities.
- **Extension:** new providers and purposes require an actual Desktop caller and explicit binding; missing
  capability or credential fails visibly without provider/model fallback.
- **Testing:** deterministic path tests prove retired Agent/provider/session imports and registrations are absent; packaged Electron
  measurement owns startup, bundle, OAuth callback/cancellation and redaction acceptance.

## Decisions

### One Desktop conversation authority

`@neko/agent-runtime` owns one program-level application authority indexing conversation-scoped Pi
runtimes. Electron Main constructs it from package public ports and owns only sender-bound IPC, credential/
content concrete adapters, application lifecycle and disposal. Each active
conversation owns its Pi Agent, active Pi Session branch, queues, abort state, immutable model-policy
snapshot and event projection. UI selection never becomes runtime state ownership.

Multiple Desktop windows may observe the same conversation. Only the current fenced execution lease
holder may advance a turn or commit its terminal checkpoint; stale epochs fail visibly.

### One transcript, one portable manifest, and one operational catalog

Pi Session JSONL is the sole transcript/context/compaction authority. OpenNeko SQLite owns only
machine-local execution leases/checkpoints, task/runtime lifecycle identities, permission facts and
replaceable listing/search projections in the canonical `~/.neko/neko.db`. A versioned user-global
conversation manifest owns the user-visible title, branch topology, export identity and Pi Session
references so conversations can be transferred without copying SQLite. Workspace files never store
Agent transcripts, and no legacy reader, dual write, importer or fallback can return success.

### Flat model and credential projection

At turn start, configuration resolves once into an immutable flat map keyed by exact purpose. Missing
or invalid bindings prevent registration or execution. Pi provider/auth contracts are canonical;
OpenNeko provides one user-level CredentialStore with durable provenance, deletion and redaction.
Secrets, authorization headers, physical Skill locators, absolute paths and cache handles never enter
workspace facts, Pi Session, logs or renderer projections.

### Fixed Desktop boundary

Renderer sends only typed intents through preload. Main derives sender/application/window/view/workspace
identity, applies trust and permission policy, and projects bounded diagnostics. Provider/model errors,
OAuth cancellation, storage failure and Tool failure stay fail-visible. Browser-only or direct-runtime
tests cannot substitute for the packaged Electron boundary.

## Acceptance

Measure the production Desktop Agent bundle and startup on a supported packaged target. Audit Pi and
provider licenses, CredentialStore provenance/redaction, OAuth callback port and cancellation, and all
absolute/cache-path disclosure surfaces. Record unavailable credentials, network or cross-platform
targets as blockers without substituting a retired Host or mock provider.
