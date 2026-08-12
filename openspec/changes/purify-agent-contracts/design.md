## Context

`@neko/agent-contracts` is the Agent L0 package consumed across Main, preload, renderer, runtime, and
tests. It currently contains both wire/schema work and behavior such as storyboard-to-shot preparation,
perception projection, visual occurrence conversion, review-table construction, regeneration advice,
and status transitions. The package also depends on multiple domain contracts, making it the natural
place for cross-domain Agent schemas but not for their application behavior.

Moving all behavior to `@neko/agent-runtime` would keep Node/Pi/session dependencies out of renderers
only by adding unsafe subpaths or parallel implementations. Moving it into Canvas or Generation would
make one domain own multi-domain Agent presentation. A small host-neutral Agent domain package is the
real dependency boundary.

## Goals / Non-Goals

**Goals:**

- Make `@neko/agent-contracts` a predictable L0 schema/codec boundary.
- Give Agent-owned pure domain behavior one host-neutral owner usable by runtime and Webview.
- Preserve owning domain facts and dependency direction.
- Remove old behavior exports and prove consumers execute the new path.

**Non-Goals:**

- Moving Pi/session/tool orchestration out of `@neko/agent-runtime`.
- Moving Canvas, Generation, Chara, Entity, Content, Search, or Media facts into Agent ownership.
- Introducing interface/factory/provider layers for pure deterministic functions.
- Keeping compatibility re-exports from `@neko/agent-contracts`.

## Decisions

### 1. Create `@neko/agent-domain` as a host-neutral L1 package

Canonical path: `packages/agent/domain`, public package entry `@neko/agent-domain`. Its role is pure,
host-neutral Agent-specific transformation and policy over already validated snapshots. It imports
`@neko/agent-contracts` and only required domain public contract entries. It imports no Node, Electron,
React, DOM, Pi runtime, storage adapter, or application module.

Producers are Agent/domain tests and owning domain snapshot providers. Consumers are Agent runtime and
Agent Webview presenters that need the same deterministic behavior. Lifecycle remains caller-owned;
functions are stateless and direct.

Alternative rejected: put these functions in Desktop Main. There is no Electron/application ownership;
the behavior is host-neutral and reusable by runtime and renderer-side presentation.

### 2. Define a strict contract allowlist by responsibility

`@neko/agent-contracts` may own:

- types/interfaces and discriminated unions;
- kind/operation/status constants and semantic identities;
- codecs, parsers, type guards, structural validators, diagnostics, and identity normalization;
- protocol messages and side-effect-free constructors whose output is determined directly from their
  fields without domain decisions.

For Agent Skills, this allowlist is narrower still: Contracts owns only the portable authoring request
and public creation receipt plus the typed executable/management projections consumed across runtime
boundaries. Pi owns the runtime Skill shape, parser, discovery and invocation. Contracts must not
reintroduce a parallel `Skill` runtime interface, Host overlay, workflow metadata or command loader.

It may not own:

- `derive*`, `project*`, `recommend*`, `transition*`, `plan*`, or review/presentation builders that apply
  domain policy;
- orchestration, persistence, registries, caches, mutable state, provider selection, or resource access;
- a second copy of an owning domain algorithm.

Names are signals, not the only test: the boundary audit classifies responsibility and has explicit
fixtures for allowed codec projection versus prohibited business projection.

### 3. Move the audited behavior as one canonical path

Initial moves include:

- shot image preparation derivation, table building, status transition, and regeneration recommendation;
- perception-card/indexed-range projection, visual occurrence and shot-reference projection;
- local perception capability policy/diagnosis where it chooses operational behavior rather than merely
  validates shape;
- comic-animation and batch/continuity review-artifact/table construction.

Types, constants, codecs, type guards, and structural validators remain contracts. If an implementation
function currently shares a file with its schema, the change first separates schema and behavior, then
deletes the behavior export from the contract entry.

Runtime and Webview consumers switch atomically. No deprecated alias or compatibility re-export is
provided because the repository is prelaunch and all consumers are in the workspace.

### 4. Preserve domain ownership at inputs and outputs

Agent Domain consumes immutable, validated public snapshots and produces Agent-owned plan/review
artifacts. It does not write Canvas boards, Generation jobs, Entity memory, Content files, Search
indexes, or Media metadata. Authoritative mutations continue through owning package operations and
typed Host ports.

The package dependency gate forbids domain packages from importing Agent Domain, preventing reverse
ownership. Agent Domain may depend only on the narrow public contracts required for composition.

### 5. Verify both boundary and path

Contract tests preserve serialized codec behavior. Agent Domain producer tests cover the moved
algorithms. Runtime/Webview consumer tests assert the new module is called and repository checks prove
old exports/imports are absent. Repository gates reject prohibited dependencies and business-behavior
exports from contracts.

No persistent data migration is allowed. If an artifact codec must change, all producers and consumers
switch atomically to one version-free canonical shape; existing non-canonical bytes remain untouched and
fail only at their exact record boundary.

## Risks / Trade-offs

- **[New package for a small number of files]** → The package is justified by two runtime consumers with
  incompatible Node/React dependency closures and a stable host-neutral behavior boundary; avoid extra
  factories or sublayers.
- **[Behavior/validation boundary can be ambiguous]** → Keep structural validation in Contracts and any
  choice, derivation, transition, recommendation, or multi-input projection in Agent Domain.
- **[Cross-domain dependency growth]** → Import only public contract entries, audit each dependency, and
  prohibit reverse imports into domain authorities.
- **[Large files remain large after a mechanical move]** → Split by contract versus use case, not by
  arbitrary line count, and retain focused tests per use case.

## Replacement Plan

1. Inventory every Agent Contracts export and classify it as schema/codec or behavior.
2. Scaffold `@neko/agent-domain` with strict TypeScript/package boundaries and no runtime-specific deps.
3. Move shot-image-prep behavior, switch all consumers/tests atomically and delete old exports.
4. Move comic-animation indexing/review behavior, switch all consumers/tests atomically and delete old exports.
5. Run dependency, package-boundary, contracts, Agent Domain, runtime, Webview, build, test, and check
   gates.

Rollback reverts the whole consumer/import replacement. It does not preserve dual exports.

## Open Questions

None. Additional functions discovered by the export inventory follow the responsibility rules rather
than being grandfathered by filename.
