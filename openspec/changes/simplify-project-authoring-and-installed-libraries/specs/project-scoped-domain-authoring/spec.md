## ADDED Requirements

### Requirement: Every Project provides one mixed-domain Creative Workspace

A Creative Workspace SHALL bind one exact Project and list zero or more owner-qualified Content targets, local editable Character/World objects and read-only global Character/World exact-version references together. Project SHALL own membership and navigation metadata only; Content, Chara and World SHALL retain fact, mutation, validation, version and synchronization authority. The Project MUST NOT declare a primary domain or require Content.

#### Scenario: Project contains mixed local and global objects

- **WHEN** one Project contains Content documents, local Characters, a global Character reference and a global World reference
- **THEN** one Workspace list presents all valid owner-qualified entries with clear local/read-only placement
- **AND** it does not flatten their facts into a generic object or create separate domain Workspaces

#### Scenario: One workspace member is invalid

- **WHEN** one Character row cannot be resolved while sibling Content and World rows remain valid
- **THEN** Project preserves the invalid row with a local diagnostic and disables only dependent actions
- **AND** sibling objects and unrelated Projects remain usable

### Requirement: New editable Character and World objects are Project-scoped

Every newly created editable Character or World SHALL belong to one exact Project Workspace from its first durable commit. Manual and Agent-assisted mutation SHALL use the same owner application service and exact Project/object authority. The system MUST NOT create an unassigned draft, standalone mutable library, hidden default Project or active/recent Project fallback.

#### Scenario: Project Agent creates a Character

- **WHEN** an Agent with one exact Project context receives approval to create a Character
- **THEN** Chara creates one ordinary local editable Character in that Project Workspace
- **AND** it does not create a global version, Dialogue, installation or implicit synchronization

#### Scenario: Creation lacks Project authority

- **WHEN** a manual or Agent creation request lacks one exact authorized Project Workspace
- **THEN** the owner rejects it before writing any Character or World facts
- **AND** it does not use a recent Window, global catalog or generated default authority

### Requirement: Workspace exposes only minimal reuse actions

For Character and World entries, the Project Workspace SHALL expose only actions qualified by placement: create local, add an exact global reference, copy global to local, synchronize local to global, update an exact reference, remove from Project, and ZIP export where valid. It MUST NOT expose install, adapt, recover, finalize-for-installation, publication-plan or automatic dependency replacement workflows.

#### Scenario: User selects a global object from Workspace

- **WHEN** the user confirms one exact global Character or World version
- **THEN** Project adds it to the current Workspace as a read-only reference
- **AND** selection does not navigate away from the Workspace or create a local copy

### Requirement: Character and World sharing is owner-local synchronization

Synchronizing a local Character or World SHALL delegate to its domain owner and return an exact global object/version receipt for Project projection. Project MUST NOT compose Character and World outputs into a publication plan, copy owner facts, select a current version or decide conflict resolution.

#### Scenario: Workspace synchronizes one World

- **WHEN** World commits a new global version and returns its exact receipt
- **THEN** Project updates only that local World's synchronization metadata
- **AND** no Content output, Character output or Project publication is created
