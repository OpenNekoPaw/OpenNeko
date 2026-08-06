## ADDED Requirements

### Requirement: Required Media Libraries are derived from authoritative project references

The system SHALL derive required Media Library names and descendants from canonical, portable
`ContentLocator` references supplied by the owning project-document domains. It MUST NOT persist a
required-library manifest, `library.json`, physical target, global library ID, or alternate runtime
mapping in the project.

#### Scenario: Open a synchronized project without local links

- **WHEN** synchronized project facts contain `neko/assets/Footage/shot-01.mov` and no local
  `neko/assets/Footage` link exists
- **THEN** the project reports `Footage` as required and unlinked with the owning reference count
- **AND** it does not scan arbitrary files, guess a target, or expose a physical path

#### Scenario: Linked library has no durable project references

- **WHEN** a valid linked library exists but no authoritative project owner references it
- **THEN** it remains browsable as an unreferenced linked library
- **AND** it is not included in the required-library set or portable snapshot byte plan

#### Scenario: Reference coverage is incomplete

- **WHEN** a persisted project-document kind has no registered authoritative reference reader
- **THEN** portability readiness returns `coverage-incomplete`
- **AND** it does not claim that the project is fully linked or portable

#### Scenario: Canvas contains a non-canonical workspace path

- **WHEN** an NKC Media or File node lacks a canonical `ContentLocator` and
  contains a normalized workspace-relative legacy path but no `ContentLocator`
- **THEN** the NKC load boundary rejects that document record and leaves its bytes unchanged
- **AND** absolute paths, runtime URLs, malformed paths, and unknown document schemas remain invalid
  instead of being accepted as compatibility fallback

#### Scenario: One Canvas document is invalid

- **WHEN** an NKC document cannot be parsed or validated through the owning codec
- **THEN** reference aggregation records a bounded owner diagnostic and marks Canvas coverage
  incomplete while continuing to inspect other owners and filesystem library roots
- **AND** recovery and portability never treat the unread document as complete reference coverage

### Requirement: Local persistence does not duplicate link or project authority

The system SHALL keep the OS symlink/junction as the only Media Library target mapping and SHALL keep
project references in their owning project files. It MUST NOT create or retain a Media Library JSON
manifest, workspace SQLite database, absolute target row, global registry root row, or alternate
resolver. Rebuildable freshness/diagnostics and referenced-media probe cache MAY use the existing
workspace-partitioned user-level local metadata repositories, but current link availability MUST be
recomputed from OS inspection.

#### Scenario: Requirement projection is rebuilt after clone

- **WHEN** a synchronized workspace opens without local links or cached local metadata
- **THEN** the requirement set is rebuilt from authoritative project references
- **AND** no JSON manifest, target row, or workspace database is required

#### Scenario: Cached projection disagrees with current project facts

- **WHEN** a stored projection fingerprint is stale relative to any authoritative owner/source fingerprint
- **THEN** the cached projection is marked stale and current requirements are rebuilt from project
  facts
- **AND** cached membership or availability cannot authorize recovery

#### Scenario: User-level SQLite is unavailable

- **WHEN** a durable projection or snapshot task operation cannot access the compatible user-level
  local metadata store
- **THEN** the operation returns an explicit diagnostic or marks rebuildable cache state stale
- **AND** it does not fall back to a parallel JSON cache or report a durable checkpoint as committed

#### Scenario: Workspace identity survives local metadata repair

- **WHEN** local metadata is repaired or rebuilt
- **THEN** `.neko/workspace.json` remains the lightweight workspace identity descriptor
- **AND** it is not replaced by a workspace database or deleted as a redundant JSON file

### Requirement: Link state distinguishes each recoverable boundary

The system SHALL distinguish available, required-unlinked, missing global connection, unavailable
target, incomplete content, entry conflict, and unreferenced-linked states. Diagnostics MUST remain
target-free and MUST NOT convert an illegal or unknown state into an empty successful library.

#### Scenario: Machine-global alias is missing

- **WHEN** the project link exists but its machine-global Media Library alias has been removed
- **THEN** the library reports `global-connection-missing`
- **AND** it does not report the physical target or fall back to a similarly named directory

#### Scenario: Referenced descendant is absent

- **WHEN** a managed link resolves inside its target but at least one authoritative referenced
  descendant is missing
- **THEN** the library reports `content-incomplete` with bounded missing counts
- **AND** unrelated readable files do not make the requirement appear satisfied

#### Scenario: Workspace entry is not a managed link

- **WHEN** a real file or directory occupies `neko/assets/<libraryName>`
- **THEN** recovery reports `entry-conflict` and refuses to replace or delete that entry

### Requirement: Recovery uses an immutable exact-name plan

Media Library recovery SHALL create an immutable request-owned plan before mutation. The plan MUST use
an exact library-name match, validate all authoritative referenced descendants through the existing
containment guard, and require explicit user confirmation before creating or replacing a workspace
link.

#### Scenario: Recover from an available global connection

- **WHEN** exactly one available machine-global Media Library has the required name and contains all
  referenced descendants
