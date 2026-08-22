# interactive-world-authoring Specification

## Purpose
TBD - created by archiving change define-ai-native-interactive-world. Update Purpose after archive.
## Requirements
### Requirement: Canonical interactive World aggregate

The World Definition capability SHALL provide a revision-controlled `WorldProject` aggregate that owns WorldDefinition, semantic SceneDefinition, WorldActorBinding, InteractionDefinition and WorldRule facts, and SHALL publish an immutable user-managed `WorldVersion` without Story progress, Gameplay state, runtime state, internal contract generation or Host handles.

#### Scenario: Publish a valid World project

- **WHEN** an author publishes a valid WorldProject at its expected revision
- **THEN** the World owner produces an immutable WorldVersion containing the accepted definitions and their stable source identities

#### Scenario: Reject an invalid World project

- **WHEN** a WorldProject contains an unknown technical field, unresolved required identity or unsafe runtime value
- **THEN** publication fails with a typed diagnostic and no WorldVersion is created

### Requirement: World references Character and Entity authorities

WorldProject SHALL reference published CharacterVersion and stable Entity or Asset identities through explicit bindings and SHALL NOT duplicate Character canon, mutable Project Entity authority or representation bytes. World authoring SHALL NOT create, edit, publish or delete CharacterProject/CharacterVersion; an original NPC MUST first become a published CharacterVersion under Chara ownership.

#### Scenario: Bind a Character to a World role

- **WHEN** an author binds a published CharacterVersion to a World role, initial location and Scenario policy
- **THEN** WorldActorBinding records the immutable CharacterVersion reference and World-specific binding without copying or mutating Character canon

#### Scenario: Reject a mutable or missing dependency

- **WHEN** publication encounters a mutable CharacterProject reference or a missing required Entity/Asset dependency
- **THEN** publication fails visibly instead of embedding an ambiguous snapshot or resolving by name

#### Scenario: Author needs a new NPC

- **WHEN** a World author requests a role for which no published CharacterVersion exists
- **THEN** World Studio provides an exact navigation/creation handoff to Character Studio and keeps the binding incomplete with a visible diagnostic
- **AND** World does not create a local CharacterProject, simplified NPC definition or hidden CharacterVersion

#### Scenario: Bound CharacterVersion is unavailable

- **WHEN** an existing WorldActorBinding cannot resolve its exact CharacterVersion
- **THEN** only that binding and dependent publication/run operations are unavailable with a repair target
- **AND** World does not substitute the latest CharacterVersion or make sibling bindings and Worlds unavailable

### Requirement: Interaction semantics are presentation-neutral

InteractionDefinition SHALL describe registered semantic actions, actor and target requirements, preconditions, visibility, resolution policy, effects and approval traits without encoding UI controls, renderer sessions, game-engine operations or provider-specific prompts.

#### Scenario: Render one interaction through different surfaces

- **WHEN** two presentation profiles expose the same registered interaction as free text and as a suggested action respectively
- **THEN** both surfaces produce the same typed WorldActionIntent contract for World runtime validation

### Requirement: AI-assisted authoring produces reviewable candidates

AI extraction, expansion and contradiction analysis SHALL create sourced authoring candidates and MUST NOT directly change accepted WorldProject facts or publish a new version.

#### Scenario: Extract a location from source content

- **WHEN** AI analysis identifies a possible location and relationship in an imported story document
- **THEN** the system records a candidate with source provenance and requires explicit accept, reject or merge before it becomes a WorldProject fact

### Requirement: Content-to-Experience compilation produces owner-qualified candidates

World authoring SHALL accept a creative intent plus durable source references and SHALL compile them into separate owner-qualified World/Scene, World Story/Quest, Character binding, World Gameplay/Interaction and Presentation candidates. Every candidate SHALL identify its source, target owner, exact authoring base, proposed semantic payload and capability requirements. The compiler MUST NOT own accepted facts, publish an Experience, create a Run or return one generic payload that can mutate multiple owners.

#### Scenario: Compile a screenplay into an interactive experience draft

- **WHEN** an author asks to turn a referenced screenplay into an interactive world
- **THEN** the compiler proposes sourced Scene, Story chapter/beat/conflict, Quest condition, Character role and Interaction candidates to their exact owners
- **AND** no proposal becomes accepted World, Story, Character or Gameplay state before the corresponding owner accepts it

