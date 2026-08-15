## ADDED Requirements

### Requirement: Character installed-library management, Project authoring, and interaction remain distinct

OpenNeko SHALL treat installed Character library management as an immutable release catalog/lifecycle surface under Conversation, Character authoring as a Project-bound Creative Workspace capability for one exact mutable CharacterProject, and Character Interaction as a durable Dialogue/Room lifecycle. Installed-library management MUST NOT expose blank creation, mutable editing, finalization, an embedded Composer, provider/model controls, or management-owned Agent generation. Character Interaction MUST NOT use its mounted UI or transcript as Character authoring authority.

#### Scenario: User selects an installed Character

- **WHEN** the user selects one exact installed CharacterVersion
- **THEN** the owner detail shows identity, provenance, eligibility, dependency, usage, adaptation, export, and uninstall diagnostics
- **AND** it does not mount a mutable Character editor or create a CharacterProject, Conversation, or Room

#### Scenario: User opens a project-local Character

- **WHEN** one exact Project management panel selects a CharacterProject and Host validates its Project-bound Workspace authority
- **THEN** Desktop composes the Chara-owned authoring surface in the declared Creative Workspace slot
- **AND** installed-library management is not retained as a hidden authoring owner

### Requirement: Character creation is Project-bound and owner-qualified

Direct manual Character creation SHALL originate only from one exact Project management panel. Agent-assisted Character creation SHALL operate only inside an exactly bound Project Creative Workspace through the canonical Agent Composer, `character-creator` Skill, one fresh Chara target receipt, and standard Tool approval. Both paths SHALL commit through the same Chara application service and MUST NOT create a standalone mutable target, infer an active/recent Project, publish a CharacterVersion, or start a Dialogue/Room as a side effect.

#### Scenario: User manually creates a Character

- **WHEN** the user chooses `New Character` from one exact Project management panel
- **THEN** Chara creates one fresh CharacterProject under that Project authority and returns its exact target identity
- **AND** no installed release, CharacterVersion, Dialogue, Room, or implicit Agent Conversation is created

#### Scenario: Project Agent creates a simplified Character draft

- **WHEN** an Agent in an exact Project Creative Workspace activates `character-creator` and the user approves the fresh-target operation
- **THEN** Chara validates and commits one ordinary project-local CharacterProject with its actual completeness diagnostics
- **AND** no second Character schema, standalone destination, usable version, or runtime lifecycle is created

### Requirement: Local usable versions do not imply remote publication

Creating an immutable CharacterVersion SHALL mean finalizing a local usable version. This operation SHALL NOT upload, share, synchronize, market-publish, start a Dialogue/Room, or mutate an installed release. Remote sharing, export, and runtime launch MUST remain separately named and authorized workflows.

#### Scenario: User finalizes a Character draft

- **WHEN** one exact project-local draft passes Chara validation and the user confirms local finalization
- **THEN** Chara stores one immutable CharacterVersion and presents its exact identity and lineage
- **AND** no network request, runtime, Project replacement, or installed-library mutation occurs

### Requirement: Project-local and installed Character placement remains visible

Project management SHALL distinguish editable project-local CharacterProjects from read-only dependencies on exact installed CharacterVersions. Installed sources SHALL expose `Adapt in Project` rather than direct editing. Existing legacy standalone mutable records SHALL remain visible only through recovery with explicit move-to-Project, export, delete, and repair diagnostics. No newer version, name match, active card, or provenance link may automatically rebind an existing Project, Conversation, or Room.

#### Scenario: Project displays local and installed Characters

- **WHEN** a Project contains one local CharacterProject and one exact installed CharacterVersion dependency
- **THEN** the local record is labelled project-local and editable while the dependency is labelled installed, exact-version, and read-only
- **AND** adapting the dependency creates a fresh target only after an explicit destination preview and confirmation

<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-15):** This capability now retains Character owner semantics while delegating Project-only mutable creation, installed immutable libraries, adaptation, recovery, and Conversation/Creation navigation to the successor.
