## ADDED Requirements

### Requirement: Workspace authority, authoring target, and tool composition remain separate

The system SHALL represent directory/root authorization as Workspace authority, the editable Content, Character, or World identity as an exact authoring target, and the visible editor/tool set as a replaceable Workbench composition. Workspace authority MUST NOT become the owner of Character, World, Content-document, Agent, or runtime facts, and a visible tool or active presentation MUST NOT be used to infer an authoring target.

#### Scenario: User opens a Character target in a Project Workspace

- **WHEN** the user selects an exact project-local CharacterProject inside an authorized Project Workspace
- **THEN** the Workbench composes the Chara-owned authoring surface and tools against that CharacterProject and Workspace authority
- **AND** neither the Workspace nor Desktop copies or interprets Character facts

#### Scenario: Visible target and authority do not match

- **WHEN** a target reference belongs to another Workspace authority or lacks its exact owning-domain record
- **THEN** only that target fails with an identity-qualified diagnostic
- **AND** the system does not use the visible editor, current Project, recent record, or another target as authority

### Requirement: Project-bound Creative Workspaces support mixed-domain authoring

A Project-bound Creative Workspace SHALL support zero or more Content artifacts, CharacterProject targets, and WorldProject targets without requiring a primary domain or mandatory Content target. Creating a project-local Character or World MUST use the canonical Chara or World contract, codec, application service, validation, publication, and diagnostic path. The Project composition SHALL own only target membership, placement, navigation metadata, exact dependency references, and typed output composition.

#### Scenario: Project author creates a local Character

- **WHEN** an author explicitly creates a Character from one exact Project-bound Creative Workspace
- **THEN** the Chara owner creates one canonical CharacterProject under the exact Workspace authority and the Project composition records its exact target reference
- **AND** no Project-owned Character shape, copied global record, CharacterRun, or implicit publication is created

#### Scenario: Project author creates a local World

- **WHEN** an author explicitly creates a World from one exact Project-bound Creative Workspace
- **THEN** the World owner creates one canonical WorldProject under the exact Workspace authority and the Project composition records its exact target reference
- **AND** no Project-owned World shape, WorldRun, WorldSave, or generic creative record is created

### Requirement: New mutable domain authoring is Project-scoped

Every newly created mutable CharacterProject and WorldProject SHALL use one exact Project-bound Creative Workspace and the single owning-domain contract, service, codec, publication behavior, and package-owned authoring Root. Existing standalone mutable records MAY remain readable only through an owner-qualified recovery catalog that disables new authoring and publication. Installed CharacterVersion and WorldVersion libraries SHALL remain immutable use/reference catalogs and MUST NOT become authoring roots.

#### Scenario: Project-local Character is edited

- **WHEN** an author opens one exact project-local CharacterProject
- **THEN** Chara uses the canonical service, codec, repository behavior, and authoring package Root under that Project authority
- **AND** no standalone authoring authority, implicit Project, or alternate repository is created

#### Scenario: Legacy standalone record is inspected

- **WHEN** an existing standalone CharacterProject or WorldProject is projected through recovery
- **THEN** the owner exposes its exact identity, diagnostic, export, move-to-Project, and delete eligibility
- **AND** recovery does not permit mutation, publication, Agent creation, or runtime launch from the mutable draft

#### Scenario: Canonical root is unavailable

- **WHEN** the exact authorized root for a CharacterProject or WorldProject cannot be resolved
- **THEN** the record remains visible in its owning scope with a relink or recovery diagnostic and authority-dependent operations disabled
- **AND** the system does not read a SQLite payload, global library copy, cache, active Workspace, or reconstructed empty record as a successful substitute

### Requirement: Project-local targets remain local until an explicit portability workflow

Project-local CharacterProject and WorldProject records SHALL be discoverable and manageable from their exact Project Workspace and SHALL NOT automatically appear as standalone library records. Closing a Workspace, removing its recent-Project registration, switching scenes, or unmounting its Workbench MUST NOT move, publish, promote, delete, or copy those records. Any future export, relocation, or promotion MUST be an explicit owning-domain operation that preserves the source until the destination commit succeeds.

