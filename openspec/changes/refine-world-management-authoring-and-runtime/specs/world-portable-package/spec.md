## ADDED Requirements

### Requirement: A portable World package is an explicit ZIP transport container

OpenNeko SHALL support an explicitly imported or exported `.neko-world` ZIP only for portable World authoring transfer. The archive SHALL contain one strict manifest, one entry WorldProject, a bounded snapshot of selected canonical World records and an explicit dependency/resource inventory. The manifest SHALL identify included user-domain WorldVersion identities and integrity metadata without adding an internal schema/format version or alternate contract generation. Archive location, package identity, open state and entries MUST NOT become durable World facts, live repository keys, runtime references, mounts, watchers, synchronization sources or product installation authority.

#### Scenario: User exports a World package

- **WHEN** the user selects one exact WorldProject, selected WorldVersions, an asset inclusion policy and an authorized destination
- **THEN** World produces one `.neko-world` archive with a strict manifest and bounded canonical snapshot
- **AND** export does not publish remotely, start a Run, create a Save or register the ZIP as a repository

#### Scenario: User inspects an exported package later

- **WHEN** the source WorldProject is subsequently edited or finalized again
- **THEN** the archive remains an inert snapshot of the identities and bytes selected at export time
- **AND** no live watcher, mount or synchronization operation updates it

### Requirement: World export includes authoring facts and explicit dependencies only

The export scope SHALL include the entry WorldProject, user-selected immutable WorldVersions and only explicitly selected World-owned supporting records. Exact CharacterVersion, Entity, Asset, Content and other owner references SHALL be recorded as external dependencies unless their owning authority explicitly permits bounded embedding and the user selects that policy. WorldRun, WorldSave, branch, checkpoint, event log, WorldState, Agent transcript, credential, provider configuration, cache, opaque URL, runtime token and raw absolute path MUST NOT enter `.neko-world`.

#### Scenario: World references a CharacterVersion and external media

- **WHEN** the selected WorldVersion references one exact CharacterVersion and one media resource that is not authorized for embedding
- **THEN** the manifest records both as unresolved or external owner-qualified dependencies
- **AND** the archive does not copy Character facts, media bytes or host paths

#### Scenario: User authorizes an embeddable resource

- **WHEN** the owning resource authority permits export and the user includes that exact bounded resource
- **THEN** the archive stores it under a safe relative asset path and records owner kind, media kind, byte length and integrity digest
- **AND** unrelated Project or library resources are not scanned or copied

#### Scenario: World has existing Saves

- **WHEN** the exported WorldProject or WorldVersion has related WorldRuns, WorldSaves or branches
- **THEN** the export preview reports that runtime records are excluded from `.neko-world`
- **AND** those records remain unchanged in their runtime repository

### Requirement: Export preview is exact and fail-visible

Before writing an archive, World SHALL present an export preview containing the exact entry WorldProject, selected WorldVersions, included owned records, embedded resources, external dependencies, unresolved dependencies, estimated bounds and destination authorization. Missing required records, unresolved containment, unauthorized resources or an invalid selection SHALL reject only that export request and MUST NOT silently shrink the selected semantic scope, choose another version or substitute a cached copy.

#### Scenario: A selected WorldVersion is unavailable

- **WHEN** export cannot resolve one explicitly selected WorldVersion from canonical authority
- **THEN** preview identifies that exact missing identity and export remains unavailable
- **AND** the service does not choose latest, another branch, the current draft or an older projection

### Requirement: Import treats the archive as untrusted input

World Host/Node SHALL validate archive containment, entry count, compressed and expanded size, duplicate paths, path normalization, symlinks, compression behavior, manifest inventory, canonical record codecs, exact identities, declared ownership and integrity digests before any destination write. Validation failure SHALL reject the current archive with an actionable diagnostic and release readers/temporary bytes without changing existing World facts.

#### Scenario: Archive contains a traversal or duplicate entry

- **WHEN** `.neko-world` contains `../` traversal, an absolute path, a symlink or duplicate normalized paths
- **THEN** import rejects the archive before destination mutation
- **AND** existing standalone and project-local World records remain unchanged

#### Scenario: Archive record fails its canonical codec

- **WHEN** one included WorldProject or WorldVersion does not satisfy the current single canonical contract
- **THEN** validation rejects that package and reports the exact record diagnostic
- **AND** it does not select a compatibility decoder, repair the record or import valid siblings as partial success

### Requirement: Install and editing import are distinct exact commands

After validation, World SHALL present distinct `Install for use` and `Import into Project for editing` previews with exact included WorldVersions/resources, dependencies, eligibility, and conflicts. Installation SHALL commit only exact eligible immutable WorldVersions and bounded resources to the installed library. Editing import SHALL require one exact Project-bound Creative Workspace and commit mutable WorldProject records through the canonical World repository. Neither command may execute in place, overwrite, merge, rename, remap identities, infer active/recent authority, bind to the selected management record, or fall back to the other command.

#### Scenario: User installs a usable World package

- **WHEN** validation succeeds and the user confirms exact eligible WorldVersions and bounded resources
- **THEN** World atomically commits one immutable installed-release catalog entry
- **AND** no WorldProject, Project membership, Run, or Save is created

#### Scenario: User imports into a Project for editing

- **WHEN** validation succeeds, the user authorizes one exact Project Creative Workspace, and confirms the conflict-free editing preview
- **THEN** World writes the canonical mutable files below that authority and Project records exact local membership
- **AND** no installed-library entry is created as a side effect

#### Scenario: Exact identity already exists

- **WHEN** the destination already contains the entry WorldProject or any included WorldVersion identity
- **THEN** preview reports the conflict and commit is disabled
- **AND** import does not overwrite, merge, rename or generate replacement identities

### Requirement: Portable package resources have a bounded lifecycle

Archive readers, temporary directories, preview bytes and destination write handles SHALL be owned by one import/export operation and released on completion, rejection, cancellation or sender/window invalidation. Completion MUST NOT retain a recent-package authority, background synchronization task, watcher or package binding. A failed embedded resource SHALL fail the affected package operation before commit rather than producing a falsely self-contained archive.

#### Scenario: User cancels import after preview

- **WHEN** the user cancels before destination commit
- **THEN** World releases the archive reader and temporary bytes
- **AND** no WorldProject, membership, recent package, mount or runtime record is created
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** The successor replaces the standalone/project-local destination union with explicit install-for-use and import-into-Project commands. Archive security, bounded resources, canonical identities, and no live ZIP authority remain applicable.
