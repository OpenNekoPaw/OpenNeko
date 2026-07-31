## ADDED Requirements

### Requirement: Character authoring and runtime facts are separate

OpenNeko MUST treat CharacterProject and immutable CharacterVersion as character-authoring facts, while runtime bindings, saves, relationships, sessions, activities, and memories remain owned by their explicit runtime aggregates. A running character MUST NOT mutate its CharacterVersion or continuously read mutable CharacterProject draft state.

#### Scenario: A published character starts a runtime

- **WHEN** a user starts a character experience from a published CharacterVersion
- **THEN** the runtime records the exact CharacterVersion identity in a new mode-specific binding
- **AND** later runtime events do not modify that published version

#### Scenario: An author tests a draft

- **WHEN** Character Studio starts a narrative validation from an unpublished draft
- **THEN** it creates an explicitly identified frozen authoring-test snapshot
- **AND** that snapshot cannot be used as a published character in Home, World, or companion mode

### Requirement: Runtime kind is explicit and immutable

Every CharacterRun MUST be created with exactly one discriminated runtime kind, `narrative` or `companion`. The kind MUST remain immutable for the run lifetime, and switching experiences MUST create a new run with new identity, policy, memory owner, context snapshot, and AgentSession mapping.

#### Scenario: User changes from narrative to companion

- **WHEN** a user leaves a narrative experience and starts daily interaction with the same CharacterVersion
- **THEN** Chara creates a separate companion binding and run
- **AND** it does not mutate the narrative run kind or reuse its active AgentSession

### Requirement: Narrative runtime binds to an authoritative save

A narrative CharacterRun MUST bind an explicit CharacterVersion or authoring-test snapshot to an explicitly identified World/Narrative run, save, branch, checkpoint or timepoint, and actor instance. World/Narrative runtime MUST own story rules, events, branch history, save state, replay, and mutation commit; Chara MUST consume them through narrow ports and MUST NOT create a parallel Storyline or save engine.

#### Scenario: Published character enters a story

- **WHEN** a World/Narrative run instantiates an actor from a published CharacterVersion
- **THEN** the NarrativeCharacterRun records the exact actor, save, branch and CharacterVersion identities
- **AND** all story mutation remains committed by the World/Narrative owner

#### Scenario: Narrative runtime is unavailable

- **WHEN** no accepted World/Narrative runtime can provide save and branch authority
- **THEN** narrative character launch fails with an unavailable diagnostic
- **AND** Chara does not substitute Canvas Storyline playback, an ordinary Agent conversation or an empty save

### Requirement: Narrative memory follows causal and knowledge visibility

Narrative memory MUST be derived only from CharacterVersion canon plus events visible to the actor in the current save, branch ancestry and checkpoint/timepoint. The save owner MUST apply identity, revision, causal and knowledge-scope filtering before Memory infrastructure ranks, compresses or semantically retrieves the authorized set.

#### Scenario: Story branches after a shared event

- **WHEN** two narrative branches share an ancestor and then receive different user interactions
- **THEN** each character memory view includes the shared ancestor and only its own reachable branch events
- **AND** semantic retrieval cannot return events unique to the other branch

#### Scenario: Character returns to an earlier checkpoint

- **WHEN** a save resumes at a checkpoint before a later revelation
- **THEN** the character memory view excludes the later event
- **AND** the Agent prompt cannot recover it from another save, transcript or global memory index

#### Scenario: Character did not perceive an event

- **WHEN** an event exists in the current save but is outside the actor's knowledge scope
- **THEN** the event is excluded before retrieval
- **AND** the model is not asked to ignore an otherwise supplied hidden fact

### Requirement: Companion runtime uses a published character and durable relationship

Companion mode MUST accept only a published CharacterVersion and MUST bind it to a Chara-owned UserCharacterRelationship with stable relationship identity, local user scope, current CharacterVersion ref, accepted memory journal, version-binding history, policy and revision. Relationship lifetime MUST be independent from an individual CompanionRun, AgentSession, conversation view or tab.

#### Scenario: User starts daily interaction

- **WHEN** a user selects a published character for companion mode
- **THEN** Chara resolves or creates the explicit UserCharacterRelationship and starts a CompanionRun
- **AND** the run does not accept a mutable draft, Candidate or label-only character identity

#### Scenario: A companion session closes

- **WHEN** the active CompanionRun or AgentSession ends
- **THEN** Chara releases run-scoped resources according to lifecycle policy
- **AND** accepted relationship memory remains owned by the UserCharacterRelationship

### Requirement: Companion context keeps initial character, relationship, reality and activity facts distinct

Companion context MUST compose CharacterVersion initial context, an authorized relationship-memory view, a freshness-bearing RealityContext snapshot, current Activity context and effective capabilities as separate projections. Reality knowledge, provider/model knowledge, Tool output and transient Activity state MUST NOT automatically become CharacterVersion canon or relationship memory.

#### Scenario: Character discusses current real-world information

- **WHEN** companion mode receives authorized, current external context
- **THEN** the turn cites or scopes that RealityContext separately from relationship memory
- **AND** it does not persist the information merely because it appeared in a response

#### Scenario: Reality context is unavailable