#### Scenario: Compile Character material into an appearance binding

- **WHEN** source material describes a role and provides portrait, Voice, Live2D or VRM references
- **THEN** the compiler proposes an exact CharacterVersion handoff/binding plus World-specific appearance conditions and durable representation references
- **AND** it does not create a simplified World-local Character, select the latest CharacterVersion or copy representation bytes

#### Scenario: Compile a gameplay description into interactions

- **WHEN** an author describes goals, actions, resources, failure conditions and player guidance in natural language
- **THEN** the compiler proposes WorldGameplay goals/rules/results and presentation-neutral registered InteractionDefinitions with projected affordances
- **AND** explanatory prose alone is not treated as an executable handler or successful gameplay path

### Requirement: Compilation exposes semantic diff and capability gaps

Before an author accepts a compiled candidate, World Studio SHALL show the exact semantic additions, removals and replacements against its owning base plus every required action, owner, adapter, provider or presentation capability. Missing or ambiguous capabilities SHALL produce fail-visible `CapabilityGapDiagnostic` records and MUST NOT be satisfied by generated arbitrary code, wildcard handlers, first-compatible adapters, model text or no-op success.

#### Scenario: Imported mechanic requires an unavailable action

- **WHEN** a gameplay document requires `adjust-temperature` but the target Experience has no exact registered action capability
- **THEN** compilation keeps the Gameplay/Interaction candidate reviewable, reports the missing action identity and blocks only its executable acceptance/publication path
- **AND** valid World/Story candidates and existing Worlds remain available

#### Scenario: Author accepts a supported subset

- **WHEN** one compilation contains valid Scene candidates and a Gameplay candidate with a capability gap
- **THEN** the author may accept the Scene candidates through World Definition while the Gameplay candidate remains unresolved
- **AND** the system does not report the complete Experience as runnable until every required capability is satisfied

### Requirement: Creative materials compile into grounding and constraints

Story documents, images, video, audio, Character material and other creative sources SHALL be treated as authoring evidence, runtime grounding or presentation references; publication SHALL compile accepted semantics and stable source references through the owning World Definition, World Story, World Gameplay or Experience authoring service, and runtime context MUST NOT treat raw material, retrieval summaries or generated media as authoritative facts.

#### Scenario: Compile a story and reference images

- **WHEN** an author accepts World facts, Story constraints, Gameplay semantics and visual references extracted from source materials
- **THEN** each owning authoring aggregate records only its reviewed semantics and durable source references while keeping raw bytes under their owning Content or Asset service

#### Scenario: Retrieve grounding during a Scene

- **WHEN** runtime needs context for one participant in a Scene
- **THEN** Context Materializer selects only authorized, relevant reviewed grounding for the current WorldView rather than injecting all source material or promoting retrieval text to canon

### Requirement: World authoring is headless

Persistent WorldProject mutations SHALL be executable through a host-neutral authoring service without an active Renderer or World Webview, and reveal or preview SHALL be separate post-write behavior.

#### Scenario: Update a World project with no open surface

- **WHEN** an authorized caller applies a valid authoring operation to an explicit WorldProject target while no World Webview is open
- **THEN** the owning service commits the project revision and returns a durable result without creating a hidden Renderer

### Requirement: Creative tools remain artifact owners and authoring surfaces

Text/Screenplay, Canvas, Cut, Assets, Generation and Preview SHALL retain ownership of their documents, graphs, timelines, assets, Jobs and preview projections. A World Studio surface MAY invoke those tools and reference durable outputs, but accepting World, Story or Gameplay semantics MUST use the corresponding headless authoring service and MUST NOT make a tool document or UI state the authoritative World record.

#### Scenario: Author a World Story graph in Canvas

- **WHEN** an author edits a visual Story graph through a Canvas-based World Studio surface
- **THEN** Canvas owns the interaction document while accepted World Story semantics commit through the World Story authoring service
- **AND** closing, reloading or deleting the Canvas presentation snapshot does not delete or mutate the accepted WorldStoryProject

#### Scenario: Add a Cut timeline as a cinematic reference

- **WHEN** an author attaches a Cut timeline or rendered media to a WorldExperience entry point
- **THEN** the Experience stores a stable artifact reference and Cut retains timeline ownership
- **AND** the timeline does not become WorldEvent history, WorldStoryRun progress or a required runtime Generation path