- **THEN** recovery offers that candidate without projecting its target
- **AND** confirmed apply points the workspace link at the global alias

#### Scenario: Exact-name candidate is structurally wrong

- **WHEN** a same-named global connection lacks one or more required descendants or escapes its
  contained target
- **THEN** planning fails visibly and no workspace link is changed

#### Scenario: User selects a new directory

- **WHEN** no valid global connection exists and the user explicitly selects a directory
- **THEN** Desktop registers a machine-global connection, validates the same requirement, and links
  the project only after confirmation
- **AND** a failed project-link step removes only the newly created global connection

#### Scenario: Recovery is cancelled or stale

- **WHEN** the picker or confirmation is cancelled, or any project/owner/link fingerprint changes before
  apply
- **THEN** recovery changes neither global connections nor workspace links
- **AND** stale apply fails visibly instead of rebuilding and applying an implicit plan

### Requirement: New Desktop links use the global alias topology

New Desktop add and relink operations SHALL target the managed machine-global Media Library alias so
one global relink can repair every participating project. Existing direct-to-physical project links
MUST remain readable and MUST NOT be normalized without explicit confirmation.

#### Scenario: Relink a project library through Desktop

- **WHEN** the user confirms a replacement directory for a project Media Library
- **THEN** Desktop creates or updates the machine-global connection and atomically points the project
  link at that alias
- **AND** project `ContentLocator` values remain unchanged

#### Scenario: Inspect an existing direct link

- **WHEN** a valid project link points directly at a physical directory
- **THEN** reads continue through the existing content boundary
- **AND** the UI may offer explicit normalization but does not mutate the link during project open

### Requirement: Portability readiness does not conflate references with bytes

The system SHALL report whether project references are currently readable, require machine-local
relink, or have been materialized into a completed portable snapshot. It MUST NOT claim that normal
Git or folder synchronization includes linked Media Library bytes.

#### Scenario: Linked project is ready only on the current machine

- **WHEN** every required linked reference is readable but no portable snapshot has been created
- **THEN** readiness reports `linked-ready`
- **AND** it states through structured status that another machine may require relink

#### Scenario: Project requires relink after clone

- **WHEN** project references are valid but their required workspace links are absent
- **THEN** readiness reports `sync-requires-relink` with the required library names and counts

### Requirement: Portable collection publishes an atomic independent snapshot

The system SHALL create a portable project snapshot in a new destination by collecting only
authoritative referenced linked media, rewriting staged project documents to project-owned paths,
and publishing the destination only after complete validation. It MUST NOT mutate the source project
or external Media Library.

#### Scenario: Collect a referenced linked file

- **WHEN** a project references `neko/assets/Footage/shots/a.mov` and the user creates a portable
  snapshot
- **THEN** the snapshot contains the verified bytes at a deterministic project-owned media path
- **AND** the staged owning document references that collected path rather than the linked locator

#### Scenario: Multiple owners reference identical content

- **WHEN** multiple project facts reference the same locator and fingerprint
- **THEN** collection writes one destination byte sequence and rewrites every staged owner reference
  consistently

#### Scenario: Collection encounters stale or missing content

- **WHEN** an owner revision changes, a linked byte becomes unavailable, a fingerprint conflicts, or
  a staged rewrite fails
- **THEN** the temporary snapshot is removed and no final destination is published
- **AND** source project facts and external target contents remain unchanged

#### Scenario: Linked library contains unreferenced media

- **WHEN** a linked library contains files that no authoritative project owner references
- **THEN** those files are not copied into the portable snapshot

### Requirement: Resumable collection uses the existing task ledger

Portable snapshot work that must survive process restart SHALL use the existing user-level `tasks`
and `task_checkpoints` repositories with explicit workspace identity and canonical typed payloads. It
MUST NOT introduce a job JSON file or a Media Library-specific task table.

#### Scenario: Snapshot checkpoint is persisted

- **WHEN** collection reaches a resumable boundary
- **THEN** the task ledger stores only lifecycle state and the minimum validated recovery cursor
- **AND** the checkpoint contains no media bytes, full project documents, credentials, symlink
  targets, or runtime URLs

#### Scenario: Checkpoint commit fails

- **WHEN** the task checkpoint cannot be committed before reporting resumability
- **THEN** the operation fails visibly or remains explicitly non-resumable
- **AND** it does not write a JSON fallback or claim that restart recovery is available

### Requirement: Recovery and collection remain inside existing trust boundaries

All requirement validation, recovery, and collection reads SHALL use the existing workspace
content-access and direct-link realpath containment boundary. Renderer contracts MUST NOT expose
absolute paths, global registry roots, `file:` URLs, cache paths, temporary paths, credentials, or
Engine tokens.

#### Scenario: Nested symlink escapes a library

- **WHEN** a referenced descendant resolves through a nested link outside the top-level library target
- **THEN** recovery and collection both fail closed before returning bytes or changing state

#### Scenario: Renderer requests recovery

- **WHEN** the project Resource Browser submits a recovery intent
- **THEN** it sends only project identity, library name, request/plan identity, and user choice
- **AND** Desktop Main owns candidate resolution, native directory authorization, and mutation
