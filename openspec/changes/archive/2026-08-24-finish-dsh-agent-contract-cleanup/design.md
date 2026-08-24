## Context

DSH owns Agent/Session/Skill/MCP/Plugin and Tool-call lifecycle. OpenNeko owns the ACP application
boundary, Conversation binding and package-owned domain operations. Runtime convergence tests already
prove that pre-Pi provider, profile, permission, perception, MCP wrapper and generic Tool registry
implementations are absent, while `@neko/agent-contracts` still exports their type graphs.

The cleanup is intentionally separate from `purify-agent-contracts`: unreachable behavior is deleted
here; a later extraction may move only behavior that still has real runtime and Webview consumers.

## Decisions

### 1. Reachability is required for retained contracts

A contract is retained only when a current production producer/consumer crosses a package or runtime
boundary, or when it is part of a live canonical serialized shape. Root re-export, test-only use and
an unused public barrel are not production consumers.

The inventory classifies every deleted file together with its incoming production imports. A deleted
contract's test is deleted rather than used as evidence that the retired capability remains supported.

### 2. Delete closed dead graphs atomically

The following graphs are cleanup candidates when the inventory confirms no live consumer:

- generic Tool, Platform, ProviderCard, AgentProfile, observation/perception and planning contracts;
- composite artifact, storyboard overlay, shot-image preparation and comic-animation review/indexing;
- legacy Message multimodal/backfill/artifact transfer projections and their dead runtime projectors;
- retired conversation-unavailable and PluginTransfer contracts/presenters;
- isolated phase/settings/provider/trace/config helpers with no current boundary consumer.

If a live file needs one small neutral type from a dead graph, that type is moved to the live owning
contract rather than retaining the retired aggregate.

### 3. Preserve DSH and package-owned domain authority

The cleanup does not change DSH request routing, session identity, permission ownership, Agent Entry,
Conversation context/binding, current composer configuration or domain Tool schemas. Canvas, Cut,
Generation, Character, World, Content and AI facts remain owned by their packages.

Skill/MCP management is retained even though its current `extension-management` name is broad; the
canonical contract and UI expose only Skill/MCP while Plugin remains internal DSH composition.

### 4. Keep Desktop thin

Desktop production modules are not changed except where a compile-time import proves that a supposedly
dead contract is actually live. Desktop remains the concrete Electron trust/authorization adapter and
composition root. No deleted behavior is moved into `apps/neko-desktop`.

### 5. Prove absence and preservation

Package tests assert that deleted exports and paths are absent. Typechecks prove current producers and
consumers use the retained canonical shapes. Repository searches prove there is no alias, compatibility
barrel or duplicate replacement.

## Five-layer analysis

- Responsibility: remove Agent runtime models now owned by DSH and unreachable Agent presentation
  models; retain only live Agent boundary contracts.
- Dependency: reduce `agent-contracts` dependencies on Canvas, Chara, Entity, Media and Search where the
  only importing files are deleted; do not introduce reverse domain-to-Agent dependencies.
- Interface: one version-free canonical DSH/Agent contract surface remains; no compatibility exports.
- Extension: future domain Tools add package-owned schemas/operations and a thin DSH contribution,
  without extending a generic OpenNeko Tool or Platform abstraction.
- Testing: contract/runtime typechecks, focused tests, public-path absence tests, unused/debt checks and
  repository search evidence.

## Risks

- A root export may have an indirect production consumer. Mitigation: inspect named imports and run all
  affected package typechecks before deleting its file.
- Removing a dead runtime barrel export can break an undocumented caller. Mitigation: the monorepo is
  private/prelaunch; search every workspace source and delete atomically without a shim.
- Current unrelated Generation/Job work is dirty in the same worktree. Mitigation: do not edit or
  reformat those files and review the final diff by exact path.
