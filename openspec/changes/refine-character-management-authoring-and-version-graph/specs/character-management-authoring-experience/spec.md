## ADDED Requirements

### Requirement: Character management, creation, authoring and interaction remain distinct

OpenNeko SHALL treat Character Management as a catalog/lifecycle destination, quick creation as a bounded operation, Character authoring as a Workspace capability for an exact mutable CharacterProject target and Character Interaction as a durable Conversation/Room runtime. Character authoring MUST reuse the canonical Workspace authoring lifecycle rather than create an independent Character Studio application, Workspace kind or controller. Character Management detail MUST NOT expose the complete mutable Character definition, Storyline editor or publication form, and Character Interaction MUST NOT use its mounted UI or transcript as Character authoring authority.

#### Scenario: User selects a Character in management

- **WHEN** the user selects one exact CharacterProject in the Character catalog
- **THEN** Secondary Main shows its identity, placement, draft state, local usable-version count and the primary Start Conversation/Edit actions
- **AND** creation methods are grouped under one Create Character entry while export and other secondary operations remain subordinate
- **AND** complete lineage, Storyline and reference inventory stay available in Workspace Character Authoring instead of appearing in the default management detail
- **AND** it does not mount the complete Character Studio editor or mutate Character facts

#### Scenario: User continues authoring

- **WHEN** the user invokes “Open Studio” for an exact CharacterProject
- **THEN** Desktop leaves the management detail composition, preserves the Workspace Board/empty primary Main, opens the exact directory-authorized Workspace authoring target and composes the Chara-owned Character surface in Secondary Main
- **AND** the management Root is not retained as a hidden authoring owner

### Requirement: Quick Character creation reuses the canonical Character Creator

Character Management SHALL offer explicit quick-generation, manual-authoring and import entry choices. Quick generation SHALL use a typed handoff to the canonical Agent Entry/Composer with the Agent-owned `character-creator` Skill activated, then reuse its operation-level destination chooser, exact fresh CharacterProject target and standard Tool approval. Character Management MUST NOT embed a second Composer/model configuration, implement a Chara provider/model route, require Character Studio to mount, infer active/recent Workspace authority, create a usable CharacterVersion, start a Conversation/Room or write Storyline/continuity/memory facts.

#### Scenario: User quickly creates a standalone Character

- **WHEN** the user chooses quick generation, enters a draft label and prompt, selects the standalone Character library and approves the exact draft operation
- **THEN** Chara creates and fills one fresh CharacterProject under the authorized library root and the Agent result exposes an explicit handoff to that exact Character Management detail or Studio
- **AND** no Content Project, Studio Root, CharacterVersion or runtime is created

#### Scenario: User quickly creates a project-local Character

- **WHEN** the user explicitly selects one authorized Content Project as the quick-generation destination
- **THEN** Chara creates the exact project-local CharacterProject and Project records the exact local membership through their existing canonical workflow
- **AND** the target does not appear in the standalone Character catalog or rebind the originating Agent Conversation

#### Scenario: User cancels quick generation

- **WHEN** the user cancels before exact destination authorization or fresh-target creation
- **THEN** no CharacterProject, Project membership, Tool approval, CharacterVersion or runtime record is created

### Requirement: Character authoring is a directory Workspace capability

Workspace Authoring SHALL compose the Chara-owned Character authoring surface when its exact AuthoringTarget is a CharacterProject. The capability SHALL consume the existing sender-bound Workspace grant, target-switch lifecycle, shared Workbench slots and exact CharacterProject authoring binding. A standalone Character SHALL use a Character-library-managed Workspace authority and a project-local Character SHALL use its Content Project Workspace authority; both SHALL use the same Chara contract, application service, file repository and surface. Renderer MUST NOT receive a raw root path, standalone authoring MUST NOT create or impersonate a Content Project, and Chara MUST NOT create an independent Workspace/controller.

#### Scenario: Standalone Character opens through Workspace Authoring

- **WHEN** Host authorizes the configured standalone Character library root and exact CharacterProject
- **THEN** Workspace Authoring mounts the Chara-owned Character surface through the canonical target bridge and reads/writes only the Chara-owned relative files below that root
- **AND** no current/recent Project, implicit directory picker or alternate global repository grants authority

#### Scenario: Project-local Character opens through the same capability

- **WHEN** Host authorizes one Content Project Workspace and Project verifies the exact local CharacterProject membership
- **THEN** the same Workspace authoring composition, Chara surface and application services operate on that target below the Project directory
- **AND** project composition retains membership only and does not own or copy Character facts

#### Scenario: Directory authority becomes invalid

- **WHEN** the exact Workspace grant, sender, root containment or CharacterProject binding is unavailable or mismatched
- **THEN** only that Workspace authoring target reports an explicit diagnostic and Character commands are disabled
- **AND** Desktop does not fall back to the standalone library, active Project, cached snapshot or another Character

### Requirement: Local usable versions do not imply remote publication

The product SHALL describe creation of an immutable CharacterVersion as creating or finalizing a local usable version. This operation SHALL NOT upload, share, synchronize, market-publish or otherwise expose Character data. Remote sharing, export and marketplace publication MUST remain separately named and separately authorized workflows.

#### Scenario: User finalizes a Character draft

- **WHEN** the user confirms “Create usable version” for a review-ready draft
- **THEN** Chara stores one immutable local CharacterVersion and presents its exact identity and lineage
- **AND** no network request, remote identity, sharing permission or service publication is created

#### Scenario: User wants to start a Conversation quickly

- **WHEN** the user invokes the explicitly labelled “Finalize and start Conversation” action
- **THEN** the UI first creates one exact local CharacterVersion and then launches Character Interaction with that exact version
- **AND** a launch failure preserves the already-created local version with a visible diagnostic rather than reporting a remote publication failure

### Requirement: Character placement and external references remain visible

Character Management and Studio SHALL visibly identify standalone and project-local placement. A Project SHALL distinguish editable local CharacterProjects from read-only dependencies on exact standalone CharacterVersions and SHALL provide explicit source-Studio handoff for a dependency. It MUST NOT flatten both placements into one writable catalog, auto-promote a project-local Character or auto-rebind an external dependency after a newer version is created.

#### Scenario: Project displays its Characters

- **WHEN** a Project contains one local CharacterProject and one external CharacterVersion dependency
- **THEN** the local record is labelled project-local and editable while the dependency is labelled external, exact-version and read-only
- **AND** editing the dependency opens its authorized source Studio instead of copying facts into the Project

#### Scenario: Standalone Character gains a new usable version

- **WHEN** a Project already references an older exact CharacterVersion and the standalone Character creates another branch or version
- **THEN** the Project keeps its existing exact reference until the user explicitly selects a replacement
- **AND** no latest-version resolution changes existing Project, Storyline, Conversation or Room facts
