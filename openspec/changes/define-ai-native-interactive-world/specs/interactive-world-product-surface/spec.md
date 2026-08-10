## ADDED Requirements

### Requirement: Experimental World surfaces do not bypass roadmap promotion

The production Desktop SHALL keep World navigation and management unavailable until a later promotion change records real-user, repeated-behavior and end-to-end-loop evidence. Foundation packages, durable records, scene contracts and isolated UI fixtures MAY remain available for experimentation, but MUST NOT make the production World route successful.

#### Scenario: User opens World navigation before promotion

- **WHEN** a user invokes World navigation from a production Desktop Window
- **THEN** Host returns an owner-qualified unavailable diagnostic and preserves the current scene
- **AND** no World Root is mounted and no World durable record is changed

#### Scenario: Desktop restores an old experimental World scene

- **WHEN** a Window contains a persisted World Management presentation
- **THEN** Host replaces only that presentation with a fresh canonical Agent Entry scene and reports a presentation-reset diagnostic
- **AND** World projects, versions, runs, saves, branches and protected background runtime remain unchanged

### Requirement: Desktop presents a World Library rather than a Game Hub

Desktop SHALL project installed and authored WorldExperienceVersions, recent Runs, Saves, branches, capability status and attention through a lightweight World Library integrated with the product shell; it SHALL NOT introduce game lobby, matchmaking, achievements or engine settings as core World concepts.

#### Scenario: Browse installed Worlds

- **WHEN** a user opens the World area from Desktop Home
- **THEN** the Library shows immutable user-managed work versions and continue/new-experience actions derived from owning World services

### Requirement: World Studio and World Runtime are independent from Character surfaces

Desktop SHALL expose World Studio/Library for World Definition, World Story, optional World Gameplay, Experience composition, creative-tool references, actor/story binding and publication, and World Runtime for independently managed WorldRun, WorldStoryRun, CharacterStorylineRun participation, optional WorldGameSession, Save, branch and replay operations. These surfaces SHALL be separate from Character Studio and Character Runtime. Character surfaces MAY show World-owned summaries and exact navigation targets, but SHALL NOT mount writable World editors; World surfaces SHALL NOT mount a Character authoring editor.

#### Scenario: User follows a linked Save from Character detail

- **WHEN** Character Studio shows a linked WorldSave/branch summary and the user chooses to manage it
- **THEN** Desktop navigates to the exact World Runtime identity and World owns every mutation
- **AND** Character Studio remains a read-only consumer of the refreshed summary

#### Scenario: User edits a bound Character

- **WHEN** a World author chooses to change Character canon for an actor binding
- **THEN** Desktop navigates to the exact CharacterProject in Character Studio and requires a new published CharacterVersion before rebinding
- **AND** World Studio does not edit the CharacterProject or silently rebind an existing WorldVersion

### Requirement: World Studio is a content-to-experience workbench

World Studio SHALL reuse the product Workbench Shell and shared UI foundations while presenting package-owned Sources, compilation candidates, World/Scene structure, Story/Quest, Character bindings, Gameplay/Interaction, Experience composition, capability diagnostics and Preview surfaces. It SHALL NOT reuse Workspace authority, keep hidden creative-tool Roots mounted, copy another tool's artifact facts or implement a package-local design system.

#### Scenario: Compile content inside World Studio

- **WHEN** an author references a screenplay, Character material, scene image and gameplay description and requests an interactive world
- **THEN** World Studio displays owner-qualified candidates, semantic diffs, capability gaps and exact handoffs to owning tools/services
- **AND** the author can accept supported candidates independently before publishing or previewing an Experience

#### Scenario: Leave World Studio

- **WHEN** Desktop navigates to another scene
- **THEN** the World Studio Root and visible tool surfaces unmount after storing only package-owned presentation snapshots
- **AND** durable source artifacts, accepted World records and protected background authoring tasks remain owned by their respective services

### Requirement: World Runtime exposes continuous transformation without becoming an editor authority

World Runtime SHALL allow an authorized user to propose changes, inspect owner-qualified semantic diffs and capability gaps, accept permitted current-branch changes and navigate structural changes to their owning review surfaces. The Runtime Renderer MUST NOT write authoring repositories, replace immutable baselines or claim cross-owner transformation success.

#### Scenario: Modify a running World from an idea

- **WHEN** an authorized author asks to add a location, quest and different visual profile while a Run is active
- **THEN** Runtime shows separate World structure, Story/Quest and Presentation candidates and preserves their exact Run/base/provenance identities
- **AND** each accepted change follows its owning event or authoring path while rejected/unavailable candidates leave the current Run usable

### Requirement: Work detail exposes readiness and immutable identity

The World work detail surface SHALL show title, author, exact version, premise, cast, associated World/Character Stories, optional Gameplay, entry points, required/optional capabilities, supported interaction/execution/presentation profiles, content policy, applicable qualification status, dependency status and related Saves without treating package metadata as mutable runtime state.

#### Scenario: Show a missing required capability

- **WHEN** an installed Experience lacks a required action, owner, adapter, AI capability, applicable qualification or immutable dependency
- **THEN** its detail surface shows an actionable unavailable diagnostic and disables Run creation

### Requirement: Launch asks only identity-changing choices

