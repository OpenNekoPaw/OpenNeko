## ADDED Requirements

### Requirement: WorldExperienceVersion is the publishable user work
The World domain SHALL publish an immutable `WorldExperienceVersion` that composes an exact WorldVersion, Story Scenario, Character bindings, entry points, interaction and director policies, presentation profiles, AI capability requirements and versioned dependency metadata.

#### Scenario: Publish a complete interactive World experience
- **WHEN** an author publishes a valid Experience composition with all required immutable dependencies resolved
- **THEN** the World owner creates a versioned WorldExperienceVersion that can be installed and instantiated independently of the authoring project

### Requirement: Publication locks durable dependencies
WorldExperienceVersion SHALL pin every required Character, Entity, Asset, Content and policy dependency by stable immutable identity and revision or digest; publication MUST reject mutable, name-only, absolute-path, cache, runtime URL or unresolved references.

#### Scenario: Lock an Asset representation dependency
- **WHEN** a presentation profile uses a managed Asset package resource
- **THEN** the published dependency identifies the exact package revision or digest and member rather than the current installed head

#### Scenario: Reject a local runtime reference
- **WHEN** a publication input contains a renderer URL, temporary file, runtime handle or absolute user path
- **THEN** publication fails with a diagnostic identifying the unsafe dependency

### Requirement: Realtime AI requirements are mandatory and provider-neutral
Every WorldExperienceVersion SHALL declare a non-empty required realtime AI contract covering intent understanding, Character or World generation and a user-consumable realtime narration or presentation path, plus any optional realtime modalities and quality constraints, without storing a provider credential or requiring a named model implementation. A work that can generate all new interaction without consumption-time AI MUST NOT be published as a Neko World Experience.

#### Scenario: Resolve required capabilities at launch
- **WHEN** a user launches an Experience whose required realtime AI contract can be satisfied and qualified by configured local or external providers
- **THEN** the Host resolves an effective binding and the Run records the exact binding and realtime qualification receipt without modifying the published package

#### Scenario: Missing required AI capability
- **WHEN** no configured provider satisfies or qualifies for the required realtime AI contract
- **THEN** launch remains unavailable with an actionable diagnostic and MUST NOT silently select another purpose or model

#### Scenario: Reject an inference-free interactive work
- **WHEN** a publication declares no required consumption-time AI capability and contains only fixed or deterministic interactions
- **THEN** World publication rejects it as a Neko World Experience and directs the artifact to the traditional Content or interactive-work boundary

### Requirement: Published work excludes user and runtime state
WorldExperienceVersion MUST NOT contain WorldSave events, user relationship memory, Agent transcript, credentials, local settings, current Run state, model hidden state, cache entries or UI selection.

#### Scenario: Publish after previewing an Experience
- **WHEN** an author publishes after running preview sessions and creating local branches
- **THEN** the package contains only accepted definitions and immutable dependencies, while preview Runs and Saves remain separate

### Requirement: Installation and instantiation are separate
Installing a WorldExperienceVersion SHALL register the immutable work and validate dependencies but SHALL NOT create a user WorldSave; starting or continuing an Experience SHALL explicitly create or select a Run and Save.

#### Scenario: Install without entering the World
- **WHEN** a user installs a valid WorldExperienceVersion
- **THEN** it appears in World Library without creating participant identities, a Run, a branch or a save history

### Requirement: Version updates preserve existing Saves
Publishing or installing a newer WorldExperienceVersion MUST NOT rewrite a Save bound to an older version; compatible migration SHALL be explicit, versioned, reviewable and rejectable.

#### Scenario: Open a Save after a newer Experience is installed
- **WHEN** a Save references an older installed WorldExperienceVersion and a newer version is available
- **THEN** the system continues with the pinned version or offers an explicit compatible migration instead of silently rebasing the Save
