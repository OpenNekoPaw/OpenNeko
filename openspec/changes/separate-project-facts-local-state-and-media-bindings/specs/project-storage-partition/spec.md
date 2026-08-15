## ADDED Requirements

### Requirement: Project storage has three non-overlapping scopes

The product SHALL classify synchronized project facts and owned bytes, disposable project-local
`.neko/` state, and user-global `~/.neko/` state as separate authorities. Each datum MUST have one owning
package and one canonical scope; no producer may dual-write the same authority across these scopes.

#### Scenario: Package introduces new project-related persistence

- **WHEN** a package proposes a durable record used while a Workspace is open
- **THEN** its storage contract declares whether the record is a synchronized fact, disposable
  checkout-local state, or user-global state
- **AND** the quality gate rejects an unowned generic config record or a second authority

### Requirement: Project-local state is disposable and initializes canonically

Every canonical record below project `.neko/` SHALL define a package-owned strict codec, current
canonical default, initialization condition, deletion behavior, and identity-scoped diagnostic. Deleting
the entire directory MUST NOT lose, invent, overwrite, or mutate Project, Character, World, Entity,
Asset, document, Conversation, task, or other user facts.

#### Scenario: Project local directory is absent

- **WHEN** a synchronized project is opened without a `.neko/` directory
- **THEN** each required local owner initializes only its current empty/default local state
- **AND** project identity and user facts are read from their synchronized owners without replacement

#### Scenario: One local record is malformed

- **WHEN** one package-owned `.neko` record is malformed beside valid sibling records
- **THEN** the owner preserves and diagnoses the malformed record and initializes only that record's
  effective local state
- **AND** valid siblings and unrelated project capabilities remain available

### Requirement: Project identity never depends on local state

Stable Project/Workspace identity SHALL remain a synchronized Project fact. Project `.neko/`, an
absolute checkout path, user-global SQLite row, active Scene, or current Window MUST NOT become the
identity authority or generate a replacement identity when the synchronized fact is unavailable.

#### Scenario: Project identity fact is missing

- **WHEN** `neko/project.json` cannot supply a valid exact Project identity
- **THEN** Project-owned operations report an exact invalid Project diagnostic and preserve stored bytes
- **AND** deleting or initializing `.neko` does not fabricate a new Project identity

### Requirement: Product sync and package exclude local state

Product-owned sync and package code MUST exclude root `.neko/` before traversal, including every sync
enumerator, package/export builder, portable snapshot copier, and project-file contributor, and MUST NOT
follow links, serialize records,
publish bytes, or compute project identity from that subtree. Correctness MUST NOT depend only on Git
ignore configuration.

#### Scenario: Portable package is built from a project with local state

- **WHEN** `.neko/` contains valid bindings, presentation snapshots, cache files, and unknown files
- **THEN** none of those paths or bytes appear in the staged or published package
- **AND** the source directory remains unchanged

#### Scenario: Folder synchronization is planned by the product

- **WHEN** the project is not a Git repository or Git ignore inspection fails
- **THEN** the product sync plan still excludes `.neko/`
- **AND** it does not weaken the exclusion or copy local state as ordinary files

### Requirement: Project facts reject local and physical values

Project fact codecs SHALL reject `.neko` locators, absolute paths, file URLs, physical Media Library
targets, user-global connection identities, credential identifiers, native authorization handles,
runtime URLs, and cache/materialized paths. Diagnostics and Renderer projections MUST remain target-free.

#### Scenario: Project writer receives a local binding path

- **WHEN** a producer attempts to persist `.neko/media-libraries/Footage` or a resolved native target in
  a project document
- **THEN** the owning codec rejects the current record before commit
- **AND** no project file, diagnostic, Renderer state, Agent payload, sync plan, or package output receives
  the local value

### Requirement: Generic resource mutations protect package-owned storage

Resource Browser Files operations SHALL reserve `neko/` and `.neko/` from generic rename, trash,
copy-over, and import-destination operations. User facts in reserved storage MUST be mutated only by the
owning domain application service; `.neko` lifecycle actions MUST be explicit local-state operations.

#### Scenario: User selects a Project fact through Files

- **WHEN** a generic file mutation targets a path below `neko/`
- **THEN** Resource Browser rejects the operation with an owner-qualified diagnostic
- **AND** it does not invoke the generic filesystem writer or trash adapter
