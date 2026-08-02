## ADDED Requirements

### Requirement: Desktop presents a World Library rather than a Game Hub
Desktop SHALL project installed and authored WorldExperienceVersions, recent Runs, Saves, branches, capability status and attention through a lightweight World Library integrated with the product shell; it SHALL NOT introduce game lobby, matchmaking, achievements or engine settings as core World concepts.

#### Scenario: Browse installed Worlds
- **WHEN** a user opens the World area from Desktop Home
- **THEN** the Library shows versioned works and continue/new-experience actions derived from owning World services

### Requirement: Work detail exposes readiness and immutable identity
The World work detail surface SHALL show title, author, exact version, premise, cast, entry points, realtime presentation profiles, content policy, required realtime AI contract, qualification status, dependency status and related Saves without treating package metadata as mutable runtime state.

#### Scenario: Show a missing required capability
- **WHEN** an installed Experience lacks a required AI capability, realtime qualification or immutable dependency
- **THEN** its detail surface shows an actionable unavailable diagnostic and disables Run creation

### Requirement: Launch asks only identity-changing choices
Starting an Experience SHALL require explicit selection or confirmation of entry point, participant stance, optional embodied Character, new or existing Save/branch and an author-supported realtime presentation profile whose required AI bindings have passed target-environment qualification; ordinary launch MUST NOT require direct provider credential or model parameter selection.

#### Scenario: Start a new embodied Character experience
- **WHEN** a user selects a permitted embodied-character entry, Character binding and supported presentation profile
- **THEN** Desktop requests Run creation with those explicit identities and does not create a hidden Character Agent for the user-controlled actor

### Requirement: Realtime presentation profiles share one WorldView contract
Streaming text, illustrated 2D composition, character motion/voice and any qualified realtime image, video or spatial presentation SHALL consume the same participant-scoped WorldView and submit the same typed intent contract; no profile SHALL own a parallel World state, asynchronous completion path or inference-free World mode.

#### Scenario: Switch an optional presentation profile
- **WHEN** an author permits both qualified streaming-text and illustrated-2D realtime profiles and a user requests a profile change
- **THEN** the change occurs only through an explicit supported transition that preserves the same Run, branch, participant and World revision without silent fallback

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

### Requirement: World remains unavailable until fully composed
Desktop SHALL keep the World surface explicitly unavailable until package-owned authoring/runtime/persistence producers, typed Desktop consumers and the required real Electron scenario are present; an empty view, mock repository or no-op handler MUST NOT mark the capability ready.

#### Scenario: Package exists without Desktop composition
- **WHEN** World contracts or a retained kernel exist but no real Desktop producer/consumer path is registered
- **THEN** Desktop continues to return the World unavailable diagnostic without creating a project, tab, Run or Save
