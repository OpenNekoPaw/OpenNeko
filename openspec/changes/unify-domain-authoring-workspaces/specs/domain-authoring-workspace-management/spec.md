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

### Requirement: Project Workspaces support project-local domain authoring

A Content Project Workspace SHALL support Content artifacts plus zero or more project-local CharacterProject and WorldProject authoring targets. Creating a project-local Character or World MUST use the canonical Chara or World contract, codec, application service, validation, publication, and diagnostic path. The Project composition SHALL own only target membership, placement, navigation metadata, and exact dependency references.

#### Scenario: Content author creates a local Character

- **WHEN** an author explicitly creates a Character from a Content Project Workspace
- **THEN** the Chara owner creates one canonical CharacterProject under the exact Workspace authority and the Project composition records its exact target reference
- **AND** no Project-owned Character shape, copied global record, CharacterRun, or implicit publication is created

#### Scenario: Content author creates a local World

- **WHEN** an author explicitly creates a World from a Content Project Workspace
- **THEN** the World owner creates one canonical WorldProject under the exact Workspace authority and the Project composition records its exact target reference
- **AND** no Project-owned World shape, WorldRun, WorldSave, or generic creative record is created

### Requirement: Standalone and project-local authoring use one domain path

Standalone Character and World authoring SHALL use library-managed authorized Workspace roots while project-local authoring SHALL use the exact Project Workspace root. Both placements MUST use the same owning-domain contract, service, codec, publication behavior, and package-owned Studio Root. Placement MAY select an explicit repository root adapter, but it MUST NOT select a different business implementation, schema, success semantic, or fallback persistence path.

#### Scenario: Standalone Character and project-local Character are edited

- **WHEN** an author opens one standalone CharacterProject and one project-local CharacterProject in separate visible authoring contexts
- **THEN** both are validated and mutated through the same Chara authoring service and Character Studio contract
- **AND** only their exact authorized roots and catalog projections differ

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

#### Scenario: User opens standalone Character management

- **WHEN** the standalone Character catalog is projected
- **THEN** it contains only records registered under standalone Character Workspace roots
- **AND** project-local Characters do not leak into the standalone catalog through a global scan or duplicate index

### Requirement: Domain management shares the Workbench shell without an in-page mode switch

Desktop SHALL expose direct Project, Character, and World destinations in the application sidebar. The destinations MAY share the controlled Workbench shell and package-neutral search, sorting, empty-state, selection, and layout primitives, but each destination SHALL consume only its owning projection and retain its own create, open, remove, publish, archive, diagnostic, and runtime-launch semantics. Once a domain destination is visible, it MUST NOT render a Project/Character/World mode switch. The shared shell MUST NOT define a generic creative DTO, writable all-domain registry, or combined destructive command.

#### Scenario: User opens a domain manager from the application sidebar

- **WHEN** the user chooses Projects, Characters, or Worlds from the application sidebar
- **THEN** Desktop navigates to the exact owner-qualified management scene and mounts only that package-owned catalog Root
- **AND** the destination contains no secondary cross-domain selector and the previous catalog Root is unmounted without changing durable records or background runtimes

#### Scenario: User selects a World record

- **WHEN** the World management destination selects an exact WorldProject from its list or grid
- **THEN** the controlled Workbench keeps the World catalog in Main and mounts the World-owned configuration/detail Surface in Secondary Main
- **AND** no Character, Project, generic creative detail, or formal World runtime is inferred

#### Scenario: One catalog record is invalid

- **WHEN** one Character or World record cannot decode or resolve its authorized root
- **THEN** that record remains visible with an owner-qualified diagnostic and sibling records and domain catalogs remain usable
- **AND** Creative Management does not hide the record, clear the catalog, or replace it with a generic invalid item

### Requirement: Application navigation separates Project, Conversation, Character, and World records

The expanded application sidebar SHALL expose lightweight Projects, Conversations, Characters, and Worlds sections. Project rows MAY contain their exact Workspace conversations, Assistant conversations SHALL remain in Conversations, Character Dialogue and Room conversations SHALL appear under Characters, and World conversations SHALL appear under Worlds only after an exact World-owned Agent Conversation exists. The sidebar MUST NOT create a Conversation from a CharacterProject, WorldProject, CharacterRun, Room, WorldRun, or management selection merely to populate a section.

#### Scenario: Character conversations are projected

- **WHEN** Character Dialogue and Room Conversations exist in Agent Home projection
- **THEN** the sidebar groups them under Characters using their exact owner identities
- **AND** opening or deleting a row targets only that Conversation and does not open Character management or delete Character facts

#### Scenario: No World conversation exists

- **WHEN** no exact World-owned Agent Conversation is available
- **THEN** the Worlds navigation section remains visible with a zero count and empty presentation
- **AND** Desktop does not synthesize a World Conversation from WorldProject, WorldRun, WorldSave, or recent selection

### Requirement: Project composition references external publications without copying facts

A Project Workspace MAY bind exact independently published CharacterVersion and WorldExperienceVersion references in addition to project-local authoring targets. External published dependencies SHALL remain immutable and read-only in the Project Workbench. Editing an external source MUST use an explicit navigation handoff to its owning Studio, and publication MUST freeze exact dependency identities rather than resolve latest, active, name-matched, or first-compatible records.

#### Scenario: Project binds an independent Character

- **WHEN** an author adds an independently published CharacterVersion to a Project composition
- **THEN** the Project records the exact immutable CharacterVersion reference and exposes an owner-qualified source navigation action when available
- **AND** it does not copy CharacterDefinition or mutate the CharacterProject from the Project Workspace

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