Starting an Experience SHALL require explicit selection or confirmation of entry point, participant stance, optional embodied Character, new or existing Save/branch and an author-supported interaction/execution/presentation profile whose required capabilities and applicable runtime qualifications are satisfied; ordinary launch MUST NOT require direct provider credential or model parameter selection.

#### Scenario: Start a new embodied Character experience

- **WHEN** a user selects a permitted embodied-character entry, Character binding and supported presentation profile
- **THEN** Desktop requests Run creation with those explicit identities and does not create a hidden Character Agent for the user-controlled actor

### Requirement: Execution and presentation profiles share semantic authority

Text/Conversation, Web/2D, Game Engine and generative World Model profiles plus character motion/voice and qualified realtime image, video or spatial presentation SHALL consume the same owner-qualified WorldView, Story/Game projections and typed intent contracts. No profile SHALL own parallel World, Story, Gameplay or Character facts or an asynchronous completion success path. No specific profile or consumption-time AI binding SHALL be mandatory for every World.

#### Scenario: Switch an optional presentation profile

- **WHEN** an author permits both supported text and illustrated-2D profiles and a user requests a profile change
- **THEN** the change occurs only through an explicit supported transition that preserves the same Run, branch, participant and World revision without silent fallback

#### Scenario: Game Engine commits a semantic effect

- **WHEN** a qualified Game Engine profile reports a low-level simulation result that could change persistent World or Gameplay state
- **THEN** the corresponding owner validates a typed candidate and commits its own event before the semantic effect appears in authoritative projections
- **AND** engine objects, scene handles and raw simulation snapshots do not become WorldSave facts

### Requirement: Settings are separated by ownership

Desktop system settings SHALL own provider bindings, credentials, language, privacy, accessibility and global presentation preferences; World Studio SHALL own published Story, World, Character binding, interaction, director, capability and presentation policies; Run setup SHALL own stance, entry and branch choices. User presentation preferences MUST NOT modify published semantics.

#### Scenario: Change subtitle size during a Run

- **WHEN** a user changes an accessibility or presentation preference
- **THEN** the Renderer updates its projection without producing a WorldEvent or altering the Experience package

#### Scenario: Request a semantic rule change

- **WHEN** a non-author user attempts to change a WorldRule through ordinary settings
- **THEN** the surface rejects the request or directs it to an authorized authoring/branch workflow

### Requirement: Renderer is a projection and intent adapter

World Webview SHALL render WorldView, character/presentation descriptors and event projections and SHALL translate user interaction into bound intents; it MUST NOT read project files, persist WorldSave, infer active run identity or directly mutate state.

#### Scenario: Renderer reloads during a Run

- **WHEN** the World Webview reloads
- **THEN** it reattaches using explicit run/view identity and a fresh authoritative snapshot without duplicating committed events or Agent turns

### Requirement: World Gameplay and external Game authority are distinct

An Experience-authored game with independent rules, turns, input validation, win/loss state or resource loops SHALL use the World Gameplay subcapability and its independent WorldGameSession owner. An external game SHALL retain its external Activity/Game owner. Both MAY compose exact Character Runtime and/or World Runtime identities, while World Webview only renders projections and submits typed intents.

#### Scenario: A 2D game combines Characters and a World

- **WHEN** an experience uses Character behavior and presentation together with World facts and game-specific rules
- **THEN** World Gameplay runtime owns the authored game rules and outcomes, Character Runtime owns character intelligence/presentation and World Runtime owns world facts/state
- **AND** failure of one presentation surface does not select a different owner or mutate sibling authorities

#### Scenario: A Character plays an external game

- **WHEN** an Experience binds a CharacterRun to a third-party or separately installed game
- **THEN** the external Game runtime owns game rules, state and results while Agent Play owns only planning/control
- **AND** the game is not copied into WorldGameplayDefinition or WorldSave

### Requirement: Complete WorldExperience remains unavailable until fully composed

Desktop SHALL keep the complete WorldExperience launch surface explicitly unavailable until all required Definition/Runtime, World Story, optional World Gameplay, Experience, persistence, profile producers, typed Desktop consumers and the required real Electron scenario are present. An empty view, mock repository or no-op handler MUST NOT mark the capability ready, while an incomplete Experience MUST NOT disable already valid Foundation records or unrelated capabilities.

#### Scenario: Package exists without Desktop composition

- **WHEN** World Foundation contracts exist but no complete Experience producer/consumer path is registered
- **THEN** Desktop returns an Experience-qualified unavailable diagnostic without creating an ExperienceRun or pretending the complete capability is ready
- **AND** existing valid World Foundation records remain accessible through their owning supported paths

### Requirement: World Agent entry uses a World-owned typed binding

An available World application SHALL provide exact WorldExperienceVersion or WorldRun, participant, stance, branch and participant-scoped WorldView through the canonical Agent launch binding port. Agent SHALL own only its Draft, Conversation, Turn and AI role scopes and MUST NOT infer World identity or commit World actions, events or state.

#### Scenario: World provider is absent

- **WHEN** Agent Entry or Desktop requests a World interaction before the World binding provider is composed
- **THEN** the target remains owner-qualified unavailable and no model-only World Conversation, Run or default Scene is created

#### Scenario: World provider is available

- **WHEN** the World owner supplies an exact qualified binding for a participant interaction
- **THEN** Agent attaches only the requested Conversation or AI role scope and returns proposals through the World intent boundary
- **AND** only World runtime can validate and commit resulting WorldEvents or state