- **WHEN** a requested current fact has no authorized or sufficiently fresh source
- **THEN** the runtime returns an explicit unavailable or uncertainty diagnostic
- **AND** it does not invent a current fact or store model output as memory

### Requirement: Companion long-term memory is committed through relationship policy

Companion interactions, Tool results and Activity events MAY produce structured memory candidates, but only the UserCharacterRelationship owner MUST accept, reject, correct or delete durable relationship memories according to sensitivity, retention and user-control policy. Accepted records MUST retain stable source identity and revision; sensitive data, credentials, temporary URLs and complete external payloads MUST NOT be stored as memory.

#### Scenario: User asks the character to remember a preference

- **WHEN** a user explicitly asks companion mode to remember a non-sensitive preference
- **THEN** the run creates a source-linked relationship-memory candidate
- **AND** the relationship owner applies the configured acceptance policy before it becomes durable

#### Scenario: Tool output contains sensitive data

- **WHEN** an authorized Tool result contains a credential, private file content or temporary access value
- **THEN** the relationship owner rejects that content as durable memory
- **AND** no summary may preserve the sensitive value

#### Scenario: User deletes a memory

- **WHEN** the user deletes an accepted relationship memory
- **THEN** the relationship revision advances and derived indexes are invalidated or rebuilt
- **AND** later CompanionRuns cannot retrieve the deleted record from a stale index

### Requirement: Version updates preserve runtime history through explicit migration

Narrative saves MUST pin their CharacterVersion until an explicit migration creates a new save revision or branch. Companion relationships MUST switch versions only through a new binding revision that classifies existing memories as retained, quarantined or discarded. Selected companion memories MUST remain relationship facts and MUST NOT be appended into or used to mutate the target CharacterVersion.

#### Scenario: Narrative project publishes a new character version

- **WHEN** an existing save references CharacterVersion A and CharacterVersion B becomes available
- **THEN** the existing save and replay remain bound to A
- **AND** using B requires an explicit compatible save revision or branch

#### Scenario: User updates a companion character

- **WHEN** the user rebinds a relationship from CharacterVersion A to B
- **THEN** the system presents or applies an explicit memory-retention decision and creates a new relationship revision
- **AND** conflicting memories are quarantined rather than silently overriding B

### Requirement: Companion activities remain owned by their domains

Tool use, co-viewing, game participation and other companion activities MUST execute through the single Agent Tool/Capability path and an owning Activity domain. Chara MUST hold only stable Activity refs, participation policy, authorized observations and memory candidates; it MUST NOT own media playback, game state, device handles, arbitrary input control or external application state.

#### Scenario: Character watches a movie with the user

- **WHEN** a CompanionRun joins an authorized media ActivitySession
- **THEN** the media owner controls resource access, playback, progress, cancellation and release
- **AND** Chara receives only scoped observations and may propose a minimal shared-experience memory

#### Scenario: Character participates in a game

- **WHEN** a game integration exposes typed character affordances
- **THEN** the Agent may act only through the current capability and approval policy
- **AND** Chara does not read or mutate the game's private state directly

### Requirement: Runtime modes use one AgentSession path

Each active NarrativeCharacterRun or CompanionRun MUST own at most one primary AgentSession mapping and MUST use the canonical Pi turn, Tool Call, Approval, cancellation, transcript, compaction and event path. A UserCharacterRelationship MAY create multiple sequential runs and sessions, but Chara MUST NOT create a parallel responder loop or use bounded purpose completion as a multi-turn runtime.

#### Scenario: Companion turn calls a tool

- **WHEN** companion mode requires an authorized external operation
- **THEN** the primary AgentSession executes it through the typed Tool Call path
- **AND** the resulting domain fact and optional memory candidate are committed by their respective owners

#### Scenario: Profile evaluation uses bounded completion

- **WHEN** Chara performs a finite profile extraction or evaluation with no runtime session or tools
- **THEN** it MAY use the bounded purpose-text operation
- **AND** that operation does not own a CharacterRun transcript, relationship memory or active AgentSession lifecycle

### Requirement: Cross-mode memory is isolated by default

Narrative save memory, companion relationship memory, CharacterVersion canon and another run's transcript or Activity state MUST remain isolated. Cross-mode transfer MUST require a separately designed, explicit, source- and target-identified review transaction; active UI selection, shared CharacterVersion identity or semantic similarity MUST NOT authorize transfer.

#### Scenario: Same character runs in both modes

- **WHEN** one CharacterVersion has an active narrative run and an active companion relationship
- **THEN** each runtime resolves memory only from its own owner and policy
- **AND** neither mode receives the other's interactions by default

### Requirement: Missing runtime owners fail visibly

Missing CharacterVersion, stale relationship/save revision, mismatched actor or run identity, unavailable Activity owner, revoked permission, unsupported runtime mode or absent required memory/context dependency MUST produce a typed diagnostic and prevent the affected turn or mutation. The system MUST NOT fall back to active state, another runtime mode, an old version, ordinary Agent chat or empty-memory success.

#### Scenario: Companion relationship revision is stale

- **WHEN** a CompanionRun attempts to commit memory against an outdated relationship revision
- **THEN** the relationship owner rejects the mutation without changing durable memory
- **AND** the run must obtain a new snapshot before retrying
