## ADDED Requirements

### Requirement: WorldExperienceProject is an authoring composition

The World Experience capability SHALL provide a revision-controlled `WorldExperienceProject` that associates exact WorldVersion, WorldStoryVersion, CharacterVersion, CharacterStorylineVersion and optional WorldGameplayDefinition references with role/seat mappings, entry points, interaction/director policies, required/optional capability requirements and interaction/execution/presentation profiles. It SHALL NOT copy or mutate the referenced owners' definitions.

#### Scenario: Associate Character and World stories during creation

- **WHEN** an author assigns a published CharacterStorylineVersion to a role in a WorldStoryVersion
- **THEN** the Experience project records exact immutable references, role mapping and synchronization policy
- **AND** neither Story project receives runtime progress or a copied definition

### Requirement: WorldExperienceVersion is the publishable user work

The World Experience capability SHALL publish an immutable user-managed `WorldExperienceVersion` from an accepted WorldExperienceProject composition, including its exact immutable dependency metadata.

#### Scenario: Publish a complete interactive World experience

- **WHEN** an author publishes a valid Experience composition with all required immutable dependencies resolved
- **THEN** the World owner creates a new immutable WorldExperienceVersion identity that can be installed and instantiated independently of the authoring project

### Requirement: Publication locks durable dependencies

WorldExperienceVersion SHALL pin every required World, World Story, Character, Character Story, World Gameplay, Entity, Asset, Content and policy dependency by stable immutable identity and revision or digest; publication MUST reject mutable, name-only, absolute-path, cache, runtime URL or unresolved references.

#### Scenario: Lock an Asset representation dependency

- **WHEN** a presentation profile uses a managed Asset package resource
- **THEN** the published dependency identifies the exact package revision or digest and member rather than the current installed head

#### Scenario: Reject a local runtime reference

- **WHEN** a publication input contains a renderer URL, temporary file, runtime handle or absolute user path
- **THEN** publication fails with a diagnostic identifying the unsafe dependency

### Requirement: Experience capabilities are explicit, composable and provider-neutral

Every WorldExperienceVersion SHALL declare exact required and optional capabilities for interaction, deterministic actions, Agent/AI roles, execution and presentation without storing credentials or requiring named provider implementations. Publication SHALL require at least one Interaction Surface capable of consuming the authoritative projection and submitting typed intents, but SHALL NOT require consumption-time AI, Web, a Game Engine, a World Model or custom code when the authored interaction can run without them.

#### Scenario: Resolve required capabilities at launch

- **WHEN** a user launches an Experience whose required deterministic, interaction, AI, execution and presentation capabilities can be satisfied
- **THEN** the Host resolves exact effective bindings and records receipts only for capabilities that require runtime qualification without modifying the published package

#### Scenario: Missing required capability

- **WHEN** an exact required action, owner, adapter, AI provider or Presentation capability is unavailable or unqualified
- **THEN** launch remains unavailable with an actionable capability diagnostic and MUST NOT silently select another handler, purpose, model, adapter or profile

#### Scenario: Publish a deterministic content-compiled World

- **WHEN** an accepted Experience declares registered deterministic interactions and a supported Interaction Surface but no consumption-time AI capability
- **THEN** World publication accepts it as an interactive WorldExperienceVersion and launch does not request a model/provider binding

#### Scenario: Optional AI capability is unavailable

- **WHEN** an Experience can run deterministically but declares an optional Narrator or Character Agent capability that is unavailable
- **THEN** the owning detail/launch surface reports the optional capability gap and preserves the deterministic canonical path
- **AND** it does not fabricate AI output or silently bind another provider

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

### Requirement: Runtime participation binding is separate from authoring composition

Starting an Experience SHALL create a `WorldExperienceRun` binding that references exact WorldRun, WorldStoryRun, participant, CharacterRun and CharacterStorylineRun identities plus an optional WorldGameSession and execution/presentation binding. The ExperienceRun SHALL coordinate participation and projection only; each referenced owner SHALL retain its own lifecycle, state, progress, persistence and failure semantics.

#### Scenario: Start a composed Character and World experience

- **WHEN** a user starts an Experience that associates one Character Story, one World Story and an authored Gameplay definition
- **THEN** runtime creates or selects explicit owner-qualified Runs/Sessions and records their exact bindings in WorldExperienceRun
- **AND** it does not create one shared story progress, state, save, transcript or lifecycle record

#### Scenario: Character Story ends before the World Story

- **WHEN** a bound CharacterStorylineRun reaches its ending while WorldStoryRun and WorldRun remain active
- **THEN** the Character Story binding becomes completed while permitted World interaction and World Story progression continue
- **AND** ExperienceRun does not force all bound Runs to share the completed lifecycle

### Requirement: Authoring updates do not redirect running Experiences

Changing a WorldExperienceProject or publishing a newer WorldExperienceVersion SHALL NOT mutate the exact Story, Character, Gameplay, Run, Save, Branch or Session bindings of an existing WorldExperienceRun.

#### Scenario: Rebind a Character Story in authoring

- **WHEN** an author publishes a new Experience version with a different CharacterStorylineVersion
- **THEN** existing ExperienceRuns continue with their pinned CharacterStorylineRun and Experience baseline
- **AND** only a new Run or explicit user-visible upgrade operation can use the new composition

### Requirement: Version updates preserve existing Saves

Publishing or installing a newer WorldExperienceVersion MUST NOT rewrite or compat-read a Save bound to another version. Any supported upgrade SHALL be an explicit, reviewable and rejectable user operation that validates the target immutable version, creates a new Save/branch identity and preserves the source Save.

#### Scenario: Open a Save after a newer Experience is installed

- **WHEN** a Save references an older installed WorldExperienceVersion and a newer version is available
- **THEN** the system continues with the pinned version or offers an explicit owning-domain upgrade that preserves the source Save instead of silently rebasing it
