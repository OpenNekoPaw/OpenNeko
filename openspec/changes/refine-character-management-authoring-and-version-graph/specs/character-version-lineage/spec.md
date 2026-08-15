## ADDED Requirements

### Requirement: CharacterVersion lineage is an explicit user domain graph

Chara SHALL own explicit lineage relationships among immutable CharacterVersions belonging to one CharacterProject. Each declared relationship SHALL identify one child and zero or one exact parent CharacterVersion identity; zero parents represents a declared root, one parent represents ordinary derivation and multiple children of one parent represent branches. The first-phase codec and command path MUST reject multiple parents because no merge workflow or consumer exists. Time, label, file order, current draft, mounted UI and “latest” selection MUST NOT infer lineage.

#### Scenario: Imported relationship declares multiple parents

- **WHEN** an imported or local lineage relationship declares more than one parent CharacterVersion
- **THEN** Chara rejects only that relationship with an explicit unsupported-merge diagnostic
- **AND** it does not persist write-only merge data or hide valid sibling versions

#### Scenario: Two versions branch from one parent

- **WHEN** the user creates two usable versions from the same exact parent CharacterVersion
- **THEN** the lineage graph contains two exact child relationships and projects both as branch heads until another declared child extends either branch
- **AND** neither branch is treated as globally newer or authoritative by timestamp

#### Scenario: A relationship names another CharacterProject

- **WHEN** a lineage command names a parent or child owned by a different CharacterProject
- **THEN** Chara rejects only that relationship with an owner-qualified diagnostic
- **AND** all valid versions and sibling relationships remain available

### Requirement: One working draft records its explicit version basis

Each CharacterProject SHALL retain at most one authoritative working draft. The draft SHALL either be unbased or identify the exact CharacterVersion from which the user explicitly continued authoring. Continuing from a historical version SHALL replace the working draft only after the user resolves unsaved changes, and the next usable version SHALL declare the selected basis as its parent. The first phase MUST NOT create multiple hidden branch drafts or infer the basis from the most recently viewed version.

#### Scenario: User continues from a historical version

- **WHEN** the user selects “Continue authoring from this version” and confirms replacement of the current working draft
- **THEN** Chara copies that immutable definition into the one working draft and records that exact CharacterVersion as its basis
- **AND** the historical version remains immutable and existing Conversations, Storylines and dependencies remain unchanged

#### Scenario: User has unresolved draft edits

- **WHEN** the user attempts to continue from another version while the current draft has unsaved or unfinalized changes
- **THEN** the Studio requires an explicit save, finalize or discard decision before changing the draft basis
- **AND** it does not preserve a hidden second working draft or silently overwrite the current draft

### Requirement: Version graph and comparison are reconstructable read models

Chara SHALL project a read-only version graph from authoritative CharacterVersions and lineage relationships, including declared roots, branch heads, unlinked versions, current draft basis and exact reference counts. Character Studio SHALL provide graph/list views and field-grouped comparison for identity, background/origin, canon, knowledge, behavior, expression, representation, voice and accepted evidence. The projection and comparison MUST NOT mutate facts or become lineage authority.

#### Scenario: User compares two branches

- **WHEN** the user selects two CharacterVersions from different branches
- **THEN** Studio shows additions, removals and changes grouped by Character definition responsibility plus their exact lineage paths and references
- **AND** applying any selected difference creates a reviewable draft candidate or explicit draft command rather than rewriting either version

#### Scenario: One lineage record is invalid

- **WHEN** one relationship references a missing version or creates a directed cycle
- **THEN** the graph excludes that invalid relationship, keeps the involved versions visible with a local diagnostic and renders valid sibling branches
- **AND** it does not repair the edge, hide the CharacterProject or fail the Window Shell

### Requirement: Exact consumers never resolve a branch head implicitly

Character Dialogue, Room, CharacterStorylineVersion, Companion memory provenance and Project dependencies SHALL continue to reference one exact CharacterVersion identity. If multiple branch heads exist, launch and binding UI SHALL require an exact visible selection or a separately user-managed preferred identity; runtime MUST NOT resolve a version using newest time, branch label, graph position, active Studio target or current draft.

#### Scenario: User starts Narrative with multiple heads

- **WHEN** a CharacterProject has two available branch heads and the user starts a Narrative Conversation
- **THEN** launch shows both exact CharacterVersions and freezes the explicitly selected one before the first turn
- **AND** the Storyline node must belong to a StorylineVersion pinned to that same CharacterVersion

#### Scenario: A new branch is created after launch

- **WHEN** an existing Conversation is bound to one CharacterVersion and Studio later creates another branch head
- **THEN** reopening or compacting the Conversation rematerializes its original exact CharacterVersion
- **AND** it does not switch to the new branch or reinterpret previous messages

### Requirement: Referenced and historical versions remain protected

Chara SHALL expose exact inbound references from Conversations, Rooms, StorylineVersions, Companion memory provenance and Project dependencies before destructive version operations. A referenced CharacterVersion MUST NOT be silently deleted, rewritten or replaced. Removing an unreferenced version SHALL also remove only lineage relationships owned by that version while preserving siblings and the working draft unless the user explicitly changes its basis.

#### Scenario: User tries to delete a referenced version

- **WHEN** a CharacterVersion is referenced by any durable exact consumer
- **THEN** the delete operation is blocked with the owner-qualified reference inventory or offers only an explicit archive/hide action that preserves the version
- **AND** no dependent record is automatically rebound or deleted

### Requirement: Existing versions without lineage remain usable and visibly unlinked

An existing or imported CharacterVersion with no declared lineage relationship SHALL remain a valid immutable version and SHALL appear as an unlinked node with an explicit “source not declared” state. Chara MUST NOT synthesize parent relationships from timestamps, labels, file locations, publication order or similarity analysis. Users MAY explicitly declare a root or exact parent relationship without changing the immutable Character definition.

#### Scenario: Catalog loads pre-lineage publications

- **WHEN** a CharacterProject contains existing valid CharacterVersions but no lineage authority record
- **THEN** every version remains visible, selectable and usable while the graph labels it unlinked
- **AND** no migration, compatibility dispatcher or implicit chronological edge is used as a successful relationship source

### Requirement: Version lineage, Storyline graph and Conversation branching stay separate

The product SHALL render CharacterVersion lineage, CharacterStoryline node relationships and Agent Conversation branches as separately owned projections. A CharacterVersion edge MUST NOT represent Storyline progress or message ancestry, and a Storyline/Conversation action MUST NOT mutate CharacterVersion lineage.

#### Scenario: Narrative follows another Storyline edge

- **WHEN** a Narrative Conversation discusses or inspects a different Storyline node
- **THEN** only the explicit new-Conversation or Storyline authoring workflow may select another node
- **AND** no CharacterVersion child, branch head or lineage edge is created