#### Scenario: Project is removed from recent Projects

- **WHEN** the user removes a Project registration while preserving its directory
- **THEN** its project-local Character and World files remain unchanged and are no longer projected as standalone library items
- **AND** reopening the exact directory can reconstruct the Project-scoped catalog without fabricating new identities

#### Scenario: User opens the installed Character library

- **WHEN** the installed Character catalog is projected
- **THEN** it contains only exact immutable installed CharacterVersions and owner-qualified installation diagnostics
- **AND** project-local CharacterProjects and legacy mutable recovery records do not leak into that use catalog

### Requirement: Conversation and Creation share controlled Workbench composition

Desktop SHALL expose Conversation and Creation as the product-level intents. Creation SHALL select one exact Project and compose its mixed-domain management and authoring surfaces; Conversation MAY open subordinate installed Character/World management or delegate exact runtime launch without becoming a runtime owner. The controlled Workbench MAY share package-neutral search, sorting, empty-state, selection, and layout primitives, but each visible surface SHALL consume only its owning projection. The shared shell MUST NOT define a generic creative DTO, writable all-domain registry, combined destructive command, or direct standalone Character/World authoring destination.

#### Scenario: User opens a Project from Creation

- **WHEN** the user chooses one exact Project from Creation
- **THEN** Desktop composes that Project's generic Creative Workspace and owner-qualified target surfaces
- **AND** the previous Project Roots are unmounted without changing durable records or protected background runtimes

#### Scenario: User selects a World record

- **WHEN** the World management destination selects an exact WorldProject from its list or grid
- **THEN** the controlled Workbench keeps the World catalog in Main and mounts the World-owned configuration/detail Surface in Secondary Main
- **AND** no Character, Project, generic creative detail, or formal World runtime is inferred

#### Scenario: One catalog record is invalid

- **WHEN** one Character or World record cannot decode or resolve its authorized root
- **THEN** that record remains visible with an owner-qualified diagnostic and sibling records and domain catalogs remain usable
- **AND** Creative Management does not hide the record, clear the catalog, or replace it with a generic invalid item

### Requirement: Application navigation separates product intents from durable owner records

The expanded application sidebar SHALL expose Conversation and Creation as the primary product intents. Conversation MAY project lightweight exact Assistant Conversation, Character Dialogue, Room, World Run, or Save continuation rows supplied by their owning catalogs; Creation MAY project lightweight exact Project rows. The sidebar MUST NOT create a durable lifecycle from a CharacterProject, WorldProject, installed release, management selection, or navigation action merely to populate a section.

#### Scenario: Character conversations are projected

- **WHEN** Character Dialogue and Room Conversations exist in Agent Home projection
- **THEN** the sidebar groups them under Characters using their exact owner identities
- **AND** opening or deleting a row targets only that Conversation and does not open Character management or delete Character facts

#### Scenario: No World conversation exists

- **WHEN** no exact World-owned Agent Conversation is available
- **THEN** the Worlds navigation section remains visible with a zero count and empty presentation
- **AND** Desktop does not synthesize a World Conversation from WorldProject, WorldRun, WorldSave, or recent selection

### Requirement: Project composition references external publications without copying facts

A Project Workspace MAY bind exact independently published CharacterVersion and WorldExperienceVersion references in addition to project-local authoring targets. External published dependencies SHALL remain immutable and read-only in the Project Workbench. Editing from an external source MUST use an explicit `Adapt in Project` operation that creates a fresh project-local target while preserving the installed source, and publication MUST freeze exact dependency identities rather than resolve latest, active, name-matched, or first-compatible records.

#### Scenario: Project binds an independent Character

