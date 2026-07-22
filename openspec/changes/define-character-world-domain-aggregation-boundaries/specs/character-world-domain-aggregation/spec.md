# Character and World Domain Aggregation

## ADDED Requirements

### Requirement: Character and World are sibling top-level domain aggregators

OpenNeko MUST treat the proposed `neko-chara` and `neko-world` packages as sibling bounded-context packages. They MUST NOT be nested under `neko-agent`, and the application host MUST remain the concrete Composition Root.

#### Scenario: Package ownership is designed

- **WHEN** Character IP or Interactive World implementation is proposed
- **THEN** its domain facts and lifecycle are assigned to `neko-chara` or `neko-world`
- **AND** concrete host, renderer, device, Engine, and Agent implementations are composed by the application host through public contracts

### Requirement: Character owns project, version, and run semantics

`neko-chara` MUST own the `CharacterProject -> CharacterVersion -> CharacterRun` lifecycle and character-specific bindings for profile, representation, voice, memory policy, capability policy, roleplay, and validation. It MUST reference Entity, Asset, Agent, representation, voice, and perception capabilities through stable refs or ports instead of copying their implementations or facts.

#### Scenario: A character is published and run

- **WHEN** a CharacterProject candidate is reviewed and published
- **THEN** it produces a stable CharacterVersion suitable for cross-project reference
- **AND** each CharacterRun receives its own run and Agent session identities

### Requirement: World owns project, version, run, save, and replay semantics

`neko-world` MUST own the `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` lifecycle, including world rules, events, time, world-local state, Gameplay, persistence, and mutation validation.

#### Scenario: A world is executed

- **WHEN** a WorldVersion starts
- **THEN** the runtime creates an explicitly identified WorldRun
- **AND** state mutation, save, branch, and replay remain world-owned facts rather than Agent transcript or UI state

### Requirement: World consumes published characters through explicit bindings

World MUST reference reusable characters through a published CharacterVersion and an explicit WorldCharacterBinding. World-local identity, location, inventory, relationship progress, tasks, events, and experiences MUST belong to WorldRun or WorldSave and MUST NOT silently mutate the source CharacterVersion.

#### Scenario: A character participates in a world

- **WHEN** a published character is added to a WorldProject or WorldRun
- **THEN** the world creates a WorldCharacterBinding or actor instance with explicit identity
- **AND** later world state changes remain save-scoped unless the user explicitly reviews and promotes them

#### Scenario: An ambient NPC is used

- **WHEN** a world needs a background NPC without a reusable CharacterVersion
- **THEN** it MAY create a world-local archetype
- **AND** promotion to a reusable character MUST be explicit and MUST NOT rewrite existing saves or replay history

### Requirement: Character and World reuse one Agent canonical path

Character roleplay, character actions, NPC decisions, and World Agent interactions MUST use the existing `neko-agent`/Pi AgentSession, Tool, Task, Approval, cancellation, transcript, and event path. Implementations MUST NOT add a parallel generic Agent loop, provider adapter, tool protocol, or task runtime.

#### Scenario: A roleplay or world turn needs tools

- **WHEN** the current CharacterRun or WorldRun requires reasoning or an external operation
- **THEN** the owning Character or World application service requests an isolated AgentSession through the injected AgentSession port with domain context and an allowed capability projection
- **AND** the owning Character or World operation validates and applies any resulting mutation

### Requirement: Character and World Gameplay ownership is distinct

Character MUST own only portable individual capabilities and behavior policy, including speech, motion intent, expression, perception, interaction affordances, and individual decision policy. World MUST own maps, goals, quests, combat, economy, progression, event scheduling, and overall win/loss state.

#### Scenario: A character attempts a world action

- **WHEN** a CharacterRun proposes movement or interaction inside a WorldRun
- **THEN** World runtime validates the action against current rules, permissions, and revision
- **AND** only the World runtime may commit it as world state

### Requirement: Cross-domain dependencies remain acyclic

World MAY depend on public CharacterVersion/ref contracts. Character core MUST NOT depend on World private runtime. Environment observation and action MUST be connected through a narrow port or host-owned adapter, and `neko-agent` MUST remain domain-neutral.

#### Scenario: A character observes a world

- **WHEN** a CharacterRun is bound to a WorldRun
- **THEN** the host supplies the Character runtime with a bounded environment adapter
- **AND** neither domain reads or mutates the other's private store or active singleton

### Requirement: Host composes but does not orchestrate domain behavior

The application host MUST construct and inject Character and World application services and concrete adapters, but MUST NOT own roleplay-turn decisions, NPC behavior, WorldAction validation, memory promotion, or domain mutation. Character and World application services MUST own their respective run orchestration through consumer-owned ports.

#### Scenario: The same Character runtime is hosted on multiple surfaces

- **WHEN** VS Code, Desktop, or TUI creates a CharacterRun
- **THEN** each host injects its own Agent, storage, renderer, device, and lifecycle adapters into the same Character application contract
- **AND** no host duplicates the Character turn, memory-candidate, or capability-policy workflow

### Requirement: Actor and AgentSession ownership is unique

