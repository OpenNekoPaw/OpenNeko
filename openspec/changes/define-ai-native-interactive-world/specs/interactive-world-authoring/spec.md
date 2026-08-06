## ADDED Requirements

### Requirement: Canonical interactive World aggregate

The World domain SHALL provide a versioned `WorldProject` aggregate that owns WorldDefinition, semantic SceneDefinition, StoryScenarioDefinition, WorldCharacterBinding, InteractionDefinition and WorldRule facts, and SHALL publish an immutable `WorldVersion` without runtime state or Host handles.

#### Scenario: Publish a valid World project

- **WHEN** an author publishes a valid WorldProject at its expected revision
- **THEN** the World owner produces an immutable WorldVersion containing the accepted definitions and their stable source identities

#### Scenario: Reject an invalid World project

- **WHEN** a WorldProject contains an unknown technical field, unresolved required identity or unsafe runtime value
- **THEN** publication fails with a typed diagnostic and no WorldVersion is created

### Requirement: Story intent is distinct from committed history

StoryScenarioDefinition SHALL represent premise, tension, possible beats, triggers, clues, escalation, endings and hard or soft constraints as authoring intent; a planned beat or AI suggestion MUST NOT be represented as a committed WorldEvent.

#### Scenario: Preserve an untriggered story beat

- **WHEN** a WorldVersion contains a possible story beat whose trigger has not been satisfied in a Run
- **THEN** the beat remains an opportunity and the current branch history does not report it as having happened

### Requirement: World references Character and Entity authorities

WorldProject SHALL reference published CharacterVersion and stable Entity or Asset identities through explicit bindings and SHALL NOT duplicate Character canon, mutable Project Entity authority or representation bytes.

#### Scenario: Bind a Character to a World role

- **WHEN** an author binds a published CharacterVersion to a World role, initial location and Scenario policy
- **THEN** WorldCharacterBinding records the immutable CharacterVersion reference and World-specific binding without copying or mutating Character canon

#### Scenario: Reject a mutable or missing dependency

- **WHEN** publication encounters a mutable CharacterProject reference or a missing required Entity/Asset dependency
- **THEN** publication fails visibly instead of embedding an ambiguous snapshot or resolving by name

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

### Requirement: Creative materials compile into grounding and constraints

Story documents, images, video, audio, Character material and other creative sources SHALL be treated as authoring evidence, runtime grounding or presentation references; publication SHALL compile accepted semantics and stable source references, and runtime context MUST NOT treat raw material, retrieval summaries or generated media as authoritative World facts.

#### Scenario: Compile a story and reference images

- **WHEN** an author accepts facts, Story constraints and visual references extracted from source materials
- **THEN** WorldProject records reviewed structured semantics and durable source references while keeping raw bytes under their owning Content or Asset service

#### Scenario: Retrieve grounding during a Scene

- **WHEN** runtime needs context for one participant in a Scene
- **THEN** Context Materializer selects only authorized, relevant reviewed grounding for the current WorldView rather than injecting all source material or promoting retrieval text to canon

### Requirement: World authoring is headless

Persistent WorldProject mutations SHALL be executable through a host-neutral authoring service without an active Renderer or World Webview, and reveal or preview SHALL be separate post-write behavior.

#### Scenario: Update a World project with no open surface

- **WHEN** an authorized caller applies a valid authoring operation to an explicit WorldProject target while no World Webview is open
- **THEN** the owning service commits the project revision and returns a durable result without creating a hidden Renderer