- **WHEN** an author adds an independently published CharacterVersion to a Project composition
- **THEN** the Project records the exact immutable CharacterVersion reference and exposes an owner-qualified source navigation action when available
- **AND** it does not copy CharacterDefinition or mutate an installed source from the Project Workspace

#### Scenario: External dependency becomes unavailable

- **WHEN** an exact CharacterVersion or WorldExperienceVersion dependency cannot be resolved
- **THEN** only the dependent composition entry and affected publication operation are unavailable with a repair target
- **AND** no latest version, local replacement, or empty definition is selected automatically

### Requirement: Authoring target changes replace visible domain Roots

Within one Window and visible Workbench slot, changing the selected Content, Character, or World authoring target SHALL save only the outgoing package-owned minimal presentation snapshot, unmount the outgoing domain Root, and mount the incoming target from its owning authority. Lightweight tabs, recent items, or tree rows MAY retain exact navigation references but MUST NOT retain hidden React Roots, subscriptions, providers, media handles, or domain runtimes.

#### Scenario: User switches from a screenplay to a Character

- **WHEN** the user activates a project-local Character target after editing a screenplay
- **THEN** the Content editor records its allowed presentation snapshot and unmounts before Character Studio mounts in the same Main slot
- **AND** the screenplay facts, Character facts, project composition, and protected background tasks keep their independent owners

#### Scenario: Target reconstruction fails

- **WHEN** the incoming owner cannot reconstruct its Surface from the exact target and current authoritative data
- **THEN** only that target surface shows a diagnostic while the Window Shell, Project tree, sibling targets, and background tasks remain available
- **AND** the outgoing hidden Root is not retained as a fallback

### Requirement: Agent authoring uses exact Workspace and target bindings

Agent-assisted authoring SHALL bind the exact Workspace authority and an exact owner-qualified authoring target before any target mutation. The Agent application MAY coordinate typed capabilities from multiple owners, but every write MUST name and validate its target through the owning application service. Prompt text, selected tree row, mounted Surface, current/recent Project, and model output MUST NOT grant or infer write authority.

#### Scenario: Agent edits a project-local World

- **WHEN** the user explicitly selects a project-local WorldProject as the Agent authoring target and submits an authoring request
- **THEN** the launch/context projection carries the exact Workspace and WorldProject identities and World tools submit typed candidates or operations to the World owner
- **AND** Content and Character facts remain unchanged unless separately targeted and accepted by their owners

#### Scenario: Agent request mentions another domain object

- **WHEN** a Content-targeted request mentions a Character or World that is not an authorized writable target
- **THEN** the object may be consumed only through its allowed read/reference projection
- **AND** the Agent cannot mutate it, rebind implicitly, or treat the mention as authority

### Requirement: Authoring tests and formal runtimes remain distinct

Content authoring SHALL produce previews and exports without creating a Content runtime. Character and World authoring MAY create owner-qualified authoring tests or deterministic previews, but formal Character Dialogue/Room and World Experience runtimes SHALL materialize only from exact eligible published versions through the owning runtime launch path. Authoring Workspace state, draft records, tests, previews, and presentation snapshots MUST NOT be accepted as formal runtime authority.

#### Scenario: Draft Character is tested in a Project Workspace

- **WHEN** the author starts a Character authoring test against a project-local unpublished CharacterProject
- **THEN** Chara records an exact authoring-test snapshot under the authoring lifecycle
- **AND** no formal Dialogue, Room, CharacterRun, relationship memory, or standalone library publication is created

#### Scenario: Published project-local World starts a formal experience

- **WHEN** the user explicitly launches an eligible project-local published WorldExperienceVersion
- **THEN** the World runtime creates or restores its exact Run and Save identities independently of the authoring Workbench
- **AND** unmounting or switching the authoring target does not cancel, redirect, or transfer that runtime
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Requirements below that authorize standalone mutable CharacterProject/WorldProject authoring or direct domain authoring destinations are superseded. Project-local authoring, exact external immutable references, owner boundaries, and failure isolation remain applicable.