A WorldActorInstance backed by a published CharacterVersion MUST reference one CharacterRun, and that CharacterRun MUST own at most one active primary AgentSession. World MUST NOT create a second NPC AgentSession for the same actor. Ambient world-local NPCs and world-level director sessions MUST use separate explicit scopes and identities.

#### Scenario: A published character enters a world

- **WHEN** World creates an actor from a CharacterVersion
- **THEN** the actor binding records the CharacterRun identity that owns the primary AgentSession
- **AND** World does not create another actor-level AgentSession for that identity

#### Scenario: An ambient NPC reasons without a CharacterProject

- **WHEN** a world-local archetype needs model reasoning
- **THEN** the world-local actor controller MAY own an explicitly scoped AgentSession
- **AND** it MUST NOT synthesize a CharacterRun or reusable CharacterVersion

### Requirement: Effective capabilities are an intersection

The callable capability set for a Character or World turn MUST be the intersection of Host permission, workspace trust, CharacterVersion policy, WorldCharacterBinding policy, and current run scope. Each layer MAY only narrow authorization. The turn MUST resolve tools from a captured policy snapshot, and every side-effecting owner MUST revalidate current permission, identity, revision, and approval before commit.

#### Scenario: World policy denies a character capability

- **WHEN** a CharacterVersion allows a capability but the active WorldCharacterBinding or run scope denies it
- **THEN** the capability is absent from the turn's callable tool catalog
- **AND** an explicit stale or forged call returns a typed denial rather than falling back to a prompt or no-op success

#### Scenario: Permission changes during a long turn

- **WHEN** Host permission or workspace trust is revoked after the turn starts but before mutation commits
- **THEN** the owning operation rejects the mutation during commit-time revalidation
- **AND** the prior policy snapshot does not authorize the side effect

### Requirement: Character actions use revisioned WorldAction transactions

Character MUST NOT directly mutate World storage. Each cross-domain action MUST carry explicit world run, actor, optional CharacterRun, action, and expected revision identities plus a typed intent. World runtime MUST be the only commit owner and MUST atomically return committed events/revision or a typed rejection diagnostic.

#### Scenario: A character action commits

- **WHEN** a bound character submits an authorized action against the current expected World revision
- **THEN** World validates identity, binding, idempotency, rules, permission, and resources before committing
- **AND** the response contains the committed revision and WorldEvents

#### Scenario: A character acts on stale world state

- **WHEN** expected revision is stale or the run/actor binding does not match
- **THEN** World rejects the request without mutation
- **AND** it does not redirect to an active world, silently retry, or let Agent patch World state

### Requirement: Memory fact ownership and promotion are explicit

CharacterProject/CharacterVersion MUST own versioned character knowledge and memory policy, CharacterRun MUST own run-scoped memory candidates, WorldSave MUST own save-scoped relationships and experiences, and shared Memory infrastructure MUST own only derived indexing, compression, and recall. Cross-lifecycle memory updates MUST require explicit review and promotion.

#### Scenario: A world experience may affect a reusable character

- **WHEN** WorldSave records an experience relevant to a published character
- **THEN** the experience remains save-scoped until explicitly submitted and accepted as a CharacterProject candidate
- **AND** publishing a new CharacterVersion is the only path that changes reusable character memory

#### Scenario: Memory infrastructure retrieves context

- **WHEN** the memory service indexes, compresses, or recalls authorized snapshots
- **THEN** its result is a derived candidate or context projection
- **AND** it cannot directly write CharacterVersion, WorldSave, or Agent transcript facts

### Requirement: Durable references exclude host-private handles

Character and World project/version/save facts MUST persist only stable portable references and provider-neutral policy. Device identifiers, live renderer/voice/Engine sessions, Webview or localhost URLs, tokens, process IDs, absolute cache paths, provider objects, and temporary locations MUST remain run-scoped and host-private.

#### Scenario: A CharacterRun is restored on another host

- **WHEN** a persisted CharacterVersion or WorldSave is reopened
- **THEN** the host resolves and reauthorizes concrete providers from stable references
- **AND** a missing provider or permission produces an unavailable diagnostic instead of reusing a stale handle or reporting empty success

### Requirement: Core modules remain independent from adapters

Character and World core modules MUST depend only on domain values, shared stable references, and explicitly allowed public cross-domain contracts. Agent, renderer, device, Engine, VS Code, React, and host dependencies MUST remain in application ports or adapter/host modules and MUST be enforced by architecture tests.

#### Scenario: An Agent contribution is added

- **WHEN** Character or World contributes context and tools to Agent
- **THEN** the contribution adapter depends on public Agent contracts and package-owned application ports
- **AND** core modules do not import Agent runtime or expose adapter state as domain facts

### Requirement: Proposed capabilities do not imply executable support

Architecture documents MUST identify Character/World packages and currently absent Device/Live, Scene/Puppet, persistent 2D/3D authoring, and World runtime paths as proposed until separate implementation changes provide canonical contracts and validation.

#### Scenario: An unimplemented capability is requested

- **WHEN** no accepted implementation exists for a Character or World capability
- **THEN** the product returns an unavailable diagnostic
- **AND** it MUST NOT restore a legacy command, fallback, empty provider, or successful no-op
